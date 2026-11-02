# 07 · PRD 与 Roadmap 的集合覆盖审计

> 问题：当前的 PRD 与 roadmap，是否按“四家功能的并集”来组织？
>
> 结论：**不是朴素并集。** 在**能力类**层面接近并集（24/24 类都有对应），但在**具体功能**层面是“**并集 − 明确排除 − 主动延后 + 融合新增**”。用集合写就是：
>
> **P = (U \ (O ∪ D)) ∪ N**
>
> 其中 U = Codex ∪ Claude ∪ DSH ∪ Hermes 的功能全集，O = 明确不做，D = 延后，N = 四家都没有、融合才出现的新能力。
>
> 另外：**当前没有独立的 PRD 文件**；[04-fusion-architecture.md](04-fusion-architecture.md) 的 §0–§11 是事实上的 PRD，§12 是 roadmap。PRD 与 roadmap 没有 feature ID、没有逐条验收、没有 out-of-scope 章节，这是本次审计发现的最大结构问题。
>
> 追加决策：同一能力不并行实现，按“择优录取”只保留一个 canonical winner；25 项选择与 8 个重复风险处置见 [08-capability-selection.md](08-capability-selection.md)。

---

## 1. 集合定义

| 符号 | 含义 | 当前载体 |
|---|---|---|
| **A** | Codex 功能集：沙箱、审批、Guardian、CUA 治理、工具/执行、缓存/压缩、memories | [01-codex.md](01-codex.md) |
| **B** | Claude 功能集：plan/goal/task、subagent、workflow、hooks/skills、compaction、checkpoint、permissions | [02-claude.md](02-claude.md) |
| **C** | DSH 功能集：Cordis 插件、会话日志、请求分区、压缩、沙箱、team、SDK/UI | [03-dsh.md](03-dsh.md) |
| **D** | Hermes 功能集：预算记忆、技能演化、curator、网关/多平台、memory hub 生态 | [05-appendix.md](05-appendix.md) |
| **U** | A ∪ B ∪ C ∪ D | 四份分报告的能力清单 |
| **P** | 事实 PRD 明确要求的能力 | 04 §0–§11 |
| **R** | roadmap 已排期/有里程碑的能力 | 04 §12 |
| **O** | 明确不做（out of scope） | 04 未显式写，本次审计补列 |
| **N** | 融合新增能力 | 04 的跨平面设计 |

**判定标准**：

- **能力类（capability class）**：如“沙箱后端”“审批阶梯”“记忆写入”。用于判断“有没有覆盖这一层”。
- **具体功能（feature）**：如“MXC 后端”“会话级审批缓存”“curator 7/14/30 天”。用于判断“是不是把四家每个功能都搬进来”。

---

## 2. 24 个能力类的覆盖矩阵

图例：● 完整覆盖；◐ 部分覆盖/只给接口未给机制；○ 缺失（本次未发现）。

| # | 能力类 | 主要来源 | PRD 位置 | Roadmap | 覆盖 |
|---|---|---|---|---|---|
| E1 | 沙箱后端（Seatbelt/bwrap+seccomp/Windows/MXC） | A | §4.5 | M0 | ● |
| E2 | 文件权限 profile（读写/deny/protected metadata） | A | §4.1、§4.5 | M0 | ● |
| E3 | 网络隔离/本地代理 | A | §4.1、§4.5 | M0/M1 | ◐ |
| E4 | 审批阶梯（策略/规则/缓存/Hook/Guardian/人工） | A | §4.1–§4.3 | M0 | ● |
| E5 | 审批记忆/规则固化 | A | §4.3 | M0/M1 | ● |
| E6 | Guardian 自动评审（风险/授权/超时/熔断） | A | §4.1–§4.3 | M1 | ● |
| E7 | CUA 治理（驱动解耦/应用授权/锁屏/动作日志） | A + C | §4.4 | M1 | ● |
| E8 | 工具运行时/MCP/exec | A + C | §8、§9 | M0 | ● |
| P1 | Goal/Plan（可验证完成条件、计划落盘） | B | §6.1、§6.2 | M2 | ● |
| P2 | Task DAG / Todo（依赖、owner、验收） | B + C | §6.2 | M2 | ● |
| P3 | 子代理（后台/命名/worktree/remote） | B + C | §6.4 | M2 | ● |
| P4 | Workflow / 调度（脚本、节点缓存、cron/wakeup） | B + C | §6.4、§6.6 | M2 | ● |
| P5 | Checkpoint / Rewind / Resume | B | §6.5 | M2 | ● |
| P6 | 验证闭环（独立验证、失败分类） | B | §6.3 | M2 | ● |
| P7 | Hooks / Skills / 上下文文件 | B + D | §7.3、§8 | M3 | ◐ |
| C1 | 事件日志/投影（append-only、deriveMessages） | C | §2.1 | M0 | ● |
| C2 | 请求/缓存布局（Z0-Z3、冻结请求） | C | §5 | M0 | ● |
| C3 | Compaction / Shadowing | C + A | §5.3 | M2 | ● |
| C4 | 插件内核/注册表（Cordis 式） | C | §8 | M0 | ● |
| C5 | Session / Team / SDK / UI 面 | C | §2、§8 | M0/M2 | ◐ |
| M1 | 记忆写入/巩固（预算、冲突、失效） | D | §7.1、§7.2 | M3 | ● |
| M2 | 记忆检索/注入（混合信号、token 预算） | D | §7.2、§7.4 | M3 | ● |
| M3 | 技能演化/评估门（GEPA、canary） | D | §7.3 | M3 | ● |
| M4 | 记忆治理/可观测（租户、审计、指标） | D | §7.2、§11 | M3/M4 | ◐ |

