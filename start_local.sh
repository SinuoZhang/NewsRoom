#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
CONFIG_LOG="$LOG_DIR/config_meta.log"
RUN_LOG="$LOG_DIR/runtime.log"
BACKEND_ENV="$ROOT_DIR/backend/.env"
LANG_FILE="$ROOT_DIR/.startup_lang"

mkdir -p "$LOG_DIR"

UI_LANG="en"
LANG_FROM_ARG=""

timestamp() {
  date "+%Y-%m-%d %H:%M:%S"
}

log_config() {
  printf "[%s] %s\n" "$(timestamp)" "$1" >> "$CONFIG_LOG"
}

msg() {
  local zh="$1"
  local en="$2"
  local de="$3"
  case "$UI_LANG" in
    zh) printf "%s" "$zh" ;;
    de) printf "%s" "$de" ;;
    *) printf "%s" "$en" ;;
  esac
}

say() {
  printf "%s\n" "$(msg "$1" "$2" "$3")"
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -l|--lang)
        LANG_FROM_ARG="${2:-}"
        shift 2
        ;;
      --lang=*)
        LANG_FROM_ARG="${1#*=}"
        shift
        ;;
      -h|--help)
        printf "Usage: ./start_local.sh [--lang zh|en|de]\n"
        exit 0
        ;;
      *)
        shift
        ;;
    esac
  done
}

normalize_lang() {
  local raw="${1:-}"
  case "${raw,,}" in
    zh|cn|zh-cn|chinese) printf "zh" ;;
    de|de-de|german|deutsch) printf "de" ;;
    en|en-us|english) printf "en" ;;
    *) printf "" ;;
  esac
}

pick_language() {
  local normalized_arg=""
  local installed_state="false"
  local saved_lang=""

  if [ -f "$BACKEND_ENV" ] && [ -d "$ROOT_DIR/.venv" ] && [ -d "$ROOT_DIR/frontend/node_modules" ]; then
    installed_state="true"
  fi

  normalized_arg="$(normalize_lang "$LANG_FROM_ARG")"
  if [ -n "$normalized_arg" ]; then
    UI_LANG="$normalized_arg"
    printf "%s" "$UI_LANG" > "$LANG_FILE"
    return 0
  fi

  if [ -f "$LANG_FILE" ]; then
    saved_lang="$(normalize_lang "$(cat "$LANG_FILE" 2>/dev/null || true)")"
    if [ -n "$saved_lang" ]; then
      UI_LANG="$saved_lang"
    fi
  fi

  if [ "$installed_state" = "true" ] && [ -n "$saved_lang" ]; then
    return 0
  fi

  printf "============================================\n"
  printf " NewsRoom Startup / 启动向导 / Startassistent\n"
  printf "============================================\n"
  printf "Tip: --lang zh|en|de\n"
  printf "1) 中文\n2) English\n3) Deutsch\n"
  read -r -p "Select language / 选择语言 / Sprache waehlen [2]: " lang_choice
  case "${lang_choice:-2}" in
    1) UI_LANG="zh" ;;
    3) UI_LANG="de" ;;
    *) UI_LANG="en" ;;
  esac

  printf "%s" "$UI_LANG" > "$LANG_FILE"
}

ask_yes_no() {
  local prompt_zh="$1"
  local prompt_en="$2"
  local prompt_de="$3"
  local default="${4:-Y}"
  local hint="[Y/n]"
  if [ "$default" = "N" ]; then
    hint="[y/N]"
  fi

  while true; do
    read -r -p "$(msg "$prompt_zh" "$prompt_en" "$prompt_de") $hint " ans
    if [ -z "$ans" ]; then
      ans="$default"
    fi
    case "${ans,,}" in
      y|yes) return 0 ;;
      n|no) return 1 ;;
      *) say "请输入 y 或 n。" "Please enter y or n." "Bitte y oder n eingeben." ;;
    esac
  done
}

detect_platform_hints() {
  local install_cmd=""
  if command -v apt-get >/dev/null 2>&1; then
    install_cmd="sudo apt-get update && sudo apt-get install -y python3 python3-venv python3-pip nodejs npm git curl"
  elif command -v dnf >/dev/null 2>&1; then
    install_cmd="sudo dnf install -y python3 python3-virtualenv nodejs npm git curl"
  elif command -v pacman >/dev/null 2>&1; then
    install_cmd="sudo pacman -S --needed python python-pip nodejs npm git curl"
  elif command -v zypper >/dev/null 2>&1; then
    install_cmd="sudo zypper install -y python3 python3-pip nodejs npm git curl"
  fi

  if [ -n "$install_cmd" ]; then
    say "建议安装命令：$install_cmd" "Suggested install command: $install_cmd" "Empfohlener Installationsbefehl: $install_cmd"
  else
    say "请手动安装: python3(>=3.10), node(>=18), npm, git, curl" "Please install manually: python3(>=3.10), node(>=18), npm, git, curl" "Bitte manuell installieren: python3(>=3.10), node(>=18), npm, git, curl"
  fi
}

