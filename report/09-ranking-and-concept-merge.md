# 09 · 八处高风险能力的优劣排名、择优方案与概念合并

> 问题一：为什么这 8 处只是“提了能力”，就可能做四遍？
> 问题二：能不能现在就排出优劣，按“合法复用 + 可维护”选一套？
> 问题三：能不能先做 v1.0 缝合怪，再一步步走出自己的形状？
>
> 简短回答：**能。** 8 处之所以会做四遍，不是因为团队想重复，而是因为 PRD 只写了“支持某能力”，没有写“谁是唯一 owner、唯一 schema、唯一生命周期”。排名之后，v1.0 用“一个概念 + 一个 canonical 实现 + 薄适配层”缝合；v1.5 收掉适配层；v2.0 用自己的协议/数据模型/评测走出来。

---

## 1. 为什么“提了能力”会变成“做四遍”

“支持 Task DAG”是一句**意图**，不是一条**约束**。它至少留下 4 个自由变量：

| 自由变量 | 没人定时会发生什么 | 结果 |
|---|---|---|
| **数据模型** | 每套实现按自己的字段建表：Claude 的 blocks/blockedBy、DSH 的 revision/CAS、Codex 的 agent id、Hermes 的 todo | 4 张任务表 |
| **生命周期** | 创建/领取/完成/取消/归档各有一套状态机 | 4 套状态机 |
| **权限与作用域** | 谁能改、跨会话可见性、父子代理继承各写各的 | 4 套权限 |
| **投影/UI** | TUI、Web、SDK 各自解释“任务” | 4 种视图 |
| **测试/迁移** | 每套只测自己的路径，迁移脚本各写各的 | 4 倍维护 |

这 8 处尤其危险，因为它们都是**横切能力**：任务、子代理、调度、Hooks、Skills、记忆、压缩、UI 会穿过每一个工具、每一个 Agent、每一个界面。横切能力一旦没有唯一 owner，就会在每个集成点“就地长一个”。

**修复不是“少写代码”，而是“先定概念”**：

1. 每个能力一个 **concept owner**（模块/团队）。
2. 一个 **canonical schema**（其它实现只能适配，不能另建）。
3. 一个 **lifecycle**（状态机唯一）。
4. 一组 **contract tests**（适配层必须过同一套）。
5. PRD feature 带 **SRC 标记**（同一能力出现两个 SRC 就评审拒绝）。

---

## 2. 排名方法

评分维度：

| 维度 | 权重 | 说明 |
|---|---|---|
| 功能完整度 | 20% | 能力是否覆盖真实场景 |
| 安全/鲁棒 | 20% | 失败、越权、恢复 |
| 缓存/成本 | 15% | 前缀稳定、token、延迟 |
| 可维护 | 15% | 代码规模、测试、边界 |
| 合法复用 | 10% | Apache/MIT vs 专有；能否直接复用 |
| 集成成本 | 10% | 语言/协议/运行时差异（越高越易） |
| 长期演化 | 10% | 能否长成自己的形状 |

> 分数是工程判断，不是 benchmark；排名用于决策，不用于宣传。

---

## 3. 八处高风险能力的排名

### 3.1 Task / Todo

| Rank | 候选 | 优势 | 劣势 | 合法复用/维护 |
|---|---|---|---|---|
| 1 | **Claude Task DAG** | blocks/blockedBy/owner、验收条件、与 Goal/Plan 一体 | 专有许可；工具 schema 不是内部实现 | 只能重写语义，不能复制代码 |
| 2 | **DSH task board** | CAS revision、环检测、依赖、事件日志持久化 | 偏团队任务，不是个人 todo | MIT，可复用/改写 |
| 3 | **Codex multi-agent** | 与子代理工具结合紧 | 是工具级，不是任务控制面 | Apache-2.0，可参考 |
| 4 | **Hermes todo** | 简单、够用 | 无 DAG、无依赖、无证据 | MIT，可参考 |

**选择**：Claude 语义 + DSH 持久化。Todo 只做 UI 投影，不做第二套任务模型。

### 3.2 Subagents

| Rank | 候选 | 优势 | 劣势 | 合法复用/维护 |
|---|---|---|---|---|
| 1 | **Claude Agent** | 后台默认、命名可寻址、worktree/remote、只回摘要 | 专有；实现不可见 | 重写交互，不复制代码 |
| 2 | **DSH subagent-fork** | fork 复用父 KV 前缀、共享文件系统、递归预算 | 交互/UX 弱于 Claude | MIT，可复用 |
| 3 | **Codex multi-agent** | 与工具/审批/Guardian 结合紧 | 工具级，不是控制面 | Apache-2.0，可参考 |
| 4 | **Hermes delegate** | 队列/并发/批处理成熟 | 偏消息网关，不是通用子代理 | MIT，可参考 |