**统计**：24 类中 **20 类完整覆盖（●）**，**4 类部分覆盖（◐：E3、P7、C5、M4）**，**0 类完全缺失**。

这解释了“看起来像并集”的原因：**每个能力类至少有一个来源被吸收**。但“类覆盖”不等于“功能并集”——下面看具体功能。

---

## 3. 具体功能的三个集合

### 3.1 O：明确不做 / 产品外（14 项）

| # | 功能 | 来源 | 不做的理由 |
|---|---|---|---|
| O1 | Bazel/构建系统 | A | 构建基础设施，不是 Agent 产品能力 |
| O2 | Codex cloud tasks | A | 云端任务编排，当前聚焦本地/桌面 |
| O3 | 厂商特定插件市场实现 | A/B | 通用插件市场在 M4；厂商特定市场不搬 |
| O4 | Claude artifacts/design | B | 内容创作/设计面，非核心 Agent 运行时 |
| O5 | Claude Chrome setup / remote control | B | 浏览器接管是独立产品面 |
| O6 | Claude cloud sessions | B | 与 O2 同类 |
| O7 | Claude output styles/statusline | B | 展示层定制，非能力 |
| O8 | DSH LSP | C | 语言服务是工具生态，可后续插件化 |
| O9 | Hermes 多平台网关（Telegram/Discord/Slack） | D | 消息渠道，不是运行时内核 |
| O10 | Hermes kanban | D | 项目管理层，非 Agent 核心 |
| O11 | Hermes voice/TTS | D | 多模态外围 |
| O12 | Hermes RL/training | D | 训练面，非 harness |
| O13 | Hermes 桌面 UI（Electron） | D | 与 Weft 自己的 TUI/Web 面重复 |
| O14 | Hermes external importers | D | 训练/评测数据导入，非运行时 |

> 这些不是“遗漏”，而是**产品边界**。但当前 04 没有把它们写成 out-of-scope，导致读者会误以为“没提=并集里应该有”。

### 3.2 D：主动延后 / 只留接口（13 项）

| # | 功能 | 来源 | 当前状态 | 建议里程碑 |
|---|---|---|---|---|
| D1 | Code Mode / V8 exec | A | 未纳入 | M3+ |
| D2 | exec-server / 远程执行 | A | 只在 CUA 处提“remote VM” | M2/M3 |
| D3 | 完整 app-server 协议 | A | 只保留审批回调语义 | M2 |
| D4 | Claude auto-mode 分类器内部实现 | B | 用 Guardian 替代 | M1 影子模式 |
| D5 | CLAUDE.md/上下文文件加载细节 | B | 只提“项目记忆” | M2 |
| D6 | DSH browser-use provider | C | 未纳入 | M2 |
| D7 | DSH attachments/spill/deliverables | C | 未纳入 | M2 |
| D8 | DSH session query/export | C | 未纳入 | M2 |
| D9 | DSH terminal/PTY 深度 | C | 只保留工具运行时 | M1 |
| D10 | Hermes curator 7/14/30 生命周期 | D | 只保留“技能演化” | M3 |
| D11 | Hermes insights | D | 未纳入 | M3 |
| D12 | Hermes memory provider 生态 | D | 只保留 MemoryHub 接口 | M3 |
| D13 | Hermes profiles/multi-home | D | 未纳入 | M4 |

> 延后项的共同点：**要么是平台/生态层，要么会显著增加 M0-M2 的集成面**。这在 roadmap 上是合理的，但需要明写“暂不支持”，否则会被当成“并集已覆盖”。

