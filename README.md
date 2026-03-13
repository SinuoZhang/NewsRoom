# NewsRoom (Core Local Version)

本项目保留了本地运行的核心结构：

- 新闻抓取（RSS）+ 去重入库
- 本地数据库（SQLite）
- LLM 分析侧栏（Ollama/OpenAI/Gemini 可切换）
- 实时市场价格栏（贵金属 + 汇率）

## 核心结构

- `backend/app/`: API、抓取、LLM、市场数据
- `frontend/src/`: 页面与交互
- `start_local.sh`: 本地启动与环境检查

## 快速启动

```bash
./start_local.sh
```

首次启动会自动：

- 创建 `.venv`
- 安装后端依赖
- 安装前端依赖
- 后端跑在 `8000`，前端跑在 `5173`
- 自动打开浏览器到 `http://localhost:5173`
- 后端启动后会自动触发一次抓取，之后每 10 分钟自动抓取
- 启动与抓取时会自动清理 3 天前的历史数据

启动后访问：

- 前端: `http://localhost:5173`
- 后端 API 文档: `http://localhost:8000/docs`

## 核心 API

- `GET /api/health`
- `POST /api/sources/seed`
- `GET /api/sources`
- `POST /api/collect/run`
- `GET /api/collect/status`
- `GET /api/news?q=&source_id=&limit=`
- `POST /api/llm/chat`
- `GET /api/llm/models`
- `POST /api/llm/models/select`

## AI 接入说明

默认接 Ollama：

- `OLLAMA_URL=http://localhost:11434`
- `OLLAMA_MODEL=gpt-oss:120b-cloud`

如果本地没有开启 Ollama，系统会自动回退到规则分析器，保证流程不中断。

可切换到 OpenAI / Gemini（用于右侧 LLM 对话侧栏）：

- `LLM_PROVIDER=ollama|openai|gemini`
- `OPENAI_API_KEY=...` + `OPENAI_MODEL=...`
- `GEMINI_API_KEY=...` + `GEMINI_MODEL=...`

注意：ChatGPT Plus / Gemini Advanced 订阅本身不能直接当 API 用，仍需要各自平台的开发者 API Key。

## 环境变量（核心）

- `DATABASE_URL=sqlite:///./newsroom.db`
- `CORS_ORIGINS=http://localhost:5173`
- `LLM_PROVIDER=ollama|openai|gemini`
- `OLLAMA_URL=http://localhost:11434`
- `OLLAMA_MODEL=gpt-oss:120b-cloud`
- `OPENAI_API_KEY=...` `OPENAI_MODEL=...`
- `GEMINI_API_KEY=...` `GEMINI_MODEL=...`
- `AUTO_COLLECT_MINUTES=10`
- `RETENTION_DAYS=3`
