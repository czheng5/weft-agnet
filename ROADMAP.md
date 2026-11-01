# Weft Roadmap v1.0

> 状态：**FROZEN for v1.0**（2026-11-01）。范围以 [PRD.md](PRD.md) 为准；本文只定义顺序、依赖、exit criteria 与回滚。  
> 原则：一个概念一个实现；先安全执行，再长程规划，再记忆成长；v1.0 缝合、v1.5 收口、v2.0 自有形状。

---

## 0. 总览

| 阶段 | 周期（估） | 目标 | 发布 |
|---|---|---|---|
| **M0 Foundation** | 0–4 周 | 内核/日志/请求分区/沙箱/审批缓存/TUI/接口 | 内部 alpha |
| **M1 Safety & Memory skeleton** | 4–8 周 | 审批阶梯/Guardian shadow/CUA 治理/缓存指标/KB/Memory 骨架 | 内部 beta |
| **M2 Long-horizon core** | 8–14 周 | Work Graph/Actor/Scheduler/Event Bus/Capability/Context | 内部 rc |
| **M3 Memory & v1.0** | 14–20 周 | MemoryHub 完整/治理/评测/v1.0 gate | **v1.0** |
| **M4 Consolidation** | +6–8 周 | 收口适配层/一 schema/多租户/技能演化/CUA driver | v1.5 |
| **M5 Own shape** | +12–16 周 | 自有协议/Weft Bench/插件生态/Polyglot 评估 | v2.0 |

关键路径：**M0 内核 → M1 权限 → M2 工作图 → M3 记忆 → v1.0**。  
并行：Memory schema（M0 开始）、KB 接口（M0）、TUI（M0）、评测（M1）。

---

## 1. M0 · Foundation（0–4 周）

> 2026-11-01：M0 可运行骨架已落地（事件日志/请求分区/权限阶梯/审批缓存/workspace 守卫/SQLite MemoryProvider/local-docs KB/Weft TUI/12 tests）。状态与限制见 [docs/m0-status.md](docs/m0-status.md)。

### 目标

一个任务能跑通，且每一层都有可替换的缝。

### 范围（F-IDs）

- F-CX-001 请求四区（Z0-Z3）
- F-PS-001 沙箱/权限 profile（Windows 至少一个后端）
- F-PS-002 审批阶梯 + 会话缓存
- F-MF-005 MemoryProvider 接口 + 契约测试骨架
- F-KB-001 KnowledgeBaseProvider 接口
- F-SR-001 Weft TUI/CLI
- F-OB-001 基础指标（先日志/计数）

### Exit criteria

1. 一个真实任务：读文件 → 改文件 → 跑测试，全程有 session log。
2. 进程重启后能从日志恢复；未完成工具调用标记 unknown。
3. 请求分区可见；同一会话第二次请求前缀稳定（录屏/快照/哈希）。
4. 沙箱能拒绝越界写；拒绝原因可读。
5. 审批缓存：同类动作第二次不重复问。
6. MemoryProvider/KBProvider 接口可编译；默认 provider 骨架过契约测试的空实现。
7. TUI 显示启动、审批、状态、当前 workspace。

### 依赖与风险

- 依赖：无。
- 风险：Windows 沙箱后端不可用 → 只支持 RestrictedToken，不静默降级；记录能力缺口。
- 回滚：M0 不发布，按 feature flag 关闭。

---

## 2. M1 · Safety & Memory skeleton（4–8 周）

> 2026-11-01：M1-A/B 部分落地（Guardian shadow + 熔断、CUA 策略、model usage、WSL/Docker sandbox backend + conformance 脚本、HTTP KB、HTTP/Postgres MemoryHub、Memory 巩固/注入/RBAC、local/http/web/mcp KB、Docker 自启动 + Docker Linux conformance PASS；46 tests）。真实 Docker/WSL/Windows OS conformance、PG MemoryHub、真实缓存仍待完成。详见 [PROJECT_LOG.md](PROJECT_LOG.md)。

### 目标

权限“顺”且可审计；记忆能写能读；KB 只读可用。

### 范围

