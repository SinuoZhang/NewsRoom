# NewsRoom - Einsteigerfreundliche Installationsanleitung (Linux/macOS)

Sprachwechsel:

- English: `README.en.md`
- 简体中文: `README.zh-CN.md`
- Deutsch (aktuell)

## 1) Projektueberblick

NewsRoom ist ein lokales System fuer Nachrichtenaggregation und LLM-Analyse.

- Backend: FastAPI + SQLite
- Frontend: React + Vite
- Startskript: `start_local.sh`
- Standard-URLs:
  - Frontend: `http://localhost:5173`
  - Backend-Docs: `http://localhost:8000/docs`

## 2) Sicherheit zuerst

- Nicht als root ausfuehren.
- `backend/.env` niemals in Git committen.
- API-Schluessel bleiben lokal in `backend/.env`.
- `start_local.sh` fuehrt keine automatischen `sudo`-Installationen aus.
- Bei fehlenden Abhaengigkeiten zeigt das Skript nur Befehle an und beendet sich.

## 3) Frisches Linux-System (ohne Vorbereitung)

### 3.1 Basiswerkzeuge installieren

Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y git curl python3 python3-venv python3-pip nodejs npm
```

Fedora:

```bash
sudo dnf install -y git curl python3 python3-virtualenv nodejs npm
```

Arch:

```bash
sudo pacman -S --needed git curl python nodejs npm
```

### 3.2 Repository klonen und starten

```bash
git clone <deine-repo-url>
cd NewsRoom
chmod +x start_local.sh
./start_local.sh
```

Sprach-Shortcut:

```bash
./start_local.sh --lang de
./start_local.sh --lang en
./start_local.sh --lang zh
```

## 4) Verhalten beim ersten Start

Beim ersten Lauf macht `start_local.sh` Folgendes:

1. Sprache waehlen (gespeichert in `.startup_lang`)
2. Versionspruefung (`python3>=3.10`, `node>=18`, `npm`)
3. `backend/.env` aus `.env.example` erstellen (falls noetig)
4. LLM-Setup (Ollama/OpenAI/Gemini) bei Bedarf
5. `.venv` erstellen
6. Backend/Frontend-Abhaengigkeiten mit Bestaetigung installieren
7. Backend und Frontend starten

Bei spaeteren Starts (bereits konfiguriert) wird die gespeicherte Sprache automatisch verwendet.

## 5) LLM-Konfiguration

Unterstuetzte Provider:

- `ollama`
- `openai`
- `gemini`

Manuelle Datei: `backend/.env`

```env
LLM_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gpt-oss:120b-cloud

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
```

## 6) Taegliche Nutzung

Start:

```bash
./start_local.sh
```

Stop:

- `Ctrl+C` im Terminal

Logs:

- `logs/config_meta.log`
- `logs/runtime.log`

## 7) Fehlerbehebung

1. Fehlende Abhaengigkeiten
   - Installationsbefehl ausgeben lassen, installieren, Skript neu starten.

2. LLM-Fehler (`Load failed`)
   - Provider-Endpunkt/API-Key pruefen.
   - Analyse-Limit im UI reduzieren.
   - Erst mit schnellerem Modell testen.

3. Browser oeffnet nicht automatisch
   - Manuell aufrufen: `http://localhost:5173`

## 8) Wichtige Dateien

- `start_local.sh`: interaktiver Startassistent
- `.env.example`: sichere Vorlage
- `backend/.env`: lokale Geheimnisse (nicht committen)
- `THIRD_PARTY_NOTICES.md`: Abhaengigkeiten + Lizenzen
- `ACKNOWLEDGEMENTS.md`: Danksagungen
- `LICENSE`: Projektlizenz
