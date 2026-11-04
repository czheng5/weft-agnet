# Weft 项目开发日志

> 用途：项目管理视角的独立台账。只记录“开发了什么 / 解决了什么问题 / 达到什么效果”，不写流水账、不替代 PRD/ROADMAP。  
> 更新规则：每次提交追加一行；效果尽量给可验证证据（测试数、事件数、命令、commit）。  
> 当前版本：v1.6.0 RELEASED（2026-11-04）；下一步 M6 Own Shape。

---

## 1. 状态总览

| 里程碑 | 状态 | 进度 | 说明 |
|---|---|---|---|
| M0 Foundation | ✅ 完成（骨架） | 100% | 事件日志/请求分区/权限/审批缓存/workspace 守卫/SQLite Memory/KB/TUI/测试 |
| M1 Safety & Memory | ✅ | 100% | Guardian/CUA/cache 映射/Docker/WSL/Memory/KB/metrics；本地 provider 验证 |
| M2 Long-horizon | ✅ 代码/单测 | 100% | Work Graph/Goal/Plan/Evidence/Checkpoint/Actor fork/Scheduler/EventBus/Capability/Projection |
| M3 Memory & v1.0 | ✅ | 100% | MemoryHub/PG/pgvector/PgVectorIndex/HTTP/MCP；v1.0 gate PASS |
| M4 v1.5 | ✅ RELEASED | 100% | Runtime schema/store、PG/SQLite、v1 只读迁移、Capability 统一 |
| M5 v1.6 | ✅ RELEASED | 100% | Gateway/Worker/Router/SSE/Watchdog/AgentLoop seam/Eval/Source/CLI |
| M6 v2.0 | ⏳ 下一步 | 0% | Own Shape/协议/Bench/插件生态/Surface |

---

## 2. 模块台账（开发了什么 / 解决什么问题 / 效果）