version_ge() {
  local have="$1"
  local need="$2"
  [ "$(printf "%s\n%s\n" "$need" "$have" | sort -V | head -n1)" = "$need" ]
}

check_and_report() {
  local py_ok="no"
  local node_ok="no"
  local npm_ok="no"
  local ollama_ok="no"
  local py_ver="-"
  local node_ver="-"
  local npm_ver="-"

  if command -v python3 >/dev/null 2>&1; then
    py_ver="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")')"
    if version_ge "$py_ver" "3.10.0"; then
      py_ok="yes"
    fi
  fi

  if command -v node >/dev/null 2>&1; then
    node_ver="$(node -v | sed 's/^v//')"
    if version_ge "$node_ver" "18.0.0"; then
      node_ok="yes"
    fi
  fi

  if command -v npm >/dev/null 2>&1; then
    npm_ver="$(npm -v)"
    npm_ok="yes"
  fi

  command -v ollama >/dev/null 2>&1 && ollama_ok="yes"

  printf "\n%s\n" "$(msg "========== 启动前检查 ==========" "========== Preflight Check ==========" "========== Vorab-Pruefung ==========")"
  printf "python3: %s (version: %s)\n" "$py_ok" "$py_ver"
  printf "node:    %s (version: %s)\n" "$node_ok" "$node_ver"
  printf "npm:     %s (version: %s)\n" "$npm_ok" "$npm_ver"
  printf "ollama:  %s\n" "$ollama_ok"

  log_config "Prereq check python3=$py_ok($py_ver) node=$node_ok($node_ver) npm=$npm_ok($npm_ver) ollama=$ollama_ok"

  if [ "$py_ok" != "yes" ] || [ "$node_ok" != "yes" ] || [ "$npm_ok" != "yes" ]; then
    say "依赖不满足。必须安装：python3>=3.10、node>=18、npm。" "Dependencies are missing. Required: python3>=3.10, node>=18, npm." "Abhaengigkeiten fehlen. Erforderlich: python3>=3.10, node>=18, npm."
    detect_platform_hints
    exit 1
  fi
}

upsert_env_line() {
  local key="$1"
  local value="$2"
  local file="$3"
  local tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { done=0 }
    $0 ~ ("^" k "=") { print k "=" v; done=1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

ensure_env_file() {
  if [ -f "$BACKEND_ENV" ]; then
    return 0
  fi

  say "未检测到 backend/.env。" "backend/.env not found." "backend/.env wurde nicht gefunden."
  if ask_yes_no "现在从 .env.example 创建吗？" "Create it now from .env.example?" "Jetzt aus .env.example erstellen?" "Y"; then
    if [ -f "$ROOT_DIR/.env.example" ]; then
      cp "$ROOT_DIR/.env.example" "$BACKEND_ENV"
      chmod 600 "$BACKEND_ENV" || true
      log_config "Created backend/.env from .env.example"
      say "已创建 backend/.env（权限已尽量收紧）。" "Created backend/.env (permissions tightened)." "backend/.env erstellt (Berechtigungen eingeschraenkt)."
    else
      say "找不到 .env.example，请手动创建 backend/.env。" "Cannot find .env.example. Please create backend/.env manually." "Kann .env.example nicht finden. Bitte backend/.env manuell erstellen."
      exit 1
    fi
  else
    say "已取消启动。" "Startup cancelled." "Start abgebrochen."
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

  if [ "$provider" = "ollama" ] && ! command -v ollama >/dev/null 2>&1; then
    need_config="true"
  fi
  if [ "$provider" = "openai" ] && [ -z "${OPENAI_API_KEY:-}" ]; then
    need_config="true"
  fi
  if [ "$provider" = "gemini" ] && [ -z "${GEMINI_API_KEY:-}" ]; then
    need_config="true"
  fi

  if [ "$need_config" != "true" ]; then
    return 0
  fi

  say "检测到 LLM 配置可能不完整。" "LLM configuration may be incomplete." "LLM-Konfiguration ist moeglicherweise unvollstaendig."
  if ! ask_yes_no "现在配置 LLM 吗？" "Configure LLM now?" "LLM jetzt konfigurieren?" "Y"; then
    log_config "LLM setup skipped"
    return 0
  fi

  say "选择 provider: 1) ollama 2) openai 3) gemini" "Choose provider: 1) ollama 2) openai 3) gemini" "Provider waehlen: 1) ollama 2) openai 3) gemini"
  read -r -p "[1]: " provider_choice
  case "${provider_choice:-1}" in
    2) provider="openai" ;;
    3) provider="gemini" ;;
    *) provider="ollama" ;;
  esac

  if [ "$provider" = "ollama" ]; then
    read -r -p "OLLAMA_URL [http://localhost:11434]: " ollama_url
    read -r -p "OLLAMA_MODEL [gpt-oss:120b-cloud]: " ollama_model
    ollama_url="${ollama_url:-http://localhost:11434}"
    ollama_model="${ollama_model:-gpt-oss:120b-cloud}"
    upsert_env_line "LLM_PROVIDER" "ollama" "$BACKEND_ENV"
    upsert_env_line "OLLAMA_URL" "$ollama_url" "$BACKEND_ENV"
    upsert_env_line "OLLAMA_MODEL" "$ollama_model" "$BACKEND_ENV"
  elif [ "$provider" = "openai" ]; then
    read -r -s -p "OPENAI_API_KEY: " openai_key
    printf "\n"
    read -r -p "OPENAI_MODEL [gpt-4o-mini]: " openai_model
    openai_model="${openai_model:-gpt-4o-mini}"
    upsert_env_line "LLM_PROVIDER" "openai" "$BACKEND_ENV"
    upsert_env_line "OPENAI_API_KEY" "$openai_key" "$BACKEND_ENV"
    upsert_env_line "OPENAI_MODEL" "$openai_model" "$BACKEND_ENV"
  else
    read -r -s -p "GEMINI_API_KEY: " gemini_key
    printf "\n"
    read -r -p "GEMINI_MODEL [gemini-1.5-flash]: " gemini_model
    gemini_model="${gemini_model:-gemini-1.5-flash}"
    upsert_env_line "LLM_PROVIDER" "gemini" "$BACKEND_ENV"
    upsert_env_line "GEMINI_API_KEY" "$gemini_key" "$BACKEND_ENV"
    upsert_env_line "GEMINI_MODEL" "$gemini_model" "$BACKEND_ENV"
  fi

  chmod 600 "$BACKEND_ENV" || true
  log_config "LLM configured provider=$provider"
}

