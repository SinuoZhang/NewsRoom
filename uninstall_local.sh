#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ENV="$ROOT_DIR/backend/.env"

UI_LANG="en"
LANG_FROM_ARG=""

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

to_lower() {
  printf "%s" "$1" | tr '[:upper:]' '[:lower:]'
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
        printf "Usage: ./uninstall_local.sh [--lang zh|en|de]\n"
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
  case "$(to_lower "$raw")" in
    zh|cn|zh-cn|chinese) printf "zh" ;;
    de|de-de|german|deutsch) printf "de" ;;
    en|en-us|english) printf "en" ;;
    *) printf "" ;;
  esac
}

ask_yes_no() {
  local prompt_zh="$1"
  local prompt_en="$2"
  local prompt_de="$3"
  local default="${4:-N}"
  local hint="[y/N]"
  if [ "$default" = "Y" ]; then
    hint="[Y/n]"
  fi

  while true; do
    read -r -p "$(msg "$prompt_zh" "$prompt_en" "$prompt_de") $hint " ans
    if [ -z "$ans" ]; then
      ans="$default"
    fi
    case "$(to_lower "$ans")" in
      y|yes) return 0 ;;
      n|no) return 1 ;;
      *) say "请输入 y 或 n。" "Please enter y or n." "Bitte y oder n eingeben." ;;
    esac
  done
}

pick_language() {
  local normalized_arg=""
  local env_lang=""
  normalized_arg="$(normalize_lang "$LANG_FROM_ARG")"
  if [ -n "$normalized_arg" ]; then
    UI_LANG="$normalized_arg"
    return 0
  fi

  if [ -f "$BACKEND_ENV" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$BACKEND_ENV"
    set +a
    env_lang="$(normalize_lang "${STARTUP_LANG:-}")"
    if [ -n "$env_lang" ]; then
      UI_LANG="$env_lang"
      return 0
    fi
  fi

  printf "1) 中文\n2) English\n3) Deutsch\n"
  read -r -p "Select language / 选择语言 / Sprache waehlen [2]: " lang_choice
  case "${lang_choice:-2}" in
    1) UI_LANG="zh" ;;
    3) UI_LANG="de" ;;
    *) UI_LANG="en" ;;
  esac
}

remove_if_exists() {
  local target="$1"
  if [ -e "$target" ]; then
    rm -rf "$target"
    printf "- removed %s\n" "$target"
  fi
}

kill_port_if_busy() {
  local port="$1"
  local pids
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi
  pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    for pid in $pids; do
      kill "$pid" >/dev/null 2>&1 || true
    done
    printf "- stopped process(es) on port %s\n" "$port"
  fi
}

remove_ollama_model_if_configured() {
  if [ ! -f "$BACKEND_ENV" ]; then
    return 0
  fi
  set -a
  # shellcheck disable=SC1090
  source "$BACKEND_ENV"
  set +a

  if command -v ollama >/dev/null 2>&1; then
    local model="${OLLAMA_MODEL:-}"
    if [ -n "$model" ]; then
      if ask_yes_no "检测到 OLLAMA_MODEL=$model，是否尝试从本机删除该模型？" "Detected OLLAMA_MODEL=$model. Remove this local model from Ollama?" "OLLAMA_MODEL=$model erkannt. Dieses lokale Modell aus Ollama entfernen?" "N"; then
        ollama rm "$model" >/dev/null 2>&1 || true
        printf "- attempted ollama rm %s\n" "$model"
      fi
    fi
  fi
}

main() {
  parse_args "$@"
  pick_language

  say "将执行本地卸载清理（不会卸载系统级 python/node）。" "This will perform local uninstall cleanup (no system-level python/node uninstall)." "Dies fuehrt eine lokale Deinstallation durch (keine System-Deinstallation von python/node)."
  say "建议先停止正在运行的 start_local.sh 终端。" "Please stop any running start_local.sh terminal first." "Bitte zuerst laufende start_local.sh-Terminals beenden."

  if ! ask_yes_no "确认继续？" "Confirm and continue?" "Bestaetigen und fortfahren?" "N"; then
    say "已取消。" "Cancelled." "Abgebrochen."
    exit 0
  fi

  local backend_port="8000"
  local frontend_port="5173"
  if [ -f "$BACKEND_ENV" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$BACKEND_ENV"
    set +a
    backend_port="${BACKEND_PORT:-8000}"
    frontend_port="${FRONTEND_PORT:-5173}"
  fi

  say "将执行完整清理：运行进程、虚拟环境、前端依赖、构建产物、日志、数据库、本地配置和语言偏好。" "A full cleanup will run: processes, virtual env, frontend deps, build artifacts, logs, databases, local config, and language preference." "Eine Vollbereinigung wird ausgefuehrt: Prozesse, Virtualenv, Frontend-Abhaengigkeiten, Build-Artefakte, Logs, Datenbanken, lokale Konfiguration und Sprachpraeferenz."
  if ! ask_yes_no "确认执行完整清理？" "Confirm full cleanup?" "Vollstaendige Bereinigung bestaetigen?" "N"; then
    say "已取消。" "Cancelled." "Abgebrochen."
    exit 0
  fi

  kill_port_if_busy "$backend_port"
  kill_port_if_busy "$frontend_port"

  remove_if_exists "$ROOT_DIR/.venv"
  remove_if_exists "$ROOT_DIR/frontend/node_modules"
  remove_if_exists "$ROOT_DIR/frontend/dist"
  remove_if_exists "$ROOT_DIR/frontend/.vite"
  remove_if_exists "$ROOT_DIR/logs"

  remove_ollama_model_if_configured

  remove_if_exists "$ROOT_DIR/newsroom.db"
  remove_if_exists "$ROOT_DIR/newsroom.db-journal"
  remove_if_exists "$ROOT_DIR/backend/newsroom.db"
  remove_if_exists "$ROOT_DIR/backend/newsroom.db-journal"

  remove_if_exists "$BACKEND_ENV"

  remove_if_exists "$ROOT_DIR/.pytest_cache"
  remove_if_exists "$ROOT_DIR/.mypy_cache"
  remove_if_exists "$ROOT_DIR/.ruff_cache"

  if command -v python3 >/dev/null 2>&1; then
    ROOT_CLEAN_DIR="$ROOT_DIR" python3 - <<'PY'
import os
from pathlib import Path
root = Path(os.environ['ROOT_CLEAN_DIR'])
for path in root.rglob('__pycache__'):
    if path.is_dir():
        import shutil
        shutil.rmtree(path, ignore_errors=True)
print('- removed __pycache__ directories')
PY
  fi

  say "本地卸载清理完成。" "Local uninstall cleanup completed." "Lokale Deinstallation abgeschlossen."
}

main "$@"
