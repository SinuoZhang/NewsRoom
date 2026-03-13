# NewsRoom 本地部署完整教程

这是一个本地运行的新闻聚合 + LLM 分析系统，适合个人研究、信息监控和策略分析。

当前版本特点：

- 新闻抓取：多源 RSS，自动去重
- 数据库存储：SQLite（默认）
- 自动任务：启动后自动抓取，定时增量抓取，自动清理过期数据
- LLM 侧栏：可切换 Ollama / OpenAI / Gemini
- 本地记忆：聊天记录保存到本地文件，刷新页面不丢

---

## 1. 项目结构说明

- `backend/app/`：后端 API、抓取、LLM、市场数据
- `frontend/src/`：前端页面与交互
- `start_local.sh`：一键启动脚本（含环境检查与引导）
- `.env.example`：环境变量模板
- `logs/`：运行日志与聊天记忆（运行后自动生成）

---

## 2. 运行环境要求

请先确认本机安装：

- Python 3.10+
- Node.js 18+（建议 20）
- npm

可选（推荐）：

- Ollama（用于本地/云端 Ollama 模型）

---

## 3. 一键启动（推荐）

在项目根目录执行：

```bash
./start_local.sh
```

脚本会自动做以下事情：

1. 检查依赖（python/node/npm/ollama）
2. 检查并创建 `backend/.env`（若不存在）
3. 引导你配置 LLM provider（可选）
4. 创建 Python 虚拟环境 `.venv`（若不存在）
5. 安装后端依赖、前端依赖（按需）
6. 启动后端 `:8000` 和前端 `:5173`
7. 自动打开浏览器

启动后访问：

- 前端：`http://localhost:5173`
- 后端文档：`http://localhost:8000/docs`

---

## 4. LLM 配置方式（重点）

系统支持三种 provider：

- `ollama`
- `openai`
- `gemini`

你可以通过两种方式配置：

### 方式 A：启动脚本交互配置（推荐）

直接运行 `./start_local.sh`，按提示选择 provider 并填写模型/API Key。

### 方式 B：手动改 `backend/.env`

示例：

```env
LLM_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gpt-oss:120b-cloud

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
```

注意：

- ChatGPT Plus / Gemini Advanced 订阅 ≠ API Key
- 若要用 OpenAI/Gemini 必须填各自开发者 API Key

---

## 5. Ollama 使用指南

### 5.1 本地模型

```bash
ollama serve
ollama pull gemma3:1b
```

然后在界面右侧模型下拉框切换到该模型。

### 5.2 Ollama Cloud 模型

```bash
ollama signin
```

登录后模型列表会出现 cloud 模型（如 `gpt-oss:120b-cloud`），可直接在右侧下拉切换。

---

## 6. 抓取机制与数据保留机制

### 抓取机制

- 启动后自动触发一次抓取
- 默认每 10 分钟自动抓取一次（可改）
- 你也可手动点“立即抓取”

### 增量展示

- 首次会加载一批新闻
- 后续抓取采用增量更新（只取新数据），避免每次全量重拉

### 数据保留

- 默认仅保留最近 3 天数据
- 每次抓取前会清理过期数据

可通过环境变量调整：

```env
AUTO_COLLECT_MINUTES=10
RETENTION_DAYS=3
```

---

## 7. 聊天记录保存与恢复

LLM 对话会写入本地文件：

- `logs/llm_chat_memory.jsonl`

默认逻辑：

- 每次输入/输出都会追加保存
- 页面刷新后自动读取最近 24 小时记录
- 可在界面中手动清空

---

## 8. 常用 API（开发调试）

### 系统与抓取

- `GET /api/health`
- `POST /api/sources/seed`
- `POST /api/collect/run`
- `GET /api/collect/status`

### 新闻查询

- `GET /api/news`
- `GET /api/news/count`
- `GET /api/news/region-counts`

### LLM

- `POST /api/llm/chat`
- `GET /api/llm/models`
- `POST /api/llm/models/select`
- `GET /api/llm/memory?hours=24`
- `DELETE /api/llm/memory`

### 行情

- `GET /api/market/snapshot`

---

## 9. 日志与排错

运行日志目录：`logs/`

- `logs/config_meta.log`：启动检查与配置动作
- `logs/runtime.log`：运行输出

### 常见问题

1. `Load failed`（LLM 请求失败）
   - 检查 provider 是否可用
   - 降低分析条数（8/12 条）
   - 切换更快模型确认连通性

2. 模型列表为空
   - Ollama 未启动或未登录 cloud
   - 先执行 `ollama serve` / `ollama signin`

3. 页面卡顿
   - 当前版本已做增量加载与重渲染优化
   - 若仍卡，可减少“显示条数”和“LLM分析条数”

---

## 10. 安全与上传建议

- 不要提交 `.env`
- 仓库已配置忽略本地敏感文件和运行产物
- 只提交：源码 + `.env.example`

如需部署到新机器：

1. `git clone`
2. `./start_local.sh`
3. 按提示配置 LLM
4. 打开 `http://localhost:5173`
