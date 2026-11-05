# Weft Backlog

> 快照：v2.4.1（2026-11-04）  
> 这是当前唯一活跃的 todo。旧 ROADMAP 的 v1 复选框是历史门禁，不是现在的执行清单。

## 已完成

- v1.0：M0–M3，权限/缓存/记忆/长任务/沙箱
- v1.5：M4 runtime schema、SQLite/Postgres store、v1 迁移
- v1.6：M5 Gateway、Worker、Router、SSE、Watchdog、AgentLoop seam、Eval、Source、CLI serve
- v2.0：M6 Surface、Capability API、BYOM、RBAC/Quota、Protocol、Bench、Marketplace baseline
- v2.1：断网 reference 情景（FIFO/CDC/timing）+ 证据检查
- v2.2：签名 Marketplace、OIDC/撤销、公平调度、存储/计算分离编排
- v2.3：ObjectiveAnchor 防跑偏、EDA fail-closed gate、fixed FIFO RTL/testbench
- v2.4：天禧 AI 项目管理/交互整合、Workboard、EDA/PDK 自动发现

## P0

| ID | 事项 | 完成标准 |
|---|---|---|
| P0-1 | 产品 README | 首页有产品定位、CLI 预览、快速开始、能力/限制；无过期 v1.0.2 安装 tag |
| P0-2 | Workboard 交互 | Surface 支持分组、优先级/逾期、点击恢复；owner/提醒可用 |
| P0-3 | Testbench env 注入 | 从 WEFT_ENV/进程环境读 key，不落明文、不打印、不提交 |
| P0-4 | 断网 Agent E2E（optional） | 本地/注入模型真正读取内部文件、产出 finding/patch；不依赖网络 |

## P1

| ID | 事项 | 完成标准 |
|---|---|---|
| P1-1 | EDA 实跑 | 环境有 Verilator/Yosys/PDK 时自动发现并跑 lint/sim/synth |
| P1-2 | Coverage/PERC | coverage 百分比解析；PERC/electrical rule deck adapter；无 deck 不签核 |
| P1-3 | OAuth code flow | authorization-code + PKCE；key rotation；撤销联动 |
| P1-4 | 生产 adapter | S3 artifact store、K8s/Nomad worker launcher；HA/backup |
| P1-5 | 加权公平调度 | 从 tenant round-robin 升级为 weighted/fair queue |
| P1-6 | 跨设备同步 | 设备身份、冲突解决、端到端加密；不是裸共享 Postgres |
| P1-7 | Desktop 壳 | Web/Desktop 同一 Surface；TUI/HTTP 不重复逻辑 |
| P1-8 | Marketplace UI | 远程索引、发布者 key 展示、安装审批/回滚 |

## P2

| ID | 事项 | 完成标准 |
|---|---|---|
| P2-1 | 更多硬件情景 | AXI/握手、仲裁、时钟门控、复位、低功耗、DFT、模拟/混合信号 |
| P2-2 | 本地模型 runner | Ollama/vLLM/llama.cpp 一键接入；离线模型注册 |
| P2-3 | 项目视图 | projectId 聚合、跨项目切换、项目级配额 |
| P2-4 | CUA driver | 桌面操作治理与回放（当前只有治理策略） |

## 不是硬限制

- 本机没有 EDA/PDK：tool-discovery 会扫描 PATH、WEFT_EDA_BIN、OSS_CAD_SUITE、VERILATOR_ROOT、YOSYS_ROOT、PDK_ROOT、PDK、OPENLANE_ROOT 和常见目录。
- 断网/真实模型 E2E：用户已标为 optional；有环境再验证。
- PERC：需要环境提供 rule deck；不是产品代码写死。

## 旧文件对账

- README：安装命令固定 v1.0.2 → 本次改为 v2.4.0。
- README：旧 Roadmap 有重复 v2.0 项 → 本次收敛。
- docs/m5-*：多处仍写“进行中” → v1.6 已发布；后续文档逐步改为历史/完成。
- ROADMAP.md 第 298–305 行 v1 gate 复选框：历史门禁，不再作为当前 todo。
- docs/remaining-design.md、appendix/v2-open-questions.md：保留为设计输入，不直接当执行清单。
- PROJECT_LOG.md 是历史台账，不反写旧记录。

## 下一步

1. P0-1 README 产品化（本轮）
2. P0-2 Workboard 交互
3. P0-3 env 注入
4. P1-1/P1-2 EDA 实跑与签核
