# NewsRoom

NewsRoom is a local-first news aggregation and analysis workspace designed for research and monitoring workflows.

- Aggregates multi-source RSS feeds and stores normalized records locally
- Provides region/topic filtering with incremental refresh in the frontend
- Includes an integrated LLM analysis panel (Ollama / OpenAI / Gemini)
- Ships with guided startup/uninstall scripts for safe local operation
- Supports configurable runtime endpoints (`BACKEND_PORT`, `FRONTEND_PORT`, `VITE_API_BASE`)

Choose your language / 选择语言 / Sprache waehlen:

- English: `README.en.md`
- 简体中文: `README.zh-CN.md`
- Deutsch: `README.de-DE.md`

Quick tip:

- Startup script supports language shortcut: `./start_local.sh --lang zh` / `--lang en` / `--lang de`
- On first setup, the script asks for language and saves it.
- On later runs (already configured), it uses your saved default language automatically.

Acknowledgement:

- We sincerely thank the open-source maintainers, model communities, and tooling teams that make this project possible, including Ollama and OpenCode/Codex.
- See `ACKNOWLEDGEMENTS.md` and `THIRD_PARTY_NOTICES.md` for formal attribution details.