**选择**：Claude 交互 + DSH fork 缓存。一个控制面，Codex multi-agent 只做 adapter。

### 3.3 Scheduling

| Rank | 候选 | 优势 | 劣势 | 合法复用/维护 |
|---|---|---|---|---|
| 1 | **Claude Cron/Wakeup/Monitor** | 语义完整、noop 折叠、durable/in-memory | 专有；云端调度不可见 | 重写语义 |
| 2 | **DSH schedule** | 宿主调度、持久化、事件日志 | 语义比 Claude 少 | MIT，可复用 |
| 3 | **Hermes cron** | 与网关/消息集成好 | 偏消息渠道 | MIT，可参考 |
| 4 | **Codex** | 基本没有独立调度面 | 不适合长程 | — |

**选择**：Claude 语义 + DSH host 调度。一个 scheduler，三个入口（cron/wakeup/monitor）。

### 3.4 Hooks / 事件总线

| Rank | 候选 | 优势 | 劣势 | 合法复用/维护 |
|---|---|---|---|---|
| 1 | **DSH typed events** | 内核级、effect 可撤销、插件树 | 产品语义不如 Claude 细 | MIT，可复用 |
| 2 | **Claude hooks** | 生命周期事件最贴近产品（33 个） | 专有；并发派发不可依赖顺序 | 重写 taxonomy |
| 3 | **Codex hooks** | 权限 hook 与审批结合紧 | 偏权限，不是通用事件总线 | Apache-2.0，可参考 |
| 4 | **Hermes plugins** | 插件生态成熟 | 偏工具/网关 | MIT，可参考 |

**选择**：DSH 事件总线 + Claude 生命周期分类。权限 hook 只是 event bus 的一个 domain。

### 3.5 Skills

| Rank | 候选 | 优势 | 劣势 | 合法复用/维护 |
|---|---|---|---|---|
| 1 | **Claude SKILL.md** | 渐进披露、description 路由、格式成熟 | 专有；无生命周期/演化 | 重写格式/加载器 |
| 2 | **Hermes skills** | usage telemetry、curator、GEPA 演化 | 格式与 Claude 不完全兼容；GEPA 有效性质疑 | MIT，可复用 |
| 3 | **DSH skill package** | 加载/注册/权限缝完整 | 生态与演化弱 | MIT，可复用 |
| 4 | **Codex skills** | 与工具/AGENTS.md 结合 | 偏内置能力 | Apache-2.0，可参考 |

**选择**：Claude 格式 + Hermes 生命周期/演化。一个 registry；演化走 held-out eval + canary。

### 3.6 Memory

| Rank | 候选 | 优势 | 劣势 | 合法复用/维护 |
|---|---|---|---|---|
| 1 | **Hermes hot memory** | 2200/1375 预算、强制自合并、失败 3 次 TERMINAL、缓存纪律 | 只有文本，不是图；治理弱 | MIT，可复用 |
| 2 | **外部 Memory Hub** | bi-temporal、治理、多租户、混合检索 | 引入外部依赖/成本 | 按厂商许可 |
| 3 | **Codex memories** | 异步抽取、git baseline、redaction | 文件式，扩展性弱 | Apache-2.0，可参考 |
| 4 | **Claude auto memory** | 产品化好 | 不可控、不可审计 | 专有，仅参考 |

**选择**：hot = Hermes；cold = 外部 Hub。Codex/Claude 记忆只做 adapter，不建第三套。

### 3.7 Compaction

| Rank | 候选 | 优势 | 劣势 | 合法复用/维护 |
|---|---|---|---|---|
| 1 | **DSH shadowing** | 缓存友好、保留原始事件、warm prefix | 需要事件日志配合 | MIT，可复用 |
| 2 | **Codex compact** | 保留 prefix/context 结构、元数据可回溯 | 实现偏 Rust/产品耦合 | Apache-2.0，可复用 |
| 3 | **Claude compaction** | 留存契约清晰、产品化 | 专有；内部提示词不可见 | 重写策略 |
| 4 | **Hermes compression** | 文本压缩成熟 | 无 prefix 结构保证 | MIT，可参考 |

**选择**：一个算法，DSH shadow + Codex structural retention。不做两套压缩。

### 3.8 UI / TUI

| Rank | 候选 | 优势 | 劣势 | 合法复用/维护 |
|---|---|---|---|---|
| 1 | **DSH Web/Desktop runtime** | 插件/Host/流式一体、可扩展 | UI 风格不是终态 | MIT，可复用 |
| 2 | **Claude TUI** | 信息层级最好（logo → box → tip → prompt → status） | 专有；不能复制视觉 | 借布局，不抄视觉 |
| 3 | **Codex TUI** | 审批/工具展示强 | 偏编码场景 | Apache-2.0，可参考 |
| 4 | **Hermes TUI/desktop** | 多平台/桌面成熟 | 面太宽，不是核心 | MIT，可参考 |

