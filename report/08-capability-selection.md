# 08 · 能力择优决策记录（Best-of-Breed ADR）

> 决策：**同一能力只保留一个 canonical 实现**。其余三家只作为语义、接口、测试与失败模式的参考，不并行实现、不并行维护。
>
> 排名与“v1.0 缝合 → v1.5 收口 → v2.0 自有形状”的概念合并见 [09-ranking-and-concept-merge.md](09-ranking-and-concept-merge.md)。
>
> 这份文档回答三个问题：
> 1. 每个能力选谁？
> 2. 为什么不是另外几家？
> 3. 当前 PRD/roadmap 里还有哪些“可能被做两遍”的地方？

---

## 1. 结论

- **25 个能力决策**，每个都有明确的 winner / runner-up / rejected。
- **0 个能力**采用“四套并行实现”。
- **薄适配层**是必要的（接口/语义差异），但适配层不是第二套实现；适配层不承载业务规则。
- **最大重复风险**不在沙箱或审批，而在：**task/todo、subagents、hooks、skills、memory、compaction、UI、scheduling**——这 8 处当前 PRD 只是“提了能力”，没有写“只准用哪套”。
- Claude Code 是**专有许可**：只能参考行为、schema、UX，不能复制代码；Codex 是 Apache-2.0、DSH/Hermes 是 MIT，可复用但要保留 notice。

---

## 2. 评审维度

| 维度 | 权重 | 说明 |
|---|---|---|
| 安全边界 | 25 | 沙箱/审批/隔离是否经过生产验证 |
| 状态与恢复 | 20 | 事件日志、checkpoint、resume、失败分类 |
| 缓存/成本 | 15 | 前缀稳定、压缩、token 成本 |
| 长程能力 | 15 | 计划、任务、工作流、子代理 |
| 可维护/测试 | 10 | 代码规模、测试、模块边界 |
| 许可/可复用 | 10 | Apache/MIT vs 专有；能否直接复用 |
| 集成成本 | 5 | 语言、运行时、协议差异 |

> 不做“精确加权打分”。权重用于讨论，最终决策记录理由；避免用假分数掩盖判断。

---

## 3. 决策矩阵

### 3.1 执行与内核

| # | 能力 | 候选 | Winner | 为什么 | 不选谁 | 适配层 |
|---|---|---|---|---|---|---|
| 1 | 沙箱 + 文件/网络边界 | Codex / DSH / Claude Bash sandbox / Hermes terminal backends | **Codex**（Apache-2.0） | 平台覆盖最全（Seatbelt/bwrap/Windows RT/Elevated/MXC）、有权限 profile、denied-read、fail-closed | DSH 更简单但平台覆盖少；Claude 只覆盖 Bash；Hermes 是工具后端 | 统一 PermissionProfile；吸收 DSH workspace roots 语义 |
| 2 | 审批阶梯 | Codex / Claude / DSH / Hermes | **Codex** | 六层决策 + 会话缓存 + Guardian + 升级保留 deny-read | Claude 是模式分档，DSH 是 ask/never，Hermes 是工具审批 | 用 Claude 的 UX 文案/分档做展示层 |
| 3 | 自动评审（Guardian） | Codex | **Codex** | 只读、无网、90s、熔断、risk × authorization | 其余三家没有等价物 | 统一到所有高风险工具域 |
| 4 | CUA | Codex 治理 / DSH native / Hermes browser | **Codex 治理 + DSH driver（可插拔）** | Codex 有 app allowlist/Guardian/锁屏；DSH 有原生桌面 provider | 不让 Hermes 浏览器工具冒充 CUA；不让 Codex MCP 驱动绑死 | 驱动接口 + 治理层分离；MCP/native/remote VM 三选一 |
| 5 | 工具运行时 / exec | Codex exec/apply_patch / DSH tool registry / Claude Bash/File / Hermes terminal | **Codex exec/apply_patch + DSH registry** | Codex 执行语义强；DSH 注册/权限/插件缝完整 | Claude 工具是产品层；Hermes 工具面太宽 | 工具 schema 由 DSH 注册表统一；执行走 Codex 语义 |
| 6 | 会话日志 / 内核 | DSH / Codex rollout / Claude transcript / Hermes SessionDB | **DSH**（MIT） | append-only + deriveMessages + 冻结请求 + 插件内核，一体 | Codex 是 Rust rollout；Claude jsonl；Hermes SQLite | 加 Hermes FTS5 作为检索 sidecar，不替代主日志 |
| 7 | 插件/组合 | DSH Cordis / Codex crates / Claude plugins / Hermes plugins | **DSH** | 连 agent-loop/模型适配器/工具注册表都是插件 | Codex crate 是编译期；Claude/Hermes 是应用插件 | 统一 capability seam；外部插件走 DSH loader |
| 8 | 请求/缓存布局 | DSH / Codex prompt_cache_key / Claude context editing / Hermes prompt cache 纪律 | **DSH** | byte-identical 前缀、追加快照、压缩复用 warm prefix | Codex 是 provider key 细节；Claude 是产品策略；Hermes 是纪律 | provider 适配器声明 cache_control / key 能力 |
| 9 | 压缩 | DSH shadowing / Codex compact / Claude compaction / Hermes compression | **DSH + Codex 结构保留** | DSH 的 shadowing 最缓存友好；Codex 保留 prefix/context 结构 | Claude 是产品契约；Hermes 是文本压缩 | 一个算法，两个来源：shadow + structural retention |
| 10 | 模型/provider 适配 | DSH / Codex models-manager / Claude SDK / Hermes provider plugins | **DSH** | 插件化 adapter + route 能力声明 | Codex/Claude/Hermes 都绑自家产品 | 统一 route 能力：cache/tool-update/context |