| 模块 | 开发了什么 | 解决了什么问题 | 效果 |
|---|---|---|---|
| 事件日志 | JSONL append-only EventLog，seq/session，重启续写 | 无状态、不可回放 | 同 session 重开 seq 连续；事件可重放 |
| Session 投影 | user/assistant/tool 消息投影 | 模型历史无单一来源 | 请求可重建；tool 结果可配对 |
| 请求四区 | Z0 system+tools、Z1 历史、Z2 runtime、Z3 instruction；canonical JSON + SHA-256 + deepFreeze | 缓存前缀不稳定、请求不可审计 | prefixHash 稳定；cachePrefixStable 在后续 step 为 true |
| 权限阶梯 | read/write/exec/memory/kb；read-only/workspace-write/danger；untrusted/on-request/never；危险命令拒绝 | 权限只有“全放/全问” | 同类动作只问一次；越权/危险命令可拒绝 |
| 审批缓存 | ApprovalStore + ApprovalService；allow-once/allow-session/deny | 重复打断 | 第二次同 action 走 cache；测试 asks=1 |
| Workspace 守卫 | 路径逃逸拒绝；读写/list；cwd 固定；timeout | 文件/命令越界 | 越界路径报错；shell 在 workspace 内执行 |
| MemoryProvider | 接口 + SQLite 开发实现；版本/tombstone/scope/audit | 记忆无权威、删除不传播 | write/get/search/forget/scope 契约测试通过 |
| KnowledgeBaseProvider | local-docs 只读；citation/snippet/root 限制 | 知识库与记忆混用 | 检索带引用；root 外拒绝 |
| 工具层 | read/write/edit/list/run_shell/memory_write/memory_search/kb_search | 工具调用无统一权限/日志 | 每次 tool/call/result + approval 事件 |
| 模型/Agent | ScriptedModel + OpenAI-compatible；请求冻结/工具循环 | 没有可运行 agent loop | demo 7 steps / 6 tools 完成 |
| TUI/CLI | Weft banner、/status、/plan、/events、/memory、/kb、/demo、审批 y/s/n | 无可操作界面 | weft.cmd --demo 可跑；TUI EOF 已处理 |
| Guardian（M1-A） | RuleBasedGuardian + shadow/enforce + 3 连 deny/50 窗 10 deny 熔断 | 审批缺少“自动评审”层 | shadow 记录 6 次 assessment；enforce 可拒绝被策略放行的动作 |
| CUA 策略（M1-A） | app allow/deny/ask、敏感应用、锁屏、持久批准字段 | CUA 无治理入口 | 敏感应用默认 deny；锁屏默认 deny |
| Usage/缓存观测（M1-A） | ModelResponse.usage；OpenAI cached_tokens；model/usage 事件；TUI/CLI cacheReadTokens | 缓存命中不可观测 | demo 7 次 usage；cacheReadTokens 可显示（Scripted=0） |
| WSL sandbox backend（M1-B） | WslSandboxBackend：probe/命令构造/超时/fail-closed；`--sandbox wsl` | 没有内层 OS 边界 backend | probe 失败显式报错；sandbox 测试；DSH 内 EPERM/E_ACCESSDENIED，不静默降级 |
| Docker Linux backend（M1-B） | DockerSandboxBackend：network none/read-only/cap-drop/non-root/pids/memory/cpus；`--sandbox docker` | 需要一个可用的 Linux OS 边界 | **conformance PASS**：路径/工作区/uid=1000/网络/越界写 6 项通过 |
| Docker 自启动（M1-B） | DockerLauncher：`docker desktop start` / Docker Desktop.exe，轮询 daemon，事件 sandbox/launch，`--no-auto-start` | 不能要求用户手动开 Docker；产品要像 Codex 一样自启动 | 2 个 launcher 测试；默认自动启动；失败仍 fail-closed |
| sandboxed 审批（M1-Q） | docker/wsl/bwrap 后端自动使用 `sandboxed` 审批：常规 workspace exec 不再逐条询问；危险命令仍 deny；workspace-guard 仍逐条 ask | DSH 式频繁弹许可不可用；Codex 的沙箱应自己兜底 | 1 个测试；81 tests pass |
| bwrap Linux 原生边界（M1-S） | BwrapSandboxBackend：--unshare-all / --ro-bind / / / --bind 工作区 / --cap-drop ALL / fail-closed | workspace-guard 不是 OS 边界；Docker 太重 | Arch 实测 6 项 PASS；network//etc 拒绝 |
| v2 路线 checkpoint（M4-plan） | M4 收口 v1.5、M5 Gateway v1.6、M6 Own Shape v2.0；未决问题附录 | 路线与版本号不一致 | docs/v2-plan.md + appendix/v2-open-questions.md |
| M4 runtime schema（M4-A） | Thread/WorkerLease/RuntimeEvent/Mandate/Capability/Outbox types + validation + RuntimeStore 接口 + 002 SQL | 到 M5 再造第二套语义 | 87 tests；schema 不变量覆盖 |
| M4 SQLite store（M4-B） | SqliteRuntimeStore：threads/events/leases/mandates/capabilities/outbox；append-only trigger；幂等/seq/版本 | Durable Thread 只有契约没有实现 | 89 tests；SQLite 事务/租约/outbox 测试 |
| M4 Postgres store（M4-C） | PostgresRuntimeStore：同一 RuntimeStore 契约；pg-mem 契约测试 | 只有 SQLite 不能上生产 | 90 tests；真实 PG 待补 |
| M4 Thread/Graph（M4-D） | WorkGraph.threadId + bind/assert；一个 thread 一个 graph；JSON 持久化 | Thread 与内部 DAG 容易变成第二套任务 | 92 tests；跨 thread 拒绝 |
| M4 Capability 统一（M4-E） | CapabilityRegistry 使用 runtime CapabilityManifest；legacy v1 迁移；version 2 persist | 旧 manifest 与新 schema 第二套语义 | 93 tests；legacy 读取/迁移 |
| M4 v1 迁移（M4-F） | 只读读取 v1 workgraph/capabilities/scheduler/checkpoints；显式迁移到 RuntimeStore；不改写 v1 文件 | v1.0 数据不能丢，也不能被悄悄改写 | 94 tests；原文件字节不变 |
| M4 真 PG/scope（M4-G） | 真实 PostgreSQL RuntimeStore 契约；tenant scope 列表隔离 | pg-mem 不能代表生产 | **PASS**；95 tests；runtime-pg-live.md |
| v1.5 release（M4-H） | 95 tests、真 PG、v1 迁移、Capability 统一；版本 1.5.0 | M4 没有正式发布口径 | v1.5.0 RELEASED；tag |
| M5 Gateway（M5-A） | AgentGateway HTTP：threads/messages/events、Bearer、idempotency、Outbox | Agent 没有持久入口 | 96 tests；Gateway 单元测试 |
| M5 WorkerPool（M5-B） | Outbox claim、WorkerLease、heartbeat、complete/fail/backoff、lease busy defer | 任务没有执行者 | 98 tests；success/busy 测试 |
| M5 Router（M5-C） | admission、Mandate capability/expiry、message.user 持久化、worker.task 入队、幂等 | 消息没有准入边界 | 100 tests；Gateway 委托 Router |
| M5 SSE/Watchdog（M5-D） | SSE 事件流；Watchdog 过期 lease 告警 | 客户端不能实时看到进展；租约无人监控 | 102 tests；SSE 首事件 + 告警测试 |
| M5 AgentLoop/Eval（M5-E） | Outbox eventId → AgentRunner；agent.result；Eval gate 聚合 | Worker 还没有真实执行体；没有质量门 | 104 tests；seam/幂等/eval |
| M5 Source/CLI（M5-F） | HTTP JSON Source；CLI --serve；M5 E2E smoke | 没有入口/触发/端到端证据 | 105 tests；E2E PASS |
| v1.6 release（M5-G） | 版本 1.6.0；Gateway/Worker/Router/SSE/Watchdog/E2E | M5 没有发布口径 | v1.6.0 RELEASED；tag |
| Release 纪律（M4-plan） | RELEASE.md；gitignore 加固；版本 gate | 防止敏感日志/无关文件入库 | 发布前检查清单 |
| 自动读判断（M1-T） | sandboxed 档：非敏感外部只读自动允许；外部写直接 deny；敏感路径仍 ask | 必要外部读取不应逐条弹窗，但 secrets 不能自动放行 | 1 个测试；82 tests pass |
| Shell 输出捕获修复 | ShellSandbox 从 pipe 改为临时文件重定向 | DSH 内 Node child_process pipe 报 EPERM，demo 的 shell 实际失败 | demo 现在真正拿到 stdout=2；新增 capture 测试 |
| HTTP KB（M1-C） | HttpKnowledgeBaseProvider：/search、/docs、/health、Bearer、scope headers、timeout | KB 只有本地文件，无法接外部知识库 | 2 个测试；`--kb-url` 可切；只读、不自动入 Memory |
| HTTP MemoryHub（M1-D） | HttpMemoryProvider：write/search/get/forget/health、Bearer、scope headers、timeout | 只有 SQLite dev，接不上远程 MemoryHub | 2 个测试；`--memory-url` 可切；默认仍 SQLite |
| Postgres provider（M1-E） | PostgresMemoryProvider：pg Pool、write/get/search/forget/audit、`--pg-url` | MemoryHub 只有 SQLite/HTTP，缺 PG 直连 | pg-mem 契约测试通过；真实 PG 容器/服务待接 |
| Memory 巩固（M1-F） | MemoryConsolidator：duplicate/conflict/new-wins/manual/keep-both | 记忆只写不巩固，冲突无解释 | 3 个测试；旧记录 contested + supersededBy |
| Memory 注入（M1-G） | MemoryInjector：作用域内 search、topK/minScore、maxChars、memory/injected 事件 | 记忆只在工具里，不进入模型上下文 | 2 个测试；Agent 首轮注入，失败降级 |
| Memory 治理（M1-H） | MemoryGovernance：viewer/editor/admin、tenant/project、审计 | 只有 scope，没有 RBAC | 2 个测试；越权抛 MemoryAccessDenied |
| KB 适配器（M1-I） | WebKnowledgeBaseProvider + McpKnowledgeBaseProvider + HttpMcpTransport | KB 只有 local/http | 4 个测试；`--kb-kind web|mcp` 可切；citation |
| Metrics（M1-J） | computeMetrics/formatMetrics：审批/工具/cache/guardian/延迟 P50/P95；TUI /metrics | 没有仪表 | 1 个测试；/metrics 可见 |
| Cache 映射（M1-K） | OpenAI cached_tokens → cacheReadTokens；fetch 注入测试 | provider usage 不可测 | 2 个测试；local HTTP mock 128 cached；真实 key 待接 |
| Guardian 模型版（M1-L） | ModelGuardian JSON 评审 + GuardianShadow 对比；`--guardian model` | 只有规则版，无模型对比 | 3 个测试；shadow 返回规则决策并记录 mismatch |
| Work Graph（M2-A） | Goal/Task DAG/依赖/ready/todo/持久化；TUI /goal /task /tasks /start /done | 长任务没有单一任务图，Todo 容易变第二任务表 | 3 个测试；Todo 是 Work Graph 投影；JSON 落盘 |
| Actor Runtime（M2-B） | ActorRuntime：spawn/wait/stop/list/children/mailbox/event | 无后台子代理生命周期 | 4 个测试；父子/停止/失败可观察 |
| Scheduler（M2-C） | Scheduler：wakeup/interval/monitor、handler registry、snapshot/restore、JSON 落盘 | 无定时/唤醒/恢复 | 3 个测试；wakeup/interval/restore 通过 |
| Event Bus（M2-D） | EventBus：subscribe/publish/wildcard/history/replay | 只有 JSONL，无订阅/hook | 2 个测试；事件可订阅/回放 |
| Capability（M2-E） | CapabilityRegistry：manifest/version/permissions/tools/eval、install/enable/disable/uninstall、JSON 落盘 | 无技能包生命周期 | 2 个测试；schema/权限/版本可查 |
| Context Projection（M2-F） | ContextProjector：middle summary、preserveRecent、shadow original、restore；Agent 可选 projection | 长上下文无压缩 | 2 个测试；压缩后可恢复 |
| Goal/Plan（M2-G） | GoalEvaluator（任务+evidence）、PlanArtifact/PlanStore、renderPlan | Goal 无独立判定，计划无工件 | 2 个测试；evidence 缺失/失败可判定 |
| Checkpoint（M2-H） | Checkpoint/CheckpointStore：plan 快照、list/latest/restore | 执行前无恢复点 | 1 个测试；快照可恢复 |
| MemoryHub facade（M3-A） | MemoryHub：graph expansion + Outbox + RelationStore | MemoryProvider 之上缺图/outbox | 1 个测试；graph 命中 + outbox drain |
| Hybrid recall（M3-B） | EmbeddingProvider + InMemoryVectorIndex + MemoryHub vector search；Actor fork prefix | 只有 lexical/graph，无向量；fork 无前缀 | 2 个测试；vector matchedBy + fork prefix 复用 |
| MemoryHub API（M3-C） | HTTP server：write/search/get/forget/health、Bearer、scope headers；`--serve-memory` | MemoryHub 无对外入口 | 1 个测试；真实 HTTP 请求通过 |
| MemoryHub MCP（M3-D） | initialize/ping/tools/list/tools/call；memory_search/write/get | 没有 MCP 入口 | 1 个测试；MCP tools 可调用 |
| v1.0 demo/gate（M3-E） | scripts/v1-demo.ts 端到端；docs/v1.0-gate.md 对照 | 无端到端证据，易虚报 v1.0 | demo PASS；gate 明确未过 |
| MemoryHub schema（M3-F） | migrations/001_memoryhub.sql：pgvector/HNSW/relations/outbox/audit | 无 PG 建表工件 | schema 已落盘；真实 PG 执行待验证 |
| Real PG（M3-G） | scripts/pg-live.ts：真实 postgres:16-alpine 连接/建表/写查删 | pg-mem 不能证明真实连接 | **PASS**：write/get/search/forget/health |
| pgvector 尝试（M3-H） | postgres16 容器内 apk 安装 pgvector 0.8.1 | PG16 与包内 PG18 extension 路径不匹配；PG18 镜像拉取停滞 | **未验证**；不宣称 vector 生效 |
| pgvector probe（M3-I） | probePgVector：查询 pg_extension.vector；2 个测试 | 无法判断实例是否支持 vector | fail-closed 探针；真实实例仍待跑 |
| pgvector live（M3-J） | 源码编译 v0.8.0 + CREATE EXTENSION + vector(1536) + HNSW + cosine query | pgvector 只在文档里 | **PASS**：索引创建 + 距离查询 |
| PgVectorIndex（M3-K） | PgVectorIndex + MemoryHub asyncVectorIndex | 向量检索仍走内存索引 | **PASS**：真实 PG vectorHit beta-live score=1.00 |
| Model HTTP（M1-L） | 本地 OpenAI-compatible HTTP server 测试；cached_tokens 24 | 只有 fake fetch，无 HTTP 端到端 | 1 个测试；HTTP 路径通过 |
| Agent HTTP（M1-N） | Agent+OpenAICompatibleModel+本地 server+tool call | 没有 agent HTTP 端到端 | 1 个测试；cacheReadTokens=128，file 写入 |
| Local model（M1-P） | CLI --model-base-url/model-name/model-key；无 key 时 local key | 本地 OpenAI-compatible 模型必须假装有 key | 可直接接本地模型；keyless 路径可用 |
| v1 demo PG（M3-M） | v1-demo 支持 WEFT_PG_URL；真实 PG + PgVectorIndex | demo 只跑 SQLite | **PASS**：goal/actor/scheduler/memory 全链路 |
| v1.0 release（M3-N） | gate PASS、版本 1.0.2、发布说明、tag | 无正式 release 口径 | v1.0.2 RELEASED |
| 长任务验收（M3-Q） | 50-step WorkGraph/Plan/Checkpoint/Evidence/Event replay；报告 JSON | 长任务不可逐步追溯 | PASS：50 steps/5 checkpoints/50 evidence/minConfidence=0.9 |
| v1.0 RC（M3-L） | docs/v1.0-rc.md：功能矩阵/证据/外部缺口 | 无 RC 口径，易虚报 | RC 明确未发布 |
| WSL conformance（M1-O） | 导入专用 weft-sandbox + weft uid=1001 + runuser | WSL 原发行版用户映射失败 | **PASS**：路径/工作区/写/非 root；network/write-outside SKIP |
| Arch VM conformance（M1-R） | VMware Arch 7.1.3 + Node 24.22.2；真实 Linux 用户态跑 81 tests/demo/v1/长任务 | Docker/WSL 不等于真实 Linux 宿主 | **PASS**：workspace-guard + bwrap |
| Guardian 50（M1-M） | 50 动作 rule/model shadow harness | 无 50 动作对比证据 | harness PASS；fake model；真实 key 待接 |
| 文档/接口 | PRD/ROADMAP/M0 status/interfaces/appendix/README | 范围漂移、实现无契约 | PRD/ROADMAP FROZEN；接口契约可测试 |

