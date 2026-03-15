# NewsRoom - Beginner-Safe Installation Guide (Linux/macOS)

NewsRoom is a local-first news aggregation and analysis workspace designed for research and monitoring workflows.

- Aggregates multi-source RSS feeds and stores normalized records locally
- Provides region/topic filtering with incremental refresh in the frontend
- Includes an integrated LLM analysis panel (Ollama / OpenAI / Gemini)
- Ships with guided startup/uninstall scripts for safe local operation
- Supports configurable runtime endpoints (`BACKEND_PORT`, `FRONTEND_PORT`, `VITE_API_BASE`)

Language switch:

- English (current)
- 简体中文: `README.zh-CN.md`
- Deutsch: `README.de-DE.md`

## 1) What this project is

NewsRoom is a local news aggregation + LLM analysis app.

- Backend: FastAPI + SQLite
- Frontend: React + Vite
- Startup script: `start_local.sh`
- Default local URLs:
  - Frontend: `http://localhost:5173`
  - Backend API docs: `http://localhost:8000/docs`

## 2) Safety-first notes (read this first)

- Do **not** run this project as root.
- Do **not** commit `backend/.env`.
- API keys are only stored locally in `backend/.env`.
- `start_local.sh` does not auto-run `sudo` system installs.
- If dependencies are missing, the script prints install commands, then exits.

## 3) Fresh Linux machine (zero-prep) installation

### 3.1 Install base tools

Ubuntu/Debian:

```bash
# Update package index
sudo apt-get update
# Install git, curl, Python and Node.js toolchain
sudo apt-get install -y git curl python3 python3-venv python3-pip nodejs npm
```

Fedora:

```bash
# Install required base tools
sudo dnf install -y git curl python3 python3-virtualenv nodejs npm
```

Arch:

```bash
# Install required base tools
sudo pacman -S --needed git curl python nodejs npm
```

### 3.2 Clone and run

If you already use SSH keys with GitHub:

```bash
# Clone the repository over SSH
git clone git@github.com:SinuoZhang/NewsRoom.git
# Enter project directory
cd NewsRoom
# Ensure startup script is executable
chmod +x start_local.sh
# Launch guided startup
./start_local.sh
```

If SSH is not configured yet (beginner-friendly HTTPS):

```bash
# Clone the repository over HTTPS
git clone https://github.com/SinuoZhang/NewsRoom.git
# Enter project directory
cd NewsRoom
# Ensure startup script is executable
chmod +x start_local.sh
# Launch guided startup
./start_local.sh
```

Optional language shortcut:

```bash
# Force English prompts for this run
./start_local.sh --lang en
# Force Chinese prompts for this run
./start_local.sh --lang zh
# Force German prompts for this run
./start_local.sh --lang de
```

## 4) First-run behavior

On first run, `start_local.sh` will:

1. Ask your preferred UI language (saved to `backend/.env` as `STARTUP_LANG`)
2. Check runtime versions (`python3>=3.10`, `node>=18`, `npm`)
3. Create `backend/.env` from `.env.example` if needed
4. Optionally guide LLM provider setup (Ollama/OpenAI/Gemini)
5. Create `.venv`
6. Install backend/frontend dependencies (with your confirmation)
7. Start backend + frontend

On later runs (already configured), it reuses your saved language automatically.

## 5) LLM provider setup

You can choose one provider:

- `ollama` (local or cloud)
- `openai`
- `gemini`

The script asks interactively if your provider is incomplete.

Manual config file: `backend/.env`

```env
LLM_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gpt-oss:120b-cloud

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
```

## 5.1) Override ports and API base (optional)

You can override startup ports in `backend/.env`:

```env
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
FRONTEND_HOST=0.0.0.0
FRONTEND_PORT=5173
VITE_API_BASE=http://localhost:8000
```

- `BACKEND_PORT` overrides uvicorn port.
- `FRONTEND_PORT` overrides Vite dev server port.
- `VITE_API_BASE` lets frontend call any API endpoint (local or remote).

## 6) Daily usage

Start:

```bash
# Start backend + frontend with guided checks
./start_local.sh
```

Stop:

- Press `Ctrl+C` in the terminal where script is running.

Logs:

- `logs/config_meta.log`
- `logs/runtime.log`

## 7) Troubleshooting

1. Missing dependency error at startup
   - Install missing packages using printed command.
   - Re-run `./start_local.sh`.

2. LLM request fails (`Load failed`)
   - Verify provider endpoint/API key.
   - Lower analysis limit in UI.
   - Try a faster/smaller model first.

3. Browser does not auto-open
   - Open manually: `http://localhost:<FRONTEND_PORT>` (default `5173`)

## 8) Repository files you should know

- `start_local.sh`: interactive startup helper
- `.env.example`: safe template
- `backend/.env`: local secrets (never commit)
- `THIRD_PARTY_NOTICES.md`: dependencies + detected licenses
- `ACKNOWLEDGEMENTS.md`: open-source acknowledgements
- `LICENSE`: project license

## 9) Acknowledgement (Short)

- We thank open-source maintainers, model communities, and tooling teams that make this project possible, including Ollama and OpenCode/Codex.
- For full attribution details, see `ACKNOWLEDGEMENTS.md` and `THIRD_PARTY_NOTICES.md`.