**选择**：DSH runtime + Weft TUI（Claude 式布局，Weft 品牌）。一套 shell，不做四套。

---

## 4. 按“合法复用 + 可维护”最终选一套

| 能力 | Winner | 复用方式 | 许可 | 维护策略 |
|---|---|---|---|---|
| 沙箱/审批/Guardian | Codex | 直接复用 crate/服务，包一层 PermissionProfile | Apache-2.0 | 跟随上游，保留 patch 清单 |
| 日志/插件/缓存/UI runtime | DSH | fork/依赖包，保留 MIT notice | MIT | 跟随上游，保留 patch 清单 |
| Goal/Plan/Task/Workflow/Checkpoint | Claude | **只重写语义，不复制代码** | 专有 | 自研，contract tests 对齐行为 |
| 子代理 | Claude UX + DSH fork | 交互自研，fork 复用 | 混合 | 一个控制面 |
| Hooks | DSH bus + Claude taxonomy | 复用 bus，重写事件名 | MIT | 一套 taxonomy |
| Skills | Claude 格式 + Hermes 生命周期 | 格式自研，curator/GEPA 复用 | 混合 | 一个 registry |
| Memory hot | Hermes | 复用/改写 | MIT | 自研 MemoryFabric 接口 |
| Memory cold | 外部 Hub | 采购/嵌入 | 按厂商 | 接口隔离，可替换 |
| Compaction | DSH + Codex | 复用 + 结构化保留 | MIT/Apache | 一个算法 |
| UI | DSH runtime + Weft | 复用 runtime，自研品牌 | MIT | 一套 shell |

**一句话**：**能直接复用的只有 Codex / DSH / Hermes；Claude 只能复用“设计”，不能复用“代码”。** 这决定了 v1.0 的缝合方式：Codex 和 DSH 是“硬件”，Claude 是“图纸”，Hermes 是“生长激素”。

---

## 5. 概念合并：8 个概念，替代 8 个功能名

v1.0 可以是缝合怪，但**概念必须先是自己的**。否则四套实现永远收不拢。

| 旧功能名（四家各有一套） | 合并后的概念 | 统一职责 | v1.0 用谁实现 |
|---|---|---|---|
| Task / Todo | **Work Graph** | 目标、计划、任务、检查点、证据，统一节点/边 | Claude 语义 + DSH 持久化 |
| Subagents | **Actor Runtime** | 一个 AgentHandle、角色、邮箱、作用域、父子关系 | Claude UX + DSH fork |
| Scheduling | **Scheduler** | cron/wakeup/monitor 都是 trigger，统一队列 | Claude 语义 + DSH host |
| Hooks | **Event Bus** | 所有生命周期/权限/工具事件，一套 typed event | DSH bus + Claude taxonomy |
| Skills | **Capability Package** | manifest + instructions + tools + eval，一套制品 | Claude 格式 + Hermes 生命周期 |
| Memory | **Memory Fabric** | 一条 record 模型，hot/cold 只是 store | Hermes hot + 外部 Hub cold |
| Compaction | **Context Projection** | 压缩/裁剪/重放都是“投影”，不是删除 | DSH shadow + Codex retention |
| UI | **Surface Renderer** | 一套事件 → TUI/Web/Desktop 渲染 | DSH runtime + Weft TUI |

**概念合并的关键**：不是把四个实现塞进一个接口，而是**先定义概念，再让实现成为可替换的 provider**。

~~~mermaid
flowchart TB
  subgraph C[Weft Concept Layer]
    WG[Work Graph]
    AR[Actor Runtime]
    SC[Scheduler]
    EB[Event Bus]
    CP[Capability Package]
    MF[Memory Fabric]
    CX[Context Projection]
    SR[Surface Renderer]
  end

  subgraph P[Providers]
    A[Codex: sandbox / approval / Guardian]
    D[DSH: log / plugin / cache]
    L[Claude: semantics / UX]
    H[Hermes: memory / skills]
    X[External Hub: cold memory]
  end

  A --> EB
  A --> SR
  D --> WG
  D --> EB
  D --> CX
  L --> WG
  L --> AR
  L --> SC
  L --> SR
  H --> CP
  H --> MF
  X --> MF
  WG --> AR
  WG --> SC
  AR --> EB
  CP --> AR
  MF --> CX
  CX --> SR
~~~


---

## 6. 三步走：v1.0 缝合 → v1.5 收口 → v2.0 自己的形状

