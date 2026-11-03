# Weft 纬

**三线成纬，一机成章。**

Policy-governed · cache-first · long-horizon · memory-growing agent harness.

![version](https://img.shields.io/badge/version-1.0.2-2dd4bf)
![tests](https://img.shields.io/badge/tests-82%20pass-22c55e)
![node](https://img.shields.io/badge/node-%3E%3D24-339933)
![status](https://img.shields.io/badge/status-v1.0%20released-0ea5e9)
![CI](https://github.com/czheng5/weft-agnet/actions/workflows/ci.yml/badge.svg)
![license](https://img.shields.io/badge/license-MIT-22c55e)

Weft 把 Codex 的“手”、Claude 的“脑”、DSH 的“脊”、Hermes/MemoryHub 的“记忆”织成一个可运行、可审计、可替换的 Agent Harness。

## 文档

| 文档 | 内容 |
|---|---|
| [PRD.md](PRD.md) | 8 概念、F-ID、MemoryHub 默认、KB 接口、验收 |
| [ROADMAP.md](ROADMAP.md) | M0–M5、exit criteria、feature → milestone |
| [PROJECT_LOG.md](PROJECT_LOG.md) | 项目管理台账：模块/问题/效果/时间线 |
| [docs/v1.0-gate.md](docs/v1.0-gate.md) | v1.0 gate：PASS（IN 范围），证据与外部项 |
| [docs/v1.0-release.md](docs/v1.0-release.md) | v1.0.2 发布说明 |
| [docs/real-model-acceptance.md](docs/real-model-acceptance.md) | 真实 DeepSeek 验收 |
| [docs/remaining-design.md](docs/remaining-design.md) | 完整设计剩余工作与优先级 |
| [docs/acceptance-matrix.md](docs/acceptance-matrix.md) | 12 项验收机制 |
| [docs/acceptance/long-task.md](docs/acceptance/long-task.md) | 50 步长任务验收 |
| [docs/project-timeline.md](docs/project-timeline.md) | 立项→v1.0.1 总时间 |
| [docs/docker-conformance.md](docs/docker-conformance.md) | Docker OS 边界 6 项 PASS |
| [docs/wsl-conformance.md](docs/wsl-conformance.md) | WSL 非 root PASS |
| [docs/arch-vm-conformance.md](docs/arch-vm-conformance.md) | Arch Linux VM：核心/长任务 PASS |
| [docs/bwrap-conformance.md](docs/bwrap-conformance.md) | Bubblewrap Linux 原生边界：6 项 PASS |
| [docs/pgvector-live.md](docs/pgvector-live.md) | pgvector/HNSW/PgVectorIndex PASS |
| [docs/sandbox-verification.md](docs/sandbox-verification.md) | OS 边界验证方法矩阵 |
| [docs/interfaces.md](docs/interfaces.md) | MemoryProvider / KBProvider 契约 |
| [appendix/polyglot-hub.md](appendix/polyglot-hub.md) | 未来 Polyglot provider |

---

## 为什么是 Weft

今天的 Agent 工具不缺能力，缺的是**能长期跑、能管住权限、能记住、能恢复、能换 UI**的底座。

| 痛点 | 常见现状 | Weft 的做法 |
|---|---|---|
| 权限靠提示词 | “请注意不要删库” | 六层决策 + 审批缓存 + 沙箱 + Guardian |
| 上下文不可缓存 | 每轮重拼 system prompt | Z0–Z3 请求四区，前缀稳定可测 |
| 记忆没有权威 | 向量库/缓存/文件各写一份 | PostgreSQL 唯一权威 + pgvector + graph + outbox |
| 长任务不可追溯 | 只有一个 while 循环 | Work Graph + Plan + Checkpoint + Evidence |
| UI 绑死 | TUI 和 core 混在一起 | Surface Renderer：TUI/CLI/HTTP/MCP |
| 换模型成本高 | provider 逻辑散落 | ModelProvider + OpenAI-compatible + 本地模型 |

## Weft 是什么

Weft 不是一个“更会聊天的 Agent”，而是一个 **Agent 运行时**：

1. **Work Graph**：Goal、Plan、Task、Checkpoint、Evidence 同图。
2. **Actor Runtime**：后台子代理、父子关系、邮箱、fork 前缀复用。
3. **Scheduler**：wakeup / interval / monitor，可持久化恢复。
4. **Event Bus**：生命周期、权限、工具、遥测统一事件，可订阅/回放。
5. **Capability Package**：manifest + instructions + tools + eval 的技能制品。
6. **Memory Fabric**：写入/巩固/冲突/检索/注入/治理。
7. **Context Projection**：压缩是 shadow 投影，不是删除。
8. **Surface Renderer**：一套事件驱动多种界面。

## 核心优势

### 1. 权限不是提示词，是执行路径

- 文件、shell、memory、KB 全部走 Permission Ladder。
- workspace-write / read-only / danger，三档模式。
- allow-once / allow-session / deny，审批结果可审计。
- Docker Linux / WSL 两种 OS 边界后端；不可用直接 fail-closed。
- Guardian shadow：规则/模型评审，不静默放行。

### 2. 缓存优先的请求设计

- Z0：稳定 system + tools。
- Z1：append-only 历史。
- Z2：runtime context（cwd/sandbox/memory/KB）。
- Z3：当前 instruction。
- canonical JSON + SHA-256 + deepFreeze；prefixHash 可回归测试。
- 真实 DeepSeek 验收：cacheReadTokens=2304。

### 3. 记忆有唯一权威

- Provider 抽象：SQLite dev、HTTP MemoryHub、Postgres。
- 真实 PostgreSQL + pgvector + HNSW + PgVectorIndex。
- 写入版本、tombstone、scope、audit、RBAC。
- duplicate / conflict / new-wins / manual / keep-both。
- Agent 首轮自动注入作用域内记忆，并记录 memory/injected。

### 4. 长任务可拆、可查、可恢复

- Goal + Plan + Task DAG + Todo projection。
- Checkpoint 快照，执行前/中/后都可恢复。
- Evidence 驱动 GoalEvaluator，不靠“我觉得完成了”。
- 50 步长任务验收：50 evidence / 5 checkpoints / 50 replay / 0 missing。

### 5. 不锁 UI，不锁模型

- TUI / CLI / HTTP API / MCP tools。
- OpenAI-compatible：DeepSeek、OpenAI、本地 Ollama/vLLM/llama.cpp。
- 本地模型可无 key：--model-base-url。
- 一套 core，多 surface。

## 架构

~~~text
                 ┌──────────────────────────────┐
                 │          Surface             │
                 │   TUI / CLI / HTTP / MCP     │
                 └──────────────┬───────────────┘
                                │ events
                 ┌──────────────▼───────────────┐
                 │        Agent Runtime         │
                 │  Work Graph / Actor / Sched  │
                 │  Event Bus / Capability      │
                 └───────┬──────────────┬───────┘
                         │              │
              ┌──────────▼───┐   ┌──────▼────────┐
              │ Context      │   │ Memory Fabric │
              │ Projection   │   │ PG+pgvector   │
              └──────────┬───┘   │ graph/outbox  │
                         │       └──────┬────────┘
                 ┌───────▼──────────────▼───────┐
                 │        Sandbox / Policy      │
                 │ workspace-guard / Docker/WSL │
                 └──────────────────────────────┘
~~~

## 安装

当前为**源码分发**，npm 包尚未发布。安装脚本会把 Weft 装到用户目录，不需要 sudo。

### 一条命令

Linux / macOS / WSL：

~~~sh
curl -fsSL https://raw.githubusercontent.com/czheng5/weft-agnet/v1.0.2/install.sh | sh
~~~

Windows PowerShell：

~~~powershell
irm https://raw.githubusercontent.com/czheng5/weft-agnet/v1.0.2/install.ps1 | iex
~~~

这里固定到发布 tag v1.0.2，避免 GitHub Raw 对 main 的缓存；升级时替换 tag 即可。

脚本会：

- 检查 Node.js >= 24、git、npm
- clone 到 ~/.weft/app（Windows: %LOCALAPPDATA%\Weft\app）
- 执行 npm install
- 复制 .env.example 为 .env
- 生成 weft / weft.cmd 命令（Windows 自动加入用户 PATH）

### 固定版本 / 先检查再执行

不建议不看内容就直接 curl | sh。可以先下载：

~~~sh
curl -fsSL https://raw.githubusercontent.com/czheng5/weft-agnet/v1.0.2/install.sh -o install.sh
less install.sh
sh install.sh
~~~

固定 tag：

~~~sh
curl -fsSL https://raw.githubusercontent.com/czheng5/weft-agnet/v1.0.2/install.sh | sh -s -- --version v1.0.2
~~~

Windows 固定版本：

~~~powershell
irm https://raw.githubusercontent.com/czheng5/weft-agnet/v1.0.2/install.ps1 -OutFile install.ps1
.\install.ps1 -Version v1.0.2
~~~

### 源码安装（贡献者）

~~~powershell
git clone https://github.com/czheng5/weft-agnet.git; cd weft-agnet; npm install
~~~

要求：Node.js >= 24（使用原生 TypeScript type stripping，无需构建）。

## 快速验证

~~~powershell
node --experimental-strip-types src/cli.ts --demo
node --experimental-strip-types scripts/v1-demo.ts
node --test --test-isolation=none --experimental-strip-types tests/all.test.ts
~~~

预期：82 tests pass；v1 demo PASS。

## 配置

复制 .env.example 为 .env。CLI 启动时会自动加载 .env，已存在的环境变量优先，不会被覆盖。

~~~text
WEFT_MODEL_BASE_URL=https://api.deepseek.com/v1
WEFT_MODEL=deepseek-chat
WEFT_MODEL_API_KEY=
WEFT_GUARDIAN=rule
WEFT_PORT=4780
~~~

### 模型

云端：

~~~powershell
$env:WEFT_MODEL_API_KEY = "..."
$env:WEFT_MODEL_BASE_URL = "https://api.deepseek.com/v1"
$env:WEFT_MODEL = "deepseek-chat"
node --experimental-strip-types src/cli.ts
~~~

本地 OpenAI-compatible（无 key）：

~~~powershell
node --experimental-strip-types src/cli.ts --model-base-url http://127.0.0.1:11434/v1 --model-name qwen2.5-coder
~~~

### 记忆

默认 SQLite dev；生产用 Postgres：

~~~powershell
$env:WEFT_PG_URL = "postgres://postgres:weft@127.0.0.1:55432/weft"
node --experimental-strip-types scripts/v1-demo.ts
~~~

MemoryHub HTTP/MCP：

~~~powershell
node --experimental-strip-types src/cli.ts --serve-memory --port 4780
~~~

### 知识库

- local-docs：默认扫描 docs/report/appendix。
- http-kb：--kb-url + WEFT_KB_KIND=http
- web：--kb-kind web --kb-url https://...
- MCP：--kb-kind mcp --kb-url <endpoint>

### 沙箱

- --sandbox workspace-guard：开发默认，非 OS 边界；普通 exec 仍会询问。
- --sandbox bwrap：Linux 原生 namespace 边界（bubblewrap）；6 项 conformance PASS；自动 sandboxed 审批。
- --sandbox docker：Linux 容器，6 项 conformance PASS；自动使用 sandboxed 审批。
- --sandbox wsl --wsl-distro weft-sandbox --wsl-user weft：WSL 非 root PASS；同样自动 sandboxed 审批。
- 显式 --approval on-request / untrusted / never 可覆盖自动选择。

sandboxed 档的自动判断：

- 工作区读/写：自动允许
- 工作区内非危险 exec：自动允许
- 工作区外非敏感只读（如 /etc/os-release）：自动允许
- 工作区外写：直接拒绝，不弹窗
- 敏感路径（~/.ssh、~/.aws、.env、shadow 等）：仍然 ask
- 网络：bwrap 默认无网络；需要联网时显式提高权限

## 真实验收

| 验收 | 结果 |
|---|---|
| 自动化测试 | 82 pass |
| 真实 DeepSeek 任务 | 6 tools / cacheReadTokens=2304 / PASS |
| 真实 Guardian 50 | 50 actions / 0 mismatch |
| 真实 PostgreSQL | write/get/search/forget/health PASS |
| pgvector + HNSW + PgVectorIndex | PASS |
| Docker Linux OS | 6 项 PASS |
| WSL 非 root | uid=1001 PASS |
| Bubblewrap Linux native | 6 项 PASS（network / /etc 拒绝） |
| 长任务 | 50 steps / 5 checkpoints / 50 evidence PASS |

详细证据：docs/v1.0-gate.md、docs/real-model-acceptance.md、docs/wsl-conformance.md。

## 项目结构

~~~text
src/core/        event log, request, permissions, sandbox, memory, KB,
                 workgraph, actors, scheduler, event-bus, capabilities,
                 context-projection, guardian, metrics, TUI
src/cli.ts       CLI / TUI 入口
tests/           82 个测试
scripts/         demo / acceptance / conformance
migrations/      MemoryHub pgvector schema
docs/            设计、gate、验收、沙箱、发布
appendix/        Polyglot MemoryProvider 附录
brand/           Weft 品牌与 TUI 资源
~~~

## 设计原则

1. 同一能力只保留一个 canonical 实现；第二实现走 provider + 契约测试。
2. PG 是 Memory 唯一权威；Vector/Redis 可重建。
3. 默认沙箱内执行；能力不足直接拒绝，不静默降级。
4. 审批结果可审计；拒绝要有结构化原因。
5. 压缩是投影，原始事件不丢。
6. 先验证，再宣称。

## 已知限制

- 原生 Windows RestrictedToken/MXC 未实现；v1.0 用 Docker/WSL 作为 Windows 宿主 backend。
- CUA driver 属 P1/v1.5；v1.0 只做 CUA 治理策略。
- WSL 不做 per-command 网络隔离。
- 真实模型只验证 DeepSeek 一个 provider；多模型/长任务/并发仍需扩展验收。
- Web/Desktop surface、多租户/配额、技能演化属 v1.5/v2.0。

## Roadmap

- v1.0.1：当前版本，代码 + 真实模型 + PG/pgvector + Docker/WSL。
- v1.5：原生 Windows backend、CUA driver、多租户/RBAC、Web/Desktop、技能演化。
- v2.0：自有协议、Weft Bench、插件生态、Polyglot MemoryProvider 默认化。

## 开发时间

首次提交：2026-11-01T08:23:11-05:00  
v1.0.1 tag：2026-11-02T02:52:33-05:00  
墙钟：**18h29m22s**（不含立项前调研；不是人时）。

详见 docs/project-timeline.md。

## 参与

- 先读 PRD.md、ROADMAP.md、docs/interfaces.md。
- 新能力必须带测试和契约；不允许静默降级。
- 提交前运行 82 tests。
- 安全相关改动必须更新 docs/v1.0-gate.md 或验收矩阵。

## 许可

MIT © 2026 Weft contributors。见 [LICENSE](LICENSE)。

## 贡献与安全

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [CHANGELOG.md](CHANGELOG.md)

## 致谢

研究并借鉴了 Codex、Claude Code / Agent SDK、DeepSeek Harness、Hermes Agent、Red Hat MemoryHub 的公开设计；所有实现为 Weft 自有代码与契约。
