from pathlib import Path

import requests

from app.core.config import get_settings

settings = get_settings()
BLOCKED_MODELS = {"deepseek-r1:8b"}
_runtime_provider: str = settings.llm_provider.lower().strip() or "ollama"
_runtime_model: str | None = None
_runtime_openai_key: str = settings.openai_api_key
_runtime_openai_model: str = settings.openai_model
_runtime_gemini_key: str = settings.gemini_api_key
_runtime_gemini_model: str = settings.gemini_model
_runtime_ollama_model: str = settings.ollama_model or "gpt-oss:120b-cloud"
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"

if _runtime_ollama_model in BLOCKED_MODELS:
    _runtime_ollama_model = "gpt-oss:120b-cloud"


def get_llm_identity() -> tuple[str, str]:
    provider = _runtime_provider
    if provider == "openai":
        return "openai", _runtime_model or _runtime_openai_model
    if provider == "gemini":
        return "gemini", _runtime_model or _runtime_gemini_model
    return "ollama", _runtime_model or _runtime_ollama_model


def get_llm_config() -> dict:
    provider, model = get_llm_identity()
    return {
        "provider": provider,
        "current_model": model,
        "openai_model": _runtime_openai_model,
        "gemini_model": _runtime_gemini_model,
        "ollama_model": _runtime_ollama_model,
        "ollama_available": bool(_list_ollama_models()),
        "openai_configured": bool(_runtime_openai_key),
        "gemini_configured": bool(_runtime_gemini_key),
    }


def set_llm_config(payload: dict) -> dict:
    global _runtime_provider, _runtime_model, _runtime_openai_key, _runtime_openai_model, _runtime_gemini_key, _runtime_gemini_model, _runtime_ollama_model

    provider = str(payload.get("provider", _runtime_provider)).lower().strip()
    if provider not in {"ollama", "openai", "gemini"}:
        raise ValueError("provider must be ollama/openai/gemini")

    if payload.get("openai_api_key") is not None:
        _runtime_openai_key = str(payload.get("openai_api_key") or "").strip()
    if payload.get("openai_model"):
        _runtime_openai_model = str(payload.get("openai_model")).strip()

    if payload.get("gemini_api_key") is not None:
        _runtime_gemini_key = str(payload.get("gemini_api_key") or "").strip()
    if payload.get("gemini_model"):
        _runtime_gemini_model = str(payload.get("gemini_model")).strip()

    if payload.get("model"):
        requested_model = str(payload.get("model")).strip()
    else:
        requested_model = ""

    if provider == "openai" and not _runtime_openai_key:
        raise ValueError("OPENAI_API_KEY is not configured")
    if provider == "gemini" and not _runtime_gemini_key:
        raise ValueError("GEMINI_API_KEY is not configured")

    if provider == "ollama":
        if requested_model:
            _runtime_ollama_model = requested_model
        elif _runtime_model:
            _runtime_ollama_model = _runtime_model
        _runtime_model = _runtime_ollama_model
    elif provider == "openai":
        _runtime_model = requested_model or _runtime_openai_model
        _runtime_openai_model = _runtime_model
    else:
        _runtime_model = requested_model or _runtime_gemini_model
        _runtime_gemini_model = _runtime_model

    _runtime_provider = provider

    if bool(payload.get("persist", True)):
        _upsert_env(
            {
                "LLM_PROVIDER": _runtime_provider,
                "OLLAMA_MODEL": _runtime_ollama_model,
                "OPENAI_MODEL": _runtime_openai_model,
                "GEMINI_MODEL": _runtime_gemini_model,
                "OPENAI_API_KEY": _runtime_openai_key,
                "GEMINI_API_KEY": _runtime_gemini_key,
            }
        )

    return get_llm_config()


def list_llm_models() -> dict:
    provider, current_model = get_llm_identity()
    if provider != "ollama":
        return {
            "provider": provider,
            "current_model": current_model,
            "models": [current_model],
            "can_switch": True,
        }

    models = [m for m in _list_ollama_models() if m not in BLOCKED_MODELS]
    if current_model not in models and current_model and current_model not in BLOCKED_MODELS:
        models = [current_model, *models]

    return {
        "provider": provider,
        "current_model": current_model,
        "models": models,
        "can_switch": True,
    }


def select_llm_model(model: str) -> dict:
    global _runtime_model
    model = model.strip()
    if not model:
        raise ValueError("model cannot be empty")
    if model in BLOCKED_MODELS:
        raise ValueError(f"model '{model}' is disabled")

    provider, _ = get_llm_identity()
    if provider == "ollama":
        available = _list_ollama_models()
        if available and model not in available:
            raise ValueError(f"model '{model}' not found in local ollama")

    _runtime_model = model
    if provider == "ollama":
        _upsert_env({"OLLAMA_MODEL": model})
    elif provider == "openai":
        _upsert_env({"OPENAI_MODEL": model})
    elif provider == "gemini":
        _upsert_env({"GEMINI_MODEL": model})
    return list_llm_models()


def chat_with_llm(system_prompt: str, user_prompt: str) -> str:
    provider, _ = get_llm_identity()
    if provider == "openai":
        result = _call_openai(system_prompt, user_prompt)
        if result:
            return result
    elif provider == "gemini":
        result = _call_gemini(system_prompt, user_prompt)
        if result:
            return result
    return _call_ollama(system_prompt, user_prompt) or "No response from LLM provider."


def _call_openai(system_prompt: str, user_prompt: str) -> str | None:
    if not _runtime_openai_key:
        return None
    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": get_llm_identity()[1],
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.2,
            },
            timeout=180,
        )
        response.raise_for_status()
        data = response.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content")
    except Exception:
        return None


def _call_gemini(system_prompt: str, user_prompt: str) -> str | None:
    if not _runtime_gemini_key:
        return None
    model = get_llm_identity()[1]
    try:
        response = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={_runtime_gemini_key}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {
                                "text": f"System instruction:\n{system_prompt}\n\nUser request:\n{user_prompt}",
                            }
                        ],
                    }
                ]
            },
            timeout=180,
        )
        response.raise_for_status()
        data = response.json()
        candidates = data.get("candidates", [])
        if not candidates:
            return None
        parts = candidates[0].get("content", {}).get("parts", [])
        if not parts:
            return None
        return parts[0].get("text")
    except Exception:
        return None


def _call_ollama(system_prompt: str, user_prompt: str) -> str | None:
    try:
        _, model = get_llm_identity()
        response = requests.post(
            f"{settings.ollama_url}/api/generate",
            json={
                "model": model,
                "prompt": f"{system_prompt}\n\n{user_prompt}",
                "stream": False,
            },
            timeout=180,
        )
        response.raise_for_status()
        data = response.json()
        return data.get("response")
    except Exception:
        return None


def _list_ollama_models() -> list[str]:
    try:
        response = requests.get(f"{settings.ollama_url}/api/tags", timeout=15)
        response.raise_for_status()
        data = response.json()
        return [x.get("name") for x in data.get("models", []) if x.get("name")]
    except Exception:
        return []


def _upsert_env(entries: dict[str, str]) -> None:
    lines: list[str] = []
    if ENV_PATH.exists():
        lines = ENV_PATH.read_text(encoding="utf-8").splitlines()

    key_to_idx: dict[str, int] = {}
    for i, line in enumerate(lines):
        if "=" in line and not line.strip().startswith("#"):
            key = line.split("=", 1)[0].strip()
            key_to_idx[key] = i

    for key, value in entries.items():
        new_line = f"{key}={value}"
        if key in key_to_idx:
            lines[key_to_idx[key]] = new_line
        else:
            lines.append(new_line)

    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