### v1.0：缝合怪（8–12 周）

目标：**一个概念一个实现，能跑通一个真实长任务。**

- Work Graph：Claude 语义 + DSH 日志；Task/Todo 只有一张表。
- Actor Runtime：Claude 交互 + DSH fork；Codex multi-agent 只做 adapter。
- Scheduler：Claude 语义 + DSH host；只保留一个队列。
- Event Bus：DSH bus + Claude 事件名；权限 hook 是 domain。
- Capability Package：Claude 格式 + Hermes curator；一个 registry。
- Memory Fabric：Hermes hot + 外部 Hub cold；Codex/Claude 记忆只做 adapter。
- Context Projection：DSH shadow + Codex retention；一个压缩算法。
- Surface Renderer：DSH runtime + Weft TUI；一套 shell。

**v1.0 验收**：一个真实 Windows 任务，从计划到验证跑通；记录 cache hit rate、人工打断次数、误放行次数。

### v1.5：收口（6–8 周）

目标：**删掉适配层里的“第二套语义”。**

- 统一 Work Graph schema；删除 Claude/DSH 两套任务字段的映射。
- 统一 Actor 协议；Codex multi-agent adapter 退役。
- 统一 Event taxonomy；删除重复 hook 名。
- 统一 Capability manifest；合并 Claude/Hermes skill 字段。
- 统一 Memory record；删除 Codex/Claude 记忆适配。
- 统一 Context Projection；删除 Codex compact 分支。
- 统一 Surface event；删除重复 UI 状态。

**v1.5 验收**：8 个概念各只有一个 schema、一个 owner、一套 contract tests；适配层只剩“外部 provider”必需的部分。

### v2.0：自己的形状（12–16 周）

目标：**协议、数据模型、评测、UX 都是 Weft 的，不再以“像谁”定义。**

- 发布 **Weft Protocol**：Work Graph / Event / Memory / Capability manifest。
- 发布 **Weft Bench**：缓存命中、打断率、误放行、长程成功率、记忆质量。
- 替换最弱的 borrowed 组件：优先替换 Claude 语义的自研实现、Memory cold 的可替换 provider。
- 插件生态：Capability Package 可发布/安装/评估。
- 成长闭环：Memory + Skills 的 held-out/canary 成为默认。

**v2.0 验收**：任意一个 borrowed 组件可以在不改概念的情况下被替换；外部插件只依赖 Weft Protocol。

---

## 7. “走出自己的形状”到底指什么

不是“不用别人的代码”，而是**四个自有**：

1. **自有概念**：Work Graph / Actor / Scheduler / Event Bus / Capability / Memory Fabric / Projection / Surface。
2. **自有协议**：外部插件只依赖 Weft Protocol，不依赖 Codex/Claude/DSH 的内部类型。
3. **自评测**：Weft Bench 反映自己的目标，而不是刷别人的 LoCoMo。
4. **自成长**：记忆/技能演化有 held-out、canary、回滚，越跑越强。

当这四件事成立，v1.0 的“缝合怪”就变成了 v2.0 的“自己的形状”。

---

## 8. 反模式

- **把“择优”做成“选一个抄”**：抄代码不抄契约，最后四套语义还在。
- **适配层承载业务规则**：适配层只做协议/类型/文案转换；业务规则留在 winner。
- **v1.0 就追求纯粹**：v1.0 的任务是跑通，不是优雅；但概念必须先定。
- **v2.0 才想评测**：没有 v1.0 的指标，v2.0 无法证明“自己的形状”更好。
- **让 Claude 的专有代码进产品**：只能重写行为，不能复制实现。

---

## 9. 一页总结

| 问题 | 答案 |
|---|---|
| 为什么 8 处会做四遍？ | 只写了“支持能力”，没写唯一 owner/schema/lifecycle；横切能力在每个集成点就地生长 |
| 能现在排名吗？ | 能。8 处各有 1–4 名，Claude 赢语义、DSH 赢内核/缓存、Codex 赢安全、Hermes 赢记忆/演化 |
| 按合法复用+可维护选谁？ | Codex（Apache）做执行、DSH（MIT）做内核、Hermes（MIT）做记忆/技能、Claude 只复用设计 |
| 概念合并是什么？ | 8 个概念替代 8 个功能名：Work Graph / Actor Runtime / Scheduler / Event Bus / Capability Package / Memory Fabric / Context Projection / Surface Renderer |
| v1.0 可以缝合吗？ | 可以，但一个概念只能一个实现；适配层薄；8 个高风险点各一张表 |
| 什么时候走出自己的形状？ | v1.5 收掉适配层；v2.0 自有协议/评测/UX/成长闭环 |
