# NewsRoom - 零基础安全安装指南（Linux/macOS）

语言切换：

- English: `README.en.md`
- 简体中文（当前）
- Deutsch: `README.de-DE.md`

## 1）项目简介

NewsRoom 是一个本地新闻聚合 + LLM 分析系统。

- 后端：FastAPI + SQLite
- 前端：React + Vite
- 启动脚本：`start_local.sh`
- 默认访问地址：
  - 前端：`http://localhost:5173`
  - 后端文档：`http://localhost:8000/docs`

## 2）安全原则（先看）

- 不要用 root 运行。
- 不要把 `backend/.env` 提交到 Git。
- API Key 只保存在本机的 `backend/.env`。
- `start_local.sh` 不会自动执行 `sudo` 系统安装。
- 若缺依赖，脚本会提示安装命令并退出。

## 3）Linux 全新机器（无预装）安装

### 3.1 安装基础工具

Ubuntu / Debian：

```bash
# 更新系统软件索引
sudo apt-get update
# 安装 git、curl、Python 和 Node.js 基础工具
sudo apt-get install -y git curl python3 python3-venv python3-pip nodejs npm
```

Fedora：

```bash
# 安装基础工具
sudo dnf install -y git curl python3 python3-virtualenv nodejs npm
```

Arch：

```bash
# 安装基础工具
sudo pacman -S --needed git curl python nodejs npm
```

### 3.2 拉取代码并启动

如果你已经配置了 GitHub SSH Key：

```bash
# 通过 SSH 克隆仓库
git clone git@github.com:SinuoZhang/NewsRoom.git
# 进入项目目录
cd NewsRoom
# 赋予启动脚本可执行权限
chmod +x start_local.sh
# 启动交互式安装/运行向导
./start_local.sh
```

如果你还没配置 SSH（新手更容易上手）：

```bash
# 通过 HTTPS 克隆仓库
git clone https://github.com/SinuoZhang/NewsRoom.git
# 进入项目目录
cd NewsRoom
# 赋予启动脚本可执行权限
chmod +x start_local.sh
# 启动交互式安装/运行向导
./start_local.sh
```

也可以用语言快捷参数：

```bash
# 本次运行强制中文提示
./start_local.sh --lang zh
# 本次运行强制英文提示
./start_local.sh --lang en
# 本次运行强制德文提示
./start_local.sh --lang de
```

## 4）首次运行会做什么

首次运行 `start_local.sh` 会按步骤引导：

1. 先选语言（保存到 `.startup_lang`）
2. 检查版本（`python3>=3.10`、`node>=18`、`npm`）
3. 若无 `backend/.env`，从 `.env.example` 创建
4. 按需引导配置 LLM（Ollama/OpenAI/Gemini）
5. 创建 `.venv`
6. 询问你后安装前后端依赖
7. 启动后端和前端

后续再次运行（已配置完成）会直接使用上次默认语言，不再强制重新选择。

## 5）LLM 配置

可选 provider：

- `ollama`
- `openai`
- `gemini`

手动配置文件：`backend/.env`

```env
LLM_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gpt-oss:120b-cloud

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
```

## 5.1）端口与 API 地址覆盖（可选）

你可以在 `backend/.env` 里覆盖默认启动地址：

```env
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
FRONTEND_HOST=0.0.0.0
FRONTEND_PORT=5173
VITE_API_BASE=http://localhost:8000
```

- `BACKEND_PORT`：覆盖后端 uvicorn 端口
- `FRONTEND_PORT`：覆盖前端 Vite 端口
- `VITE_API_BASE`：前端请求的 API 基地址（可指向本地或远程）

## 6）日常使用

启动：

```bash
# 启动后端与前端（含检查与引导）
./start_local.sh
```

停止：

- 在运行脚本的终端按 `Ctrl+C`

日志文件：

- `logs/config_meta.log`
- `logs/runtime.log`

## 7）常见问题

1. 启动时提示缺依赖
   - 按提示安装后重新执行脚本。

2. LLM 请求失败
   - 检查 provider 地址/API Key。
   - 在 UI 里先把分析条数调低。
   - 先切换到更快模型验证连通性。

3. 浏览器没自动打开
   - 手动打开：`http://localhost:<FRONTEND_PORT>`（默认 `5173`）

## 8）关键文件说明

- `start_local.sh`：交互式启动向导
- `.env.example`：安全模板
- `backend/.env`：本地敏感配置（不要提交）
- `THIRD_PARTY_NOTICES.md`：依赖与许可证清单
- `ACKNOWLEDGEMENTS.md`：致谢
- `LICENSE`：项目许可证

## 9）简短致谢

- 感谢开源维护者、模型社区与工具团队对本项目的支持，包括 Ollama 与 OpenCode/Codex。
- 完整致谢与第三方信息请见：`ACKNOWLEDGEMENTS.md`、`THIRD_PARTY_NOTICES.md`。