### 3.2 规划与长程

| # | 能力 | 候选 | Winner | 为什么 | 不选谁 | 适配层 |
|---|---|---|---|---|---|---|
| 11 | Goal/Plan | Claude / DSH goal-plan / Codex plan tool / Hermes todo | **Claude 语义 + DSH 持久化** | Claude 有可验证 Goal、Plan 文件、ExitPlanMode；DSH 有事件日志持久化 | Codex plan 太轻；Hermes todo 是清单 | Plan 文件 + DSH session event 双写 |
| 12 | Task DAG / Todo | Claude Task DAG / DSH task board / Codex multi-agent / Hermes todo | **Claude Task DAG + DSH task board** | Claude 有 blocks/blockedBy/owner；DSH 有 CAS/环检测/依赖 | Hermes todo 是个人清单；Codex 是子代理工具 | 一张任务表；Todo 只做 UI 投影 |
| 13 | 子代理 | Claude Agent / DSH subagent-fork / Codex multi-agent / Hermes delegate | **Claude UX + DSH fork 缓存** | Claude 后台/命名/worktree/remote；DSH fork 复用父前缀 | Codex 是工具级；Hermes 是 delegation 队列 | 一个控制面；Codex multi-agent 仅作适配器 |
| 14 | Workflow / 调度 | Claude Workflow/Cron / DSH schedule / Hermes cron | **Claude 语义 + DSH host 调度** | Claude 有节点缓存/续跑；DSH 有宿主调度与持久化 | Hermes cron 偏消息网关 | 一个 scheduler；cron/wakeup/monitor 三入口 |
| 15 | Checkpoint / Rewind / Resume | Claude / DSH log / Codex compaction checkpoint / Hermes state rewind | **Claude 语义 + DSH log** | Claude 有 turn 级回滚与共用消息 ID；DSH 有可重建日志 | Codex 只覆盖压缩 checkpoint；Hermes 偏会话状态 | 统一 message ID/seq；回滚=改投影起点 |
| 16 | 验证闭环 | Claude hooks/verifier / Hermes eval / Codex test_sync | **Claude** | Stop hook、独立 reviewer、脚本退出码；最完整 | Hermes 是离线评测；Codex 是测试同步工具 | 验收条件写入 Task；verifier 子代理复用 Claude 模式 |
| 17 | Hooks / 事件总线 | Claude hooks / Codex hooks / DSH typed events / Hermes plugins | **DSH 事件总线 + Claude 生命周期分类** | DSH typed events + effect 是内核级；Claude 事件名最贴近产品语义 | Codex hooks 偏权限；Hermes plugins 偏工具 | 一套 event taxonomy；不要四套 listener |
| 18 | Skills | Claude SKILL.md / Hermes skills+curator / DSH skill package / Codex skills | **Claude 格式 + Hermes 生命周期/演化** | Claude 渐进披露成熟；Hermes 有 usage/curator/GEPA | DSH skill 包偏加载；Codex skills 偏工具 | 一个 registry；演化走 Hermes 管线 + held-out eval |

