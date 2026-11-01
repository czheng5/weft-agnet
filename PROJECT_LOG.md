# Weft 项目开发日志

> 用途：项目管理视角的独立台账。只记录“开发了什么 / 解决了什么问题 / 达到什么效果”，不写流水账、不替代 PRD/ROADMAP。  
> 更新规则：每次提交追加一行；效果尽量给可验证证据（测试数、事件数、命令、commit）。  
> 当前版本目标：v1.0（M0–M3），当前阶段：M0 完成，M1-A 部分落地。

---

## 1. 状态总览

| 里程碑 | 状态 | 进度 | 说明 |
|---|---|---|---|
| M0 Foundation | ✅ 完成（骨架） | 100% | 事件日志/请求分区/权限/审批缓存/workspace 守卫/SQLite Memory/KB/TUI/测试 |
| M1 Safety & Memory skeleton | ◐ 进行中 | ~45% | Guardian、CUA、usage、WSL backend、Docker backend + conformance 脚本已落地；真实 OS conformance/PG/缓存未完成 |
| M2 Long-horizon | ⏳ 未开始 | 0% | Work Graph/Actor/Scheduler/Event Bus/Capability/Context |
| M3 Memory & v1.0 | ⏳ 未开始 | 0% | PG MemoryHub 完整/治理/评测/v1.0 gate |
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
| Docker Linux backend（M1-B） | DockerSandboxBackend：network none/read-only/cap-drop/non-root/pids/memory/cpus；`--sandbox docker` | 需要一个可用的 Linux OS 边界 | 命令构造/测试通过；conformance.cmd 可跑；当前 daemon Stopped，真实容器验收待跑 |
| Shell 输出捕获修复 | ShellSandbox 从 pipe 改为临时文件重定向 | DSH 内 Node child_process pipe 报 EPERM，demo 的 shell 实际失败 | demo 现在真正拿到 stdout=2；新增 capture 测试 |
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

---

## 4. 当前可验证结果

~~~text
25 tests, 25 pass, 0 fail

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
| P0 | Windows OS 沙箱未实现 | workspace-guard 不是 OS 边界；WSL/Docker backend 已实现，但真实 conformance 未跑；**不是要求改 DSH 授权** | M1：启动 Docker Desktop + 拉镜像跑 docker conformance；WSL/Windows VM 后续；见 [docs/sandbox-verification.md](docs/sandbox-verification.md) |
| P0 | PG MemoryHub 未实现 | SQLite 只是开发 provider | M3：PG+pgvector+graph |
| P0 | 真实 provider cache 未接 | cacheReadTokens 恒 0 | M1：接真实模型 usage |
| P1 | Guardian 只有规则版 | 无模型评审/多模态 | M1：模型 reviewer + shadow 对比 |
| P1 | CUA 无 driver | 只有策略 | M1/M4：MCP/native driver |
| P1 | KB 只有 local-docs | web/mcp/http 未接 | M1：适配器 |
| P2 | Work Graph/Actor/Scheduler/Event Bus | M2 未开始 | M2 |
| P2 | 多租户/审计/配额 | v1.5 | M4 |

---

## 6. 下一步（M1 剩余）

1. 启动 Docker Desktop + 拉 node:24-bookworm-slim，外层跑 `conformance.cmd --backend docker`。
2. WSL backend conformance（外层/正常主机）+ Windows RestrictedToken/MXC（后续）。
3. 真实模型接线 + provider usage/cacheReadTokens。
4. Guardian 从规则版升级为模型 reviewer（shadow 对比；超时/熔断保留）。
5. CUA 策略接 MCP driver 接口（只做治理，不自研 driver）。
6. PG MemoryHub 骨架（PG+pgvector；SQLite 保留为 dev）。
7. KB 适配器 web/mcp/http + 注入样本。
8. M1 exit criteria 对照与演示。