---

## 3. 时间线（commit）

| 日期 | 范围 | 交付 | 效果/证据 | Commit |
|---|---|---|---|---|
| 2026-11-01 | 产品文档 | PRD v1.0、ROADMAP v1.0、Memory 默认红帽/Polyglot 附录、KB 接口 | 范围冻结；8 概念/F-ID；接口契约 | 2b576f4 |
| 2026-11-01 | M0 基础 | 事件日志/请求/权限/沙箱/Memory/KB/工具/Agent/TUI/CLI | 12 tests pass；demo 7 steps/6 tools；cacheStable=6 | 2b576f4 |
| 2026-11-01 | M0 修复 | TUI EOF 处理 | 管道/关闭 stdin 不再以异常退出 | 5d20446 |
| 2026-11-01 | M1-A | Guardian shadow + 熔断、CUA 策略、usage/cacheReadTokens | 18 tests pass；guardian/assessment=6；model/usage=7 | 137d0d6 |
| 2026-11-01 | M1-B | WSL sandbox backend：probe/命令构造/fail-closed | 22 tests pass；`--sandbox wsl` 在 DSH 内显式失败 | 2bea213 |
| 2026-11-01 | M1-B | Docker Linux backend + conformance + shell capture fix | 25 tests pass；guard conformance PASS；docker daemon Stopped | 45081f3 |
| 2026-11-01 | M1-C | HTTP KB adapter | 27 tests pass；--kb-url 可切；外部 KB 只读接入 | c411761 |
| 2026-11-01 | M1-B | Docker auto-start + canary helper | 29 tests pass；默认自启动；容器 smoke uid=1000 | 10634b6 |
| 2026-11-01 | M1-B | Docker conformance 6 项 | PASS：/workspace、write、uid=1000、network none、read-only /etc 拒绝 | 14cfcef |
| 2026-11-01 | M1-D | HTTP MemoryHub provider | 31 tests pass；--memory-url 可切；远程 MemoryProvider 契约 | 87dac81 |
| 2026-11-01 | M2-A | Work Graph foundation | 34 tests pass；Goal/Task DAG/ready/todo；TUI 命令 | 4a368f7 |
| 2026-11-01 | M2-B | Actor Runtime | 55 tests pass；spawn/wait/stop/children/mailbox | cc15527 |
| 2026-11-01 | M2-C/D | Scheduler + Event Bus | 60 tests pass；wakeup/interval/restore、subscribe/replay | 42204d2/68247c0 |
| 2026-11-01 | M2-E/F | Capability + Context Projection | 64 tests pass；install/uninstall、压缩/restore | f284aa4 |
| 2026-11-01 | M2-G | Goal evaluator + Plan artifact | 66 tests pass；evidence/plan 落盘 | e94b2b1 |
| 2026-11-01 | M2-H/M3-A | Checkpoint + MemoryHub facade | 68 tests pass；restore/graph/outbox | ee9d7c1 |
| 2026-11-01 | M2-I/M3-B | Actor fork + hybrid vector | 70 tests pass；prefix 复用 + vector recall | 5d573b0 |
| 2026-11-01 | M3-C | MemoryHub HTTP API | 71 tests pass；/health/write/search/get/forget | 8451f77 |
| 2026-11-01 | M3-D | MemoryHub MCP endpoint | 72 tests pass；initialize/tools/call | 429e352 |
| 2026-11-01 | M3-E | v1.0 demo + gate | demo PASS；gate 未过（真实 PG/key/OS） | 483fc6c |
| 2026-11-01 | M3-F | MemoryHub pgvector schema | migration 已落盘；未执行 | e792188 |
| 2026-11-01 | M3-G | Real Postgres contract | PASS；postgres:16-alpine 55432 | 5aeb8ce |
| 2026-11-01 | M3-I | pgvector probe | 74 tests pass；探针 fail-closed | a774864 |
| 2026-11-01 | M3-J | pgvector live | PASS；extension/vector/HNSW/cosine | 575bd13 |
| 2026-11-01 | M3-K | PgVectorIndex + MemoryHub | PASS；真实 vector search | 128f614 |
| 2026-11-01 | M1-L/M | local HTTP model + Guardian 50 harness | 76 tests；50 actions 0 mismatch | cb0bf2c |
| 2026-11-01 | M1-N | agent HTTP integration | 77 tests；cacheReadTokens=128 | 8522da9 |
| 2026-11-01 | M1-P | keyless local model CLI | 77 tests；--model-base-url | 64fd8e3 |
| 2026-11-01 | M3-M | v1 demo on real PG/pgvector | PASS；memoryHits=2 | e24affc |
| 2026-11-01 | M3-N | v1.0.0 release | 77 tests；gate PASS；版本 1.0.0 | 0f1a9c7 |
| 2026-11-02 | M3-O | 真实 DeepSeek 验收 + 真实 Guardian 50 | cacheReadTokens=2304；50 actions/0 mismatch | 579aa15 |
| 2026-11-02 | M3-P | v1.0.1 release | gate PASS；真实模型验收 | 7e17718 |
| 2026-11-02 | M3-R | v1.0.2 release | README/验收矩阵/安装脚本 | b7401e3 |
| 2026-11-02 | M3-Q | 50-step long-task acceptance | PASS；50 evidence/5 checkpoints | b7401e3 |
| 2026-11-01 | M1-O | WSL conformance | 77 tests；专用 distro + weft uid=1001 PASS | e548eba |
| 2026-11-02 | M1-Q | sandboxed approval profile | 79 tests；docker/wsl 自动少打扰 | ec56e2b |
| 2026-11-03 | M1-R | Arch VM conformance | 79 tests/demo/v1/long PASS | 5068288 |
| 2026-11-03 | M1-S | bwrap Linux native backend | 81 tests；6 项 conformance PASS | 9cc2143 |
| 2026-11-03 | M1-T | sandboxed auto-read policy | 82 tests；非敏感外部读自动允许 | b7c6818 |
| 2026-11-04 | M4-plan | v2 路线 checkpoint + release 纪律 | M4/M5/M6；附录未决问题 | a0ae3c7 |
| 2026-11-04 | M4-A | runtime schema/contract | 87 tests；RuntimeStore 接口/002 SQL | eb34bb4 |
| 2026-11-04 | M4-B | SQLite RuntimeStore | 89 tests；events/leases/outbox | 1673c6d |
| 2026-11-04 | M4-C | Postgres RuntimeStore | 90 tests；pg-mem 契约 | 8607f5f |
| 2026-11-04 | M4-D | Thread/WorkGraph binding | 92 tests；threadId roundtrip | 8d2f44a |
| 2026-11-04 | M4-E | CapabilityRegistry 统一 | 93 tests；legacy 迁移 | c436a4f |
| 2026-11-04 | M4-F | v1 只读迁移 | 94 tests；原文件不变 | 4c5b11f |
| 2026-11-04 | M4-G | 真 PG RuntimeStore 契约 | PASS；95 tests；scope 隔离 | c30e685 |
| 2026-11-04 | M4-H | v1.5.0 release | 95 tests；真 PG；v1 迁移；tag | bd482a0 |
| 2026-11-04 | M5-A | Agent Gateway 最小 API | 96 tests；threads/messages/events | 394521c |
| 2026-11-04 | M5-B | WorkerPool | 98 tests；claim/lease/complete/fail | d303db9 |
| 2026-11-04 | M5-C | Router/Mandate | 100 tests；准入/过期/幂等 | 82454a4 |
| 2026-11-04 | M5-D | SSE + Watchdog | 102 tests；流式/告警 | f0b7cbe |
| 2026-11-04 | M5-E | AgentLoop seam + Eval | 104 tests；seam/幂等 | e98a7df |
| 2026-11-04 | M5-F | HTTP Source + CLI serve | 105 tests；E2E PASS | 待提交 |
| 2026-11-04 | M5-G | v1.6.0 release | 105 tests；E2E；tag | 待提交 |
| 2026-11-01 | M3-L | v1.0 RC | RC 代码完成；未发布 | 8bdb955 |
| 2026-11-01 | M1-E | Postgres MemoryProvider | 35 tests pass；pg-mem 契约通过；--pg-url 可切 | eddb1bb |
| 2026-11-01 | M1-F | Memory 巩固/冲突消解 | 38 tests pass；duplicate/new-wins/manual | 52ce0c1 |
| 2026-11-01 | M1-G | Memory 检索/注入 | 40 tests pass；Agent 上下文含 MEMORY；memory/injected | 73978a0 |
| 2026-11-01 | M1-H | Memory RBAC/治理 | 42 tests pass；viewer/editor/admin；越权拒绝 | 16328af |
| 2026-11-01 | M1-I | web/MCP KB 适配器 | 46 tests pass；local/http/web/mcp 可切 | 77eaa49 |
| 2026-11-01 | M1-J | metrics/TUI | 47 tests pass；审批/工具/cache/guardian/延迟 | 656f693 |
| 2026-11-01 | M1-K/L | cache 映射 + 模型 Guardian shadow | 51 tests pass；cached_tokens=80 mock；mismatch 记录 | c2041a0 |