### 3.3 记忆与成长

| # | 能力 | 候选 | Winner | 为什么 | 不选谁 | 适配层 |
|---|---|---|---|---|---|---|
| 19 | 记忆 hot path | Hermes / Codex memories / Claude auto memory / DSH 无 | **Hermes** | 2200/1375 预算、强制自合并、失败 3 次 TERMINAL、缓存纪律 | Codex 异步抽取偏冷；Claude auto memory 不可控；DSH 无 | 注入走 Z2/Z3，不进 system；FTS sidecar |
| 20 | 记忆 cold path | Memory Hub（Zep/Graphiti 类）/ Hermes text / Codex git baseline | **外部 Memory Hub** | bi-temporal、治理、多租户、可审计；Hermes 文本不够 | 不把 Hermes 文件记忆硬扩成图 | 统一 MemoryHub 接口；hot/cold 分层 |
| 21 | 记忆治理 | Zep/Cognee / Hermes profile / Codex requirements / Claude managed settings | **外部 Hub + DSH profile/tenant** | dataset × tenant 隔离、RBAC/ABAC、审计、删除传播 | Hermes 只有 profile 隔离 | 统一 scope：tenant/user/project/session |

### 3.4 界面与运维

| # | 能力 | 候选 | Winner | 为什么 | 不选谁 | 适配层 |
|---|---|---|---|---|---|---|
| 22 | UI / TUI | DSH Web/Desktop / Claude TUI / Codex TUI / Hermes TUI+desktop | **DSH runtime + Weft TUI** | DSH 的 Web/Desktop 与插件/Host 一体；Weft 统一品牌 | 不做四套壳；Claude/Codex/Hermes 的 TUI 只借布局 | 一套 design token；ANSI/HTML 双渲染 |
| 23 | 可观测 | DSH OTel / Codex Guardian metrics / Claude telemetry / Hermes insights | **DSH OTel + Codex Guardian 指标** | DSH 有统一 telemetry 通道；Codex 有 Guardian/审批指标 | Hermes insights 偏报告；Claude 偏产品 | 一套 span/metric 命名；不要四套 |
| 24 | 凭证/认证 | DSH credentials / Codex keyring-store / Claude OAuth / Hermes secret scope | **DSH credentials + OS keyring** | 插件化 + 本地 keyring 兼顾 | 不并行四套登录 | 统一 secret scope；provider 适配 |
| 25 | 插件市场 | DSH plugin market / Codex marketplace / Claude marketplace / Hermes catalog | **DSH**（M4） | 与 DSH loader/profile 同源 | 厂商市场不搬 | 只做通用市场；厂商市场 out of scope |

---

## 4. 当前 PRD 的重复风险审计

