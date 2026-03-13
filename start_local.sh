#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
CONFIG_LOG="$LOG_DIR/config_meta.log"
RUN_LOG="$LOG_DIR/runtime.log"
BACKEND_ENV="$ROOT_DIR/backend/.env"

mkdir -p "$LOG_DIR"

timestamp() {
  date "+%Y-%m-%d %H:%M:%S"
}

log_config() {
  printf "[%s] %s\n" "$(timestamp)" "$1" >> "$CONFIG_LOG"
}

ask_yes_no() {
  local prompt="$1"
  local default="${2:-Y}"
  local hint="[Y/n]"
  if [ "$default" = "N" ]; then
    hint="[y/N]"
  fi

  while true; do
    read -r -p "$prompt $hint " ans
    if [ -z "$ans" ]; then
      ans="$default"
    fi
    case "${ans,,}" in
      y|yes)
        return 0
        ;;
      n|no)
        return 1
        ;;
      *)
        printf "请输入 y 或 n。\n"
        ;;
    esac
  done
}

ensure_env_file() {
  if [ -f "$BACKEND_ENV" ]; then
    return 0
  fi

  printf "未检测到 backend/.env。\n"
  if ask_yes_no "现在从 .env.example 创建配置文件吗？" "Y"; then
    if [ -f "$ROOT_DIR/.env.example" ]; then
      cp "$ROOT_DIR/.env.example" "$BACKEND_ENV"
      log_config "Created backend/.env from .env.example"
      printf "已创建 backend/.env。\n"
    else
      printf "找不到 .env.example，请手动创建 backend/.env。\n"
      exit 1
    fi
  else
    printf "已取消启动，请先配置 backend/.env。\n"
    exit 1
  fi
}

configure_llm_if_needed() {
  set -a
  # shellcheck disable=SC1090
  source "$BACKEND_ENV"
  set +a

  local provider="${LLM_PROVIDER:-ollama}"
  local need_config="false"

  if [ "$provider" = "ollama" ]; then
    if ! command -v ollama >/dev/null 2>&1; then
      printf "未检测到 ollama 命令。\n"
      need_config="true"
    fi
  elif [ "$provider" = "openai" ] && [ -z "${OPENAI_API_KEY:-}" ]; then
    need_config="true"
  elif [ "$provider" = "gemini" ] && [ -z "${GEMINI_API_KEY:-}" ]; then
    need_config="true"
  fi

  if [ "$need_config" != "true" ]; then
    return 0
  fi

  printf "检测到 LLM 可能未配置完整（当前 provider=%s）。\n" "$provider"
  if ! ask_yes_no "是否现在进行 LLM 配置？" "Y"; then
    log_config "LLM setup skipped by user"
    return 0
  fi

  read -r -p "请选择 provider (ollama/openai/gemini) [ollama]: " provider_input
  provider_input="${provider_input:-ollama}"

  if [ "$provider_input" = "ollama" ]; then
    read -r -p "OLLAMA_URL [http://localhost:11434]: " ollama_url
    read -r -p "OLLAMA_MODEL [gpt-oss:120b-cloud]: " ollama_model
    ollama_url="${ollama_url:-http://localhost:11434}"
    ollama_model="${ollama_model:-gpt-oss:120b-cloud}"

    perl -0777 -i -pe "s#^LLM_PROVIDER=.*#LLM_PROVIDER=ollama#m; s#^OLLAMA_URL=.*#OLLAMA_URL=$ollama_url#m; s#^OLLAMA_MODEL=.*#OLLAMA_MODEL=$ollama_model#m" "$BACKEND_ENV"
  elif [ "$provider_input" = "openai" ]; then
    read -r -p "OPENAI_API_KEY: " openai_key
    read -r -p "OPENAI_MODEL [gpt-4o-mini]: " openai_model
    openai_model="${openai_model:-gpt-4o-mini}"
    perl -0777 -i -pe "s#^LLM_PROVIDER=.*#LLM_PROVIDER=openai#m; s#^OPENAI_API_KEY=.*#OPENAI_API_KEY=$openai_key#m; s#^OPENAI_MODEL=.*#OPENAI_MODEL=$openai_model#m" "$BACKEND_ENV"
  elif [ "$provider_input" = "gemini" ]; then
    read -r -p "GEMINI_API_KEY: " gemini_key
    read -r -p "GEMINI_MODEL [gemini-1.5-flash]: " gemini_model
    gemini_model="${gemini_model:-gemini-1.5-flash}"
    perl -0777 -i -pe "s#^LLM_PROVIDER=.*#LLM_PROVIDER=gemini#m; s#^GEMINI_API_KEY=.*#GEMINI_API_KEY=$gemini_key#m; s#^GEMINI_MODEL=.*#GEMINI_MODEL=$gemini_model#m" "$BACKEND_ENV"
  fi

  log_config "LLM configured: provider=$provider_input"
}