### 3.3 N：融合新增（8 项，四家都没有现成等价物）

| # | 新能力 | 为什么是新的 | 当前落点 |
|---|---|---|---|
| N1 | 统一 Guardian（CUA+shell+file+MCP+network 一套评审） | Codex 有分域 scope，但没有跨域统一策略/审计 | §4.1–§4.4 |
| N2 | 缓存感知的记忆注入（hot/cold 分层） | Hermes 有预算记忆，DSH 有缓存纪律，但没人把两者合成一条注入规则 | §7.5 |
| N3 | 集合化权限（request ∩ granted + 版本化授权） | Codex 有交集逻辑，但没有把它上升为统一 grant 模型 | §4.1、§4.3 |
| N4 | 跨 harness 任务板（Claude DAG + DSH team + Codex multi-agent） | 三家各有一套任务/子代理，没有统一控制面 | §6.2、§6.4 |
| N5 | 技能演化的 held-out/canary 评估门 | Hermes 有 GEPA，但适应度是关键词重叠；没有 canary 门 | §7.3 |
| N6 | Weft TUI / 品牌 | 四家都没有这个产品名/视觉 | brand/README.md |
| N7 | 全平面统一会话日志（执行/规划/记忆共用） | DSH 有日志，但没覆盖四家全部平面 | §2.1 |
| N8 | 统一审批中心 UX（Claude 式布局 + Codex 决策） | 两家各有 UI，没有合一的“决策解释 + 规则固化”界面 | §4.3、brand/README.md |

**这 8 项是“并集”之外的部分**，也是融合架构真正的增量。它们不能从任何单一仓库直接抄，必须自己设计/验证。

---

## 4. Roadmap 的集合覆盖

| 里程碑 | 覆盖的能力类 | 明确不覆盖 | 问题 |
|---|---|---|---|
| **M0** 内核与权限底座 | E1/E2/E4/E5/E8、C1/C2/C4、C5 的一部分 | E6 Guardian、E7 CUA、P* 全部 | 没写 exit criteria；没有“最小任务”验收 |
| **M1** Guardian 与 CUA | E3、E6、E7、E5 | P* 全部、记忆 | Guardian 与 CUA 同里程碑，风险集中 |
| **M2** 长程与恢复 | P1–P6、C3、C5 的 team 部分 | 记忆、技能 | 没有“计划-执行-验证”端到端验收 |
| **M3** 记忆与成长 | P7、M1–M4 | 多租户 | 治理与功能同里程碑，容易后置 |
| **M4** 多租户与生态 | C5、M4、插件市场 | 具体功能未列 | 是一个“桶”，不是可执行计划 |

**结论**：R 是 P 的**依赖序子集**，不是 P 的全集。M0–M4 在“能力类”上覆盖 24/24，但在“具体功能”上只覆盖了 P 的一部分；M4 尤其模糊。

---

## 5. 集合判断：并集、交集，还是粘合？

| 判断 | 是否成立 | 说明 |
|---|---|---|
| **P = U（纯并集）** | ❌ | 有 14 项明确不做、13 项延后；还有 8 项新增。 |
| **P ⊆ U（只做四家已有的）** | ❌ | N1–N8 是融合新增，不在任何单一仓库里。 |
| **P ⊇ U（四家功能全收）** | ❌ | O/D 项没有进 PRD。 |
| **P 覆盖 U 的每个能力类** | ✅ | 24/24 类有对应；20 完整、4 部分。 |
| **P 是“粘合/余极限”而非并集** | ✅ | 每个能力类选一个 canonical 实现，重叠处去重，接口处对齐。 |

更准确的说法：

> **Weft 的 PRD 不是“四家功能并集”，而是“以四家为能力来源的粘合（gluing）”：每个能力类保留一个规范实现，重叠功能去重，产品外功能排除，集成缺口用新能力补齐。**

用范畴论的话说，它更像 **colimit（余极限）**：不是把四份实现堆在一起，而是找到共同接口，把对应部分粘起来。用工程话说：**canonicalize + dedup + glue + extend**。

### 重叠功能的去重表（示例）