---

## 4. 当前可验证结果

~~~text
105 tests, 105 pass, 0 fail；v1 demo PASS；real DeepSeek/PG/pgvector；v1.0.2 RELEASED

Weft M0 complete: file written, shell verified, memory stored and recalled, knowledge base searched.
steps=7 toolCalls=6 cacheStable=6 cacheReadTokens=0
events=69 [approval/decided=6, approval/requested=6, assistant/message=7,
  guardian/assessment=6, model/usage=7, request/frozen=7, ...]
request cachePrefixStable=true ...
~~~

---

## 5. 已知缺口（按优先级）

| 优先级 | 缺口 | 影响 | 下一步 |
|---|---|---|---|
| P0 | Windows OS 沙箱未实现 | Docker Linux backend 已 conformance PASS；Windows/WSL backend 未验证；**不是要求改 DSH 授权** | M1：Windows VM/WSL conformance；见 [docs/docker-conformance.md](docs/docker-conformance.md) |
| P0 | PG MemoryHub 服务端未接 | Postgres provider + pg-mem 契约已有；真实 PG 容器/服务未接 | M1/M3：启动 PG 容器、跑真实契约 |
| P0 | 真实 provider cache 未接 | cacheReadTokens 恒 0 | M1：接真实模型 usage |
| P1 | Guardian 只有规则版 | 无模型评审/多模态 | M1：模型 reviewer + shadow 对比 |
| P1 | CUA 无 driver | 只有策略 | M1/M4：MCP/native driver |
| P1 | KB 适配器不全 | local-docs + http-kb 已有；web/mcp 未接 | M1：web/mcp 适配器 + 注入样本 |
| P2 | Work Graph/Actor/Scheduler/Event Bus | M2 未开始 | M2 |
| P2 | 多租户/审计/配额 | v1.5 | M4 |

---

## 6. 下一步（M1 收口 + M2 开工）

1. Windows VM / WSL backend conformance（Docker Linux 已 PASS）；Windows RestrictedToken/MXC 后续。
2. M2-B：Actor Runtime + Scheduler + Event Bus。
3. 真实模型接线 + provider usage/cacheReadTokens。
4. Guardian 从规则版升级为模型 reviewer（shadow 对比；超时/熔断保留）。
5. CUA 策略接 MCP driver 接口（只做治理，不自研 driver）。
6. PG MemoryHub 骨架（PG+pgvector；SQLite 保留为 dev）。
7. KB 适配器 web/mcp + 注入样本。
8. M1 exit criteria 对照与演示。