check_and_report() {
  local py_ok="no"
  local node_ok="no"
  local npm_ok="no"
  local ollama_ok="no"

  command -v python3 >/dev/null 2>&1 && py_ok="yes"
  command -v node >/dev/null 2>&1 && node_ok="yes"
  command -v npm >/dev/null 2>&1 && npm_ok="yes"
  if command -v ollama >/dev/null 2>&1; then
    ollama_ok="yes"
  fi

  printf "\n========== 启动前检查 =========="
  printf "\npython3: %s" "$py_ok"
  printf "\nnode:    %s" "$node_ok"
  printf "\nnpm:     %s" "$npm_ok"
  printf "\nollama:  %s\n" "$ollama_ok"

  log_config "Prereq check python3=$py_ok node=$node_ok npm=$npm_ok ollama=$ollama_ok"

  if [ "$py_ok" != "yes" ] || [ "$node_ok" != "yes" ] || [ "$npm_ok" != "yes" ]; then
    printf "缺少必要依赖，请先安装 python3/node/npm。\n"
    exit 1
  fi
}

check_and_report
ensure_env_file
configure_llm_if_needed

if [ ! -d "$ROOT_DIR/.venv" ]; then
  printf "未检测到 .venv。\n"
  if ask_yes_no "是否现在创建 Python 虚拟环境？" "Y"; then
    python3 -m venv "$ROOT_DIR/.venv"
    log_config "Created .venv"
  else
    printf "已取消启动。\n"
    exit 1
  fi
fi

source "$ROOT_DIR/.venv/bin/activate"

backend_deps_ok="yes"
if ! "$ROOT_DIR/.venv/bin/python" - <<'PY' >/dev/null 2>&1
import fastapi
import sqlalchemy
import feedparser
import requests
import apscheduler
print("ok")
PY
then
  backend_deps_ok="no"
fi

if [ "$backend_deps_ok" = "no" ]; then
  printf "检测到后端依赖缺失。\n"
  if ask_yes_no "是否现在安装后端依赖（pip install）？" "Y"; then
    pip install -r "$ROOT_DIR/backend/requirements.txt"
    log_config "Installed backend dependencies"
  else
    printf "已取消启动。\n"
    exit 1
  fi
else
  log_config "Backend dependencies check passed"
fi

if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
  if ask_yes_no "未检测到前端依赖，是否现在安装（npm install）？" "Y"; then
    npm --prefix "$ROOT_DIR/frontend" install
    log_config "Installed frontend dependencies"
  else
    printf "已取消启动。\n"
    exit 1
  fi
else
  log_config "Frontend dependencies check passed"
fi

printf "\n日志文件:\n- 配置报告: %s\n- 运行日志: %s\n\n" "$CONFIG_LOG" "$RUN_LOG"
log_config "Startup accepted by user"

cleanup() {
  if [ -n "${BACK_PID:-}" ]; then
    kill "$BACK_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

(cd "$ROOT_DIR/backend" && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload 2>&1 | tee -a "$RUN_LOG") &
BACK_PID=$!

open_browser() {
  sleep 2
  if command -v open >/dev/null 2>&1; then
    open "http://localhost:5173"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:5173"
  fi
}

open_browser &

npm --prefix "$ROOT_DIR/frontend" run dev 2>&1 | tee -a "$RUN_LOG"