| 重叠能力 | A 做法 | B 做法 | C 做法 | D 做法 | PRD 选择 |
|---|---|---|---|---|---|
| 沙箱 | Seatbelt/bwrap/Windows/MXC | Bash sandbox | bwrap/Landlock/Seatbelt | 终端后端 | **A 为主，C 的 workspace roots 语义** |
| 审批 | 六层阶梯 | 6 模式+分类器 | ask/never + preset | 工具审批 | **A 的阶梯 + B 的 UX 分档** |
| 计划 | 无强规划对象 | Plan/Goal/Task | goal/plan/todo | 无 | **B 为主，C 的 goal/plan 包** |
| 子代理 | multi-agent tools | Agent 工具 | subagent spawn/fork | delegate | **B 的交互 + C 的 fork 缓存** |
| 记忆 | async memories | auto memory | 无独立记忆 | 预算记忆 | **D 的 hot path + Memory Hub cold path** |
| 压缩 | compact + prefix | compaction | shadowing + warm prefix | compression | **C 的 shadowing + A 的结构保留** |
| 调度 | 无 | Cron/Wakeup/Monitor | schedule 包 | cron | **B 的语义 + C 的宿主调度** |

这张表说明：**PRD 不是把四套都放进去，而是每个重叠点选一个“主实现”，其他家提供接口/语义补充。**

---

## 6. 当前 PRD/Roadmap 的 8 个结构缺口

1. **没有独立 PRD**：04 同时承担架构、需求、路线图，读者无法区分“必须做/可以做/不做”。
2. **没有 feature ID**：无法做“需求 → 设计 → 里程碑 → 测试”的追踪矩阵。
3. **没有 out-of-scope 章节**：O1–O14 没写，导致“并集”误判。
4. **没有验收标准**：M0–M4 只有动词（“做 Guardian”），没有“怎样算做完”。
5. **没有依赖图**：M1 的 Guardian 依赖 M0 的审批缓存；M3 的记忆依赖 M2 的压缩；文中未画。
6. **没有 NFR**：延迟、成本、SLO、数据保留、租户隔离、合规（SOC2/HIPAA）没有目标值。
7. **M4 是桶**：多租户/生态/市场混在一起，无法排期。
8. **风险与回滚没有落到里程碑**：§13 有风险表，但 M0–M4 没有对应的“失败即回滚”条件。

---

## 7. 建议：把 PRD 与 Roadmap 拆成可计算的集合

### 7.1 PRD 最小结构

| 章节 | 内容 |
|---|---|
| 0. 产品边界 | 一句话定位、目标用户、非目标、out-of-scope（O 表） |
| 1. 能力地图 | 24 个 capability class，每类标注来源 A/B/C/D、canonical 实现、覆盖状态 |
| 2. 功能清单 | F-001…，每条含：描述、来源、优先级 P0/P1/P2、验收、依赖、集合状态（in/deferred/out/new） |
| 3. 非功能需求 | 延迟/成本/缓存命中/可用性/安全/合规/保留 |
| 4. 交互与品牌 | Weft TUI、审批中心、错误/拒绝文案 |
| 5. 风险与回滚 | 每类风险的触发条件与回滚动作 |

### 7.2 Roadmap 最小结构

| 里程碑 | 必须写 |
|---|---|
| M0 | feature IDs、exit criteria（一个真实 Windows 任务跑通 + 三个指标）、回滚条件 |
| M1 | Guardian 影子模式通过率、CUA 敏感应用拦截率、审批打断次数 |
| M2 | 长程任务端到端成功率、checkpoint 恢复成功率、re-plan 率 |
| M3 | 记忆 recall/precision、技能 canary 提升、回归失败率 |
| M4 | 租户隔离测试、审计覆盖率、配额/成本 |

### 7.3 建议的 feature ID 方案

~~~text
F-EXEC-001  sandbox backend: windows-restricted-token
F-EXEC-002  sandbox backend: windows-mxc
F-PERM-001  approval ladder
F-PERM-002  approval cache
F-PERM-003  guardian review
F-PLAN-001  goal contract
F-PLAN-002  task DAG
F-CTX-001   request zones
F-CTX-002   compaction shadowing
F-MEM-001   hot-path text memory
F-MEM-002   cold-path temporal graph
F-GROW-001  skill evolution eval gate
~~~

每条 feature 带四个集合标记：**IN / DEFERRED / OUT / NEW**。这样任何一次 roadmap 调整都可以用集合运算检查覆盖率。

---

## 8. 一句话回答

**当前 PRD/roadmap 采取的不是“四家功能的并集”，而是“能力类层面的近似并集 + 具体功能层面的选择性粘合”**：

- **24/24 能力类有覆盖**（20 完整、4 部分），所以看起来像并集；
- 但 **14 项明确不做、13 项延后、8 项融合新增**，所以不是 U；
- Roadmap 是 P 的**依赖序子集**，不是 P 的全集；
- 最大的改进不是“再补几个功能”，而是**把 PRD 拆出来、给 feature ID、写 out-of-scope 和 exit criteria**，让“并集/交集/新增”变成可计算的表，而不是读者脑补。