- F-PS-003 Guardian shadow
- F-PS-004 CUA 治理策略（app allowlist/锁屏/日志；driver 可接 MCP）
- F-CX-003 缓存命中观测
- F-MF-001 MemoryHub 骨架（PG+pgvector）
- F-MF-002 写入/巩固（最小）
- F-MF-003 检索/注入（最小）
- F-KB-002 local/web/MCP KB 适配器
- F-OB-001 指标仪表

### Exit criteria

1. Guardian shadow 对比：对 50 个动作给出 allow/deny，和人工/规则对照有记录；不直接执行拦截。
2. 审批：无静默放行；升级保留 deny-read；拒绝有原因。
3. 缓存：第一次之后 cacheReadTokens > 0；首 miss 可归因。
4. Memory：写入后可按 id 读；search 可召回；删除返回 pending。
5. KB：三个适配器可切换；每个 hit 带 citation；注入样本不执行；超时降级。
6. 指标：审批次数、缓存命中、记忆 P50/P95、KB 延迟。

### 依赖与风险

- 依赖：M0。
- 风险：Guardian 误判 → 只 shadow；CUA 治理复杂 → 先策略/日志，driver 后置。
- 回滚：Guardian 关闭；CUA 仅策略；Memory 写开关关闭。

---

## 3. M2 · Long-horizon core（8–14 周）

> 2026-11-01：M2-A Work Graph 地基已落地（Goal/Task DAG/依赖/ready/todo/持久化；TUI 命令；34 tests）。Actor/Scheduler/Event Bus/压缩未开始。

### 目标

长任务有计划、有任务图、有 Actor、有调度、有事件、有技能包、有压缩。

### 范围

- F-WG-001 Goal 契约
- F-WG-002 Plan 工件
- F-WG-003 Work Graph schema
- F-WG-004 Task DAG + Todo 投影
- F-AR-001 Actor Runtime
- F-SC-001 Scheduler
- F-EB-001 Event Bus + Hooks
- F-CP-001 Capability Package registry
- F-CX-002 压缩/投影

### Exit criteria

1. Goal 可被独立 evaluator 判定；Plan 落盘；压缩后重注入。
2. Task DAG：依赖/ owner/验收可查；Todo 只是投影，不是第二任务表。
3. Actor：子代理可后台启动、命名、收结果、停止；fork 复用父前缀。
4. Scheduler：cron/wakeup/monitor 至少两种可用；重启后恢复。
5. Event Bus：生命周期事件可订阅/回放；权限 hook 只是其中一个 domain。
6. Capability Package：安装/加载/卸载；schema/权限/版本可查。
7. 压缩：shadow 投影可恢复；原始事件不丢；缓存前缀可复用。

### 依赖与风险

- 依赖：M0/M1。
- 风险：概念蔓延 → 每个概念只允许一个 schema；子代理/任务板不要两套。
- 回滚：按 feature flag；Work Graph 可退回 plan 文件。

---

## 4. M3 · Memory & v1.0（14–20 周）

### 目标

MemoryHub 完整；治理可用；v1.0 gate 通过。

### 范围

- F-MF-001/002/003/004 MemoryHub 完整
- F-MF-005 默认 provider 契约测试
- F-KB-002 KB 集成
- F-OB-001 评测/指标
- F-PS-003 Guardian（从 shadow 到可选 enforce）
- v1.0 文档/演示/发布

### Exit criteria（v1.0 gate）

1. 一个真实 Windows 任务端到端通过：计划 → 执行 → 验证 → 记忆 → 恢复。
2. Memory：跨会话记住偏好；删除传播；跨 scope 零泄漏；hot/warm 延迟达标。
3. KB：只读检索带 citation；注入样本不执行；超时降级。
4. 权限：同类动作只问一次；升级保留 deny-read；Guardian 可解释。
5. 缓存：第一次之后命中 > 0；首 miss 可归因；无回归。
6. 可观测：审批/缓存/记忆/任务四类指标可见。
7. 文档：PRD/ROADMAP/接口/附录一致；无未决 P0。

### 依赖与风险

- 依赖：M0–M2。
- 风险：PG 容量/图查询 → 先 PG 图；超限记录，v2 评估派生图/Polyglot。
- 回滚：v1.0 分支冻结；Memory 写可降级为只读；Guardian 回 shadow。