setup_python_env() {
  if [ ! -d "$ROOT_DIR/.venv" ]; then
    say "未检测到 .venv。" "No .venv found." "Keine .venv gefunden."
    if ask_yes_no "现在创建 Python 虚拟环境？" "Create Python virtual environment now?" "Python-Virtualenv jetzt erstellen?" "Y"; then
      python3 -m venv "$ROOT_DIR/.venv"
      log_config "Created .venv"
    else
      say "已取消启动。" "Startup cancelled." "Start abgebrochen."
      exit 1
    fi
  fi

  # shellcheck disable=SC1091
  source "$ROOT_DIR/.venv/bin/activate"
}

ensure_backend_deps() {
  if ! "$ROOT_DIR/.venv/bin/python" - <<'PY' >/dev/null 2>&1
import fastapi
import sqlalchemy
import feedparser
import requests
import apscheduler
print("ok")
PY
  then
    say "检测到后端依赖缺失。" "Backend dependencies are missing." "Backend-Abhaengigkeiten fehlen."
    if ask_yes_no "现在安装后端依赖？" "Install backend dependencies now?" "Backend-Abhaengigkeiten jetzt installieren?" "Y"; then
      "$ROOT_DIR/.venv/bin/python" -m pip install --upgrade pip
      "$ROOT_DIR/.venv/bin/python" -m pip install -r "$ROOT_DIR/backend/requirements.txt"
      log_config "Installed backend dependencies"
    else
      say "已取消启动。" "Startup cancelled." "Start abgebrochen."
      exit 1
    fi
  else
    log_config "Backend dependencies check passed"
  fi
}

ensure_frontend_deps() {
  if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
    if ask_yes_no "未检测到前端依赖，是否安装？" "Frontend dependencies not found. Install now?" "Frontend-Abhaengigkeiten nicht gefunden. Jetzt installieren?" "Y"; then
      npm --prefix "$ROOT_DIR/frontend" install
      log_config "Installed frontend dependencies"
    else
      say "已取消启动。" "Startup cancelled." "Start abgebrochen."
      exit 1
    fi
  else
    log_config "Frontend dependencies check passed"
  fi
}

open_browser() {
  sleep 2
  if command -v open >/dev/null 2>&1; then
    open "http://localhost:5173"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:5173"
  fi
}

cleanup() {
  if [ -n "${BACK_PID:-}" ]; then
    kill "$BACK_PID" >/dev/null 2>&1 || true
  fi
}

main() {
  parse_args "$@"
  pick_language

  say "本脚本不会自动执行 sudo 或系统级安装。" "This script will not run sudo or system-level installs automatically." "Dieses Skript fuehrt kein sudo oder automatische Systeminstallation aus."
  say "请先阅读 README 中对应语言的安装步骤。" "Please read the matching language install guide in README." "Bitte lesen Sie die Installationsanleitung in README (passende Sprache)."

  check_and_report
  ensure_env_file
  configure_llm_if_needed
  setup_python_env
  ensure_backend_deps
  ensure_frontend_deps

  printf "\n%s\n" "$(msg "日志文件：" "Log files:" "Logdateien:")"
  printf "- %s\n- %s\n\n" "$CONFIG_LOG" "$RUN_LOG"

  trap cleanup EXIT INT TERM

  (cd "$ROOT_DIR/backend" && "$ROOT_DIR/.venv/bin/python" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload 2>&1 | tee -a "$RUN_LOG") &
  BACK_PID=$!

  open_browser &

  say "正在启动前端开发服务器..." "Starting frontend dev server..." "Frontend-Entwicklungsserver wird gestartet..."
  npm --prefix "$ROOT_DIR/frontend" run dev 2>&1 | tee -a "$RUN_LOG"
}

main "$@"