| 能力 | 当前 PRD 状态 | 风险 | 处置 |
|---|---|---|---|
| 沙箱 | 已明确 Codex 为主 | 低 | 保持 |
| 审批 | 已明确 Codex 阶梯 | 低 | 保持 |
| Guardian | 只有 Codex | 低 | 保持 |
| CUA | 治理/驱动已分离 | 中 | 写死 driver 接口，禁止第二套治理 |
| 工具运行时 | Codex + DSH 都提了 | 中 | 执行用 Codex 语义，注册用 DSH；不要两套 registry |
| 会话日志 | DSH 为主 | 低 | 保持 |
| 插件 | DSH 为主 | 低 | 保持 |
| 请求/缓存 | DSH 为主 | 低 | 保持 |
| 压缩 | Codex + DSH 都提了 | **高** | 合成一个算法：shadow + structural retention |
| 模型适配 | DSH 为主 | 低 | 保持 |
| Goal/Plan | Claude + DSH 都提了 | 中 | Claude 语义，DSH 持久化；不要两套 plan |
| Task/Todo | Claude + DSH + Codex 都提了 | **高** | 一张任务表；Todo 只做 UI 投影 |
| 子代理 | Claude + DSH + Codex 都提了 | **高** | 一个控制面；其他做 adapter |
| Workflow/调度 | Claude + DSH + Hermes 都提了 | **高** | 一个 scheduler；其他只提供入口 |
| Checkpoint | Claude + DSH + Codex 都提了 | 中 | 统一 message ID/seq |
| 验证 | Claude + Hermes + Codex 都提了 | 中 | 一个 verifier 接口；三种判定器 |
| Hooks | Codex + Claude + DSH 都提了 | **高** | 一套 event bus；权限 hook 是其中一个 domain |
| Skills | Claude + Hermes + DSH + Codex 都提了 | **高** | 一个格式/registry；演化走 Hermes |
| Memory | Hermes + Codex + Claude + Hub 都提了 | **高** | hot/cold 两层；Codex/Claude 记忆只做 adapter |
| UI | DSH + Claude + Codex + Hermes 都提了 | **高** | 一个 shell；TUI 只借布局 |
| 凭证 | 四家都有 | 中 | 一个 secret scope |

**结论**：当前 PRD 在“能力类”上已经选了主实现，但在 **8 个高风险点**（Task、Subagent、Scheduling、Hooks、Skills、Memory、Compaction、UI）还没有写死“只准用哪套”。这就是“可能做四遍”的真实入口。

---

## 5. 对 roadmap 的影响

| 里程碑 | 只做一次的实现 | 适配层（不是第二套） |
|---|---|---|
| M0 | Codex 沙箱/审批、DSH 日志/请求/插件、DSH 工具注册 | PermissionProfile、workspace roots |
| M1 | Codex Guardian、Codex 治理 + DSH driver | CUA driver 接口、Claude UX 文案 |
| M2 | Claude Goal/Plan/Task、Claude Workflow、Claude Checkpoint、DSH 压缩 | 任务表映射、scheduler 入口、verifier 接口 |
| M3 | Hermes hot memory、外部 Hub cold、Claude/Hermes skills、Hermes 演化 | MemoryHub 接口、skill registry |
| M4 | DSH plugin market、DSH profile/tenant | 厂商市场 out of scope |

**不做四遍的收益**：少三套实现、三套测试、三套运维、三套安全评审；代价是**薄适配层**要一次做对。

---

## 6. 未来决策规则

1. **先查表**：新需求先映射到 25 个能力类；已有 winner 就扩展，不新增第二实现。
2. **第二实现必须有 ADR**：说明为什么不扩展 winner、何时删除、如何隔离；默认 disabled。
3. **优先许可**：Apache/MIT 可直接复用；专有只参考行为/schema。
4. **优先测试与失败模式**：有生产测试/失败恢复的优先，不选“功能看起来多”的。
5. **适配层薄**：只做协议/类型/文案转换，不承载业务规则；业务规则留在 winner。
6. **参考实现只读**：repos/ 下的四家代码只读；不 vendor 进产品，除非许可证与维护计划明确。
7. **每个 PRD feature 带 source 标记**：SRC=Codex|Claude|DSH|Hermes|Hub|NEW，CI 可检查同一能力是否出现两个 SRC。

---

## 7. 一句话

**“择优录取”不是一句原则，而是一张 25 行的决策表 + 8 个高风险重复点的处置 + 一层薄适配。** 当前 PRD 已经选对了大部分 winner；下一步是把这张表写进 PRD 的 feature 字段，让“第二套实现”在评审阶段就进不来。