---

## 5. M4 · Consolidation（v1.5，+6–8 周）

### 目标

删掉“第二套语义”，一个概念一个 schema/owner/契约测试。

### 范围

- F-AR-002 Team 邮箱/任务板
- F-CP-002 技能演化 + held-out/canary
- F-GOV-001 多租户/审计/配额
- F-SR-002 Web/Desktop
- F-MF-006 Polyglot provider 契约实现（不默认启用）
- F-PS-005 CUA driver（可选）

### Exit criteria

1. 8 概念各只有一个 schema、一个 owner、一套 contract tests。
2. 适配层只剩外部 provider 必需；无第二套任务/记忆/技能。
3. 多租户隔离测试通过；审计可查。
4. 技能演化 canary/回滚通过。
5. Polyglot provider 通过同一套 MemoryProvider 契约测试（默认 disabled）。

### 依赖与风险

- 依赖：M3。
- 风险：重构回归 → 保留 v1.0 分支；逐概念迁移。
- 回滚：按 provider 开关；旧 schema 只读兼容。

---

## 6. M5 · Own shape（v2.0，+12–16 周）

### 目标

协议、评测、UX、成长闭环都是 Weft 的；borrowed 组件可替换。

### 范围

- Weft Protocol（Work Graph/Event/Memory/Capability manifest）
- Weft Bench（cache/打断/误放行/长程/记忆）
- 插件生态（Capability Package）
- Polyglot provider 真实规模评估
- 专用记忆模型评估（可选）

### Exit criteria

1. 外部插件只依赖 Weft Protocol，不依赖 Codex/Claude/DSH 内部类型。
2. 任一 borrowed 组件可在不改概念的情况下替换。
3. Weft Bench 有基线；v2.0 对比 v1.5 有可解释提升。
4. 记忆/技能成长有 held-out/canary/回滚。
5. 多租户/治理/成本达标。

### 依赖与风险

- 依赖：M4。
- 风险：过度自研 → 只在指标证明必要时替换；不为了“纯”而重写。

---

## 7. Feature → Milestone 映射

| 概念 | v1.0（M0–M3） | v1.5（M4） | v2.0（M5） |
|---|---|---|---|
| Work Graph | Goal/Plan/Graph/DAG | Team 任务板 | 协议化 |
| Actor | 单层 Actor | 多 actor/邮箱 | 跨进程/远程 |
| Scheduler | cron/wakeup/monitor | 配额/优先级 | 分布式调度 |
| Event Bus | typed events/hooks | 审计/回放增强 | 协议化 |
| Capability | registry/install | 演化/canary | 插件市场 |
| Memory | Red Hat 型 MemoryHub | 多租户/治理 | Polyglot 评估 |
| Context | Z0-Z3/压缩/指标 | 自适应压缩 | 自有投影协议 |
| Surface | TUI/CLI | Web/Desktop | 插件化 surface |
| KB | 只读 provider | 更多适配器 | 写入/ingest 评估 |

---

## 8. 风险登记与回滚

| 风险 | 触发 | 回滚 |
|---|---|---|
| Windows 沙箱不可用 | M0 拒绝/崩溃 | 只用 RestrictedToken；记录缺口；不静默降级 |
| Guardian 误判 | shadow 对比差 | 关 Guardian；回人工 |
| Memory 容量 | P95/容量超限 | 降图查询；只读；v2 评估 Polyglot |
| KB 注入 | 红队样本通过 | 关 KB provider；加过滤 |
| 范围蔓延 | P0 增加 | PRD frozen；ADR；延期 |
| 适配层变第二实现 | 双 schema | 契约测试失败即阻塞 |

---

## 9. 发布检查清单

- [ ] PRD 版本与 ROADMAP 一致
- [ ] 所有 P0 feature 有验收证据
- [ ] 一个真实任务端到端
- [ ] 缓存/审批/记忆/KB 指标可见
- [ ] 删除传播/跨 scope 零泄漏
- [ ] 文档/接口/附录一致
- [ ] 回滚开关可用
- [ ] v1.0 分支冻结，变更走 ADR
