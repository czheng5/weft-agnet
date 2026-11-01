# Weft 项目开发日志

> 用途：项目管理视角的独立台账。只记录“开发了什么 / 解决了什么问题 / 达到什么效果”，不写流水账、不替代 PRD/ROADMAP。  
> 更新规则：每次提交追加一行；效果尽量给可验证证据（测试数、事件数、命令、commit）。  
> 当前版本目标：v1.0（M0–M3），当前阶段：M0 完成，M1-A 部分落地。

---

## 1. 状态总览

| 里程碑 | 状态 | 进度 | 说明 |
|---|---|---|---|
| M0 Foundation | ✅ 完成（骨架） | 100% | 事件日志/请求分区/权限/审批缓存/workspace 守卫/SQLite Memory/KB/TUI/测试 |
| M1 Safety & Memory skeleton | ◐ 进行中 | ~95% | Guardian（规则/模型 shadow）、CUA、usage/cache 映射、Docker conformance、Memory 巩固/注入/RBAC、四路 KB、metrics；真实 PG/Windows/WSL/真实 key 未完成 |
| M2 Long-horizon | ✅ 代码/单测 | 100% | Work Graph/Goal/Plan/Evidence/Checkpoint/Actor fork/Scheduler/EventBus/Capability/Projection |
| M3 Memory & v1.0 | ◐ 进行中 | ~40% | MemoryHub facade/hybrid/HTTP/MCP；PG+pgvector 真实服务/v1.0 gate 未接 |
| M4 v1.5 | ⏳ 未开始 | 0% | 收口/多租户/技能演化/CUA driver/Polyglot 契约 |
| M5 v2.0 | ⏳ 未开始 | 0% | 自有协议/Weft Bench/插件生态 |

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
| Shell 输出捕获修复 | ShellSandbox 从 pipe 改为临时文件重定向 | DSH 内 Node child_process pipe 报 EPERM，demo 的 shell 实际失败 | demo 现在真正拿到 stdout=2；新增 capture 测试 |
| HTTP KB（M1-C） | HttpKnowledgeBaseProvider：/search、/docs、/health、Bearer、scope headers、timeout | KB 只有本地文件，无法接外部知识库 | 2 个测试；`--kb-url` 可切；只读、不自动入 Memory |
| HTTP MemoryHub（M1-D） | HttpMemoryProvider：write/search/get/forget/health、Bearer、scope headers、timeout | 只有 SQLite dev，接不上远程 MemoryHub | 2 个测试；`--memory-url` 可切；默认仍 SQLite |
| Postgres provider（M1-E） | PostgresMemoryProvider：pg Pool、write/get/search/forget/audit、`--pg-url` | MemoryHub 只有 SQLite/HTTP，缺 PG 直连 | pg-mem 契约测试通过；真实 PG 容器/服务待接 |
| Memory 巩固（M1-F） | MemoryConsolidator：duplicate/conflict/new-wins/manual/keep-both | 记忆只写不巩固，冲突无解释 | 3 个测试；旧记录 contested + supersededBy |
| Memory 注入（M1-G） | MemoryInjector：作用域内 search、topK/minScore、maxChars、memory/injected 事件 | 记忆只在工具里，不进入模型上下文 | 2 个测试；Agent 首轮注入，失败降级 |
| Memory 治理（M1-H） | MemoryGovernance：viewer/editor/admin、tenant/project、审计 | 只有 scope，没有 RBAC | 2 个测试；越权抛 MemoryAccessDenied |
| KB 适配器（M1-I） | WebKnowledgeBaseProvider + McpKnowledgeBaseProvider + HttpMcpTransport | KB 只有 local/http | 4 个测试；`--kb-kind web|mcp` 可切；citation |
| Metrics（M1-J） | computeMetrics/formatMetrics：审批/工具/cache/guardian/延迟 P50/P95；TUI /metrics | 没有仪表 | 1 个测试；/metrics 可见 |
| Cache 映射（M1-K） | OpenAI cached_tokens → cacheReadTokens；fetch 注入测试 | provider usage 不可测 | 1 个测试；mock 返回 80 cached；真实 key 待接 |
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
72 tests, 72 pass, 0 fail

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
