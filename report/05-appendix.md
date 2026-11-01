# 附录：Hermes Agent 的自我成长闭环 与 2025–2026 工业级 memory hub

> 2026-11 追加：Memory 架构的更新调研（Hub+Redis+PG+Vector 是否过时、Red Hat MemoryHub、ContextDB、Hy-Memory、托管 memory）见 [10-memory-architecture-2026.md](10-memory-architecture-2026.md)。

> 声明：本附录只代表 **2026-10-31** 时点的公开资料与仓库状态；厂商自报分数均未独立复现。
> 证据分级：【源码】= 本机浅克隆的行号证据（附 commit）；【论文/官方文档】= 一手 URL（附抓取日期）；【逆向/推断】= 由源码行为反推、无一手文档确认，文中显式标注。
> 时间口径：本报告所有「当前」事实以 **2026-10-31** 为准。repos/hermes @ **f4af5c3**（2026-10-31T19:34-07:00，origin NousResearch/hermes-agent）；repos/hermes-evolution @ **0a929e3**（2026-06-17，origin NousResearch/hermes-agent-self-evolution）。
> 范围：hermes 仓库体量极大（agent/ 下 400+ 模块、tools/ 下 289 个工具文件），本报告只取与「经验→技能→记忆→评估」闭环直接相关的载重路径，未覆盖 gateway/desktop 全量。

---

## 0. 三页速览

| 问题 | 结论 | 最强证据 |
|---|---|---|
| Hermes 靠什么成长？ | **三层可 diff 的文本资产**：记忆（MEMORY.md/USER.md + 外部 provider）、技能（SKILL.md 库 + curator 生命周期）、提示词（SOUL/persona + 技能文本）。不是权重 | 【源码】repos/hermes/agent/learning_graph.py:1-7（把「学到的技能」与 MEMORY.md 卡片画进同一张图） |
| 技能怎么自动变好？ | 离线 **DSPy + GEPA** 反思式进化 → 约束门 → **只出 PR，不自动合并** | 【源码】repos/hermes-evolution/evolution/skills/evolve_skill.py:155-204；README.md:71-77 |
| 记忆怎么巩固？ | 不靠向量库去重，靠**字符预算耗尽后强制模型自合并**（2200 / 1375 chars），每回合失败 3 次即 TERMINAL；压缩边界再抽一次（on_pre_compress） | 【源码】repos/hermes/tools/memory_tool_store.py:188, 329-337, 182-221；agent/conversation_compression.py:2890-2922 |
| 与工业 memory hub 的最大分歧 | 工业界 2025→2026 正从「LLM 改写式巩固」退到 **ADD-only 单次抽取 + 多信号混合检索**（Mem0 新算法 LoCoMo 71.4→91.6）；Hermes 仍坚持预算内自合并，且把记忆塞进**系统提示** | 【官方文档】docs.mem0.ai/open-source/graph-memory.md（2026）；【源码】tools/memory_tool_store.py:669-675 |
| 最被高估的东西 | LoCoMo 分数。Letta 用「文件系统 + grep」在 gpt-4o-mini 上拿 74.0%，高于 Mem0 自报的图记忆 68.5% | 【官方博客】letta.com/blog/benchmarking-ai-agent-memory（2025-08-12） |
| 最被低估的东西 | prompt 缓存。注入位置错了等于每轮回放全部记忆；Hermes 把「系统提示字节稳定 + 记忆走 user 行 sidecar」当第一不变量 | 【源码】repos/hermes/AGENTS.md:20-23；agent/memory_context.py:123-143 |

---

## A. Hermes 的自我成长闭环

### A.0 一句话架构

**一次会话 = 一条可回收的证据链**：消息进 SQLite（FTS5 可检索）→ 轨迹进 JSONL → 技能使用打点进 .usage.json → 空闲时 curator 做生命周期迁移/合并 → 技能文本可被 GEPA 离线进化 → 变更以 PR 落地。记忆是唯一「跨会话注入提示词」的通道，因此被单独上了预算、脱敏、熔断三道闸。

### A.1 经验与轨迹捕获（4 条独立管道，互不替代）

| 管道 | 载体 | 粒度 | 用途 | 证据（源码，commit f4af5c3） |
|---|---|---|---|---|
| 会话库 | SQLite + FTS5（含 CJK 分词器 cjk_unicode61） | 每条消息 | 历史召回（session_search）、洞察统计 | repos/hermes/hermes_state_fts.py:47-53, 161-163 |
| 轨迹 | trajectory_samples.jsonl / failed_trajectories.jsonl（ShareGPT 格式） | 每次完成/失败的 run | 训练/评测样本、失败集 | repos/hermes/agent/trajectory.py:37-56（append + flock/msvcrt 锁 :24-34） |
| 技能遥测 | 技能库下 .usage.json | 每技能 | 生命周期决策（stale/archive）、学习图谱 | repos/hermes/tools/skill_usage.py:348-560（bump_view/bump_use/bump_patch/record_created/set_state） |
| 用量洞察 | 从 SessionDB 聚合 | 30 天窗口 | 成本/工具/技能使用报告 | repos/hermes/agent/insights.py:1-4 |

关键的**第 5 条**是「压缩即抽取」：上下文压缩前调用 provider 的 on_pre_compress，把即将被丢弃消息里的洞见喂进摘要提示词——遗忘点就是写盘点。

- 【源码】repos/hermes/agent/memory_provider.py:194-197（契约：抽出洞见，注入 summary prompt）
- 【源码】repos/hermes/agent/conversation_compression.py:2890-2922（压缩器实际调用 memory_manager.on_pre_compress；v2 走 fail-closed checkpoint）
- 反面：cron 会话默认 skip_memory=True，定时任务刻意不产生记忆（repos/hermes/agent/AGENTS.md 引述）——这是隔离，不是遗漏。

**外部经验导入**（进化侧）：evolution/core/external_importers.py（29 KB）把 Claude Code / Copilot / Hermes 三种会话历史挖成评测集，对应 CLI 的 --eval-source sessiondb（repos/hermes-evolution/README.md:45-49；evolution/skills/evolve_skill.py:85-97）。

### A.2 技能：生成、演化、生命周期

#### A.2.1 生成（/learn 与 skill_manage）

/learn 不调用任何「技能蒸馏引擎」，而是**构造一段提示词**，让当前 agent 用已有工具采集来源、按 HARDLINE 规范写技能文件：

- 【源码】repos/hermes/agent/learn_prompt.py:1-6（build the ONE prompt；无蒸馏引擎、无额外工具占地，本地/Docker/远程一致）
- 两条最硬约束都有工程原因：
  - description ≤ **60 字符**：系统提示的技能索引只截断显示 60 字符，超出部分永远不会路由（learn_prompt.py:17-25）
  - author 固定写 Hermes，**不得**用 OS/登录名/git 配置：技能会被分享，环境名是隐私泄漏（learn_prompt.py:30-34）
- 知识库型技能必须拆成「瘦 SKILL.md 索引 + references/ 分章」（learn_prompt.py:86+，源自 book-to-skill 布局），直接对应「技能全文进上下文」的成本约束。

写入侧有硬预算与安全门：

| 门 | 阈值/策略 | 证据 |
|---|---|---|
| 名称/描述/正文 | 64 / 1024 / **100,000 字符**（≈36k tokens），单文件 1 MiB | tools/skill_manager_tool.py:108-111, 187-195 |
| 索引可见性 | 描述必须 ≤ SKILL_PROMPT_DESC_LIMIT，否则拒绝写入（历史长描述豁免） | tools/skill_manager_tool.py:173-186 |
| 静态安全扫描 | skills-guard-v10：四类信任级 × 三档判决；community 的 caution 直接 block | tools/skills_guard.py:21, 24-40 |
| 咨询式扫描 | NVIDIA SkillEvaluator Tier1（pii/unicode/lint/license/security），warn 不 block，默认开 | tools/skillevaluator_scan.py:1-12 |

【推断】agent-created 的判决是 ask（skills_guard.py:36），意味着 agent 自创技能在 dangerous 档会被要求重写——这是对「自我进化」的一道人工闸，防止技能成为持久化后门。

#### A.2.2 演化（DSPy + GEPA，唯一已实现的阶段）

闭环在 evolve_skill.py 里是 8 步流水线，全部落盘可审计：

1. 定位技能并解析 frontmatter/body（evolution/skills/skill_module.py:15-81）
2. 建评测集：synthetic（强模型生成）/ golden（人工）/ sessiondb（挖真实会话），train-val-holdout 三切（evolve_skill.py:79-116）
3. 基线先过约束（不过也继续，但打印告警）（:118-131）
4. dspy.GEPA(metric, max_steps=iterations) 编译；不可用则**回退 MIPROv2**（:155-176）
5. 取 evolved 文本并复检约束；**不过就不部署**，只存 evolved_FAILED.md（:186-204）
6. holdout 上与基线对比（:206-226）
7. 打印 baseline/evolved 对照表 + 尺寸差 + 耗时（:229-252）
8. 落盘 evolved_skill.md / baseline_skill.md / metrics.json（:254-283）

GEPA 的能力边界有一手论文支撑：ICLR 2026 Oral，六任务平均超 GRPO 6%、最多 20%，rollout 最多少 35 倍；超 MIPROv2 10% 以上（arXiv:2507.19457，v2 2026-02-14）。

**必须点出的三个实现弱点（源码证据 + 推断）**：

| 弱点 | 证据 | 推断后果 |
|---|---|---|
| 被优化的不是技能文本 | SkillModule 把 skill_text 作为 **InputField** 传入（skill_module.py:100-114），GEPA 只能改 predictor 的 instructions/few-shot；而 evolve_skill.py:183 读 optimized_module.skill_text（普通属性），GEPA 不会改写它 | 「进化后的技能」很可能与基线逐字节相同，或只变了 Signature 描述；README 的 Phase 1 ✅ 应理解为「流水线已实现」，非「技能文本已被有效进化」 |
| 适应度是关键词重叠 | 传给 GEPA 的是 skill_fitness_metric（:107-136，0.3+0.7×词面重合）；LLMJudge（:34-104）定义了却没传进 optimizer，holdout 也用它（:217,221） | 分数与「技能是否更好」弱相关，容易被「复述期望答案里的词」刷分 |
| 约束是静态规则，非行为回归 | constraints.py 校验尺寸/缓存兼容/语义保持；pytest 需显式 --run-tests（evolve_skill.py:44, 304） | 默认跑法没有行为回归门；PLAN.md:236-238 说要跑 TBLite/YC-Bench，代码里未见 |

#### A.2.3 生命周期（curator：伞形技能 + 绝不删除）

- 触发：无 cron 守护，靠「空闲 + 距上次 ≥ interval_hours」（默认 7 天、空闲 ≥2h）【源码】agent/curator.py:31, 106-116, 160-181
- 状态机：active → stale（14 天）→ archived（30 天）；**只移动目录到 .archive/，永不删除**；pinned 与 cron 引用的技能不被自动迁移（:209-261）
- 语义纠正：use_count==0 是「无证据」而非「陈旧」，不给归档（:248-253）——对「未使用即无用」的显式反驳
- LLM 合并段（默认 **OFF**，:35）由 fork 的 AIAgent 执行；提示词强制「库 = 类级指令 + 经验知识」，禁止一会话一条微技能，要求**蒸馏**（规则化、去叙事、去 PR 号/日期），SKILL.md 超 ~24k 字符即视为合并目标（:290-314）
- 合并前整树快照（curator_backup.snapshot_skills），报告写 logs/curator/<ts>/run.json + REPORT.md（:935-942, :973-982）

### A.3 Prompt 优化：Hermes 与 Letta 的分岔

| 维度 | Hermes | Letta（2026） |
|---|---|---|
| 优化对象 | 技能文本 /（计划中）工具描述、系统提示段、代码 | 上下文 + **harness 本身**（Mods：加工具/命令、改上下文喂法） |
| 落地方式 | 离线 GEPA → PR → 人审 → 合并（README.md:71-77） | 运行时自改（agent 改自己的 harness） |
| 硬约束 | 系统提示在一次会话内**字节稳定**，中途不许重建（AGENTS.md:20-23） | 无此约束（MemFS 版本化所有上下文） |
| 证据 | 【源码】skill_module.py / evolve_skill.py；AGENTS.md:20-23 | 【官方博客】letta.com/blog/introducing-mods/（2026-06） |

【推断】分歧点其实是可回滚性：Hermes 用 git + PR 换可审计/可 revert；Letta 用 MemFS/harness 自改换更快的适性，代价是运行时状态更难复现。
### A.4 记忆：写入 / 巩固 / 召回

#### A.4.1 内置记忆 = 有预算的文本文件（无向量库）

- 存储：MEMORY.md / USER.md，条目分隔符为换行+§+换行（tools/memory_tool_store.py:26），默认预算 memory **2200**、user **1375** 字符（:188）
- 巩固机制（全仓最反直觉、最值得抄的设计）：
  - 超预算**不是拒绝写入**，而是把 live entries 回给模型，要求「在同一次 batch 里 remove/patch 旧条目腾出 N 字符 + 加新条目」，预算只在 batch 结果上校验（:329-337）
  - 每回合失败上限 3 次，超过即 TERMINAL：「别再试，先回答用户」（:182-221）——防止记忆副作用把回合拖死
  - 成功写入后重置失败计数（:654-667）
- 注入：包成 memory-context 围栏 + 「这是回忆不是新输入」的系统注记（agent/memory_context.py:169-185）；流式输出用状态机 scrubber 防止半个围栏漏给用户（:30-116）
- 缓存纪律（关键）：
  - 系统提示快照在 load 时**冻结**，会话内写记忆不改它（memory_tool_store.py:194, 650-652，注释明写 preserving the prefix cache）
  - 同块内重复条目会被丢弃，因为整块被 stamp 进用户行的 api_content sidecar，「只要这行在上下文里，每条重复都要每轮再付一次钱」（memory_context.py:123-143）——把 token 成本写进代码注释的范例

#### A.4.2 外部记忆 provider（单插件、强隔离、出口脱敏）

- 单选：builtin 之外**只允许一个**外部 provider（agent/memory_manager.py:1-5；memory_provider.py:3-5），理由：工具 schema 膨胀与后端正冲
- 生命周期：initialize → system_prompt_block / prefetch / queue_prefetch → sync_turn → on_session_end / on_pre_compress / on_session_switch / on_delegation（memory_provider.py:114-201）
- 召回必须快：契约要求 prefetch 直接返回后台预取好的结果，queue_prefetch 在每轮后补（:138-149）；纯招呼/确认类输入跳过召回（TRIVIAL_PROMPT_RE，:66-81）
- 出口脱敏 fail-closed：每次扇出（turn sync / 召回查询 / 会话末 / 压缩 / 工具镜像 / 委派结果）都过 redact_for_egress，且「一个值里检测到的密钥会在整包中被掩掉」（memory_manager.py:89-135）
- 熔断：_StuckCallGate 按 (home, provider) 准入，卡死 4 次即关门、每 60s 只放一个探针、在飞上限 16（memory_manager.py:39-57, 142-193）——provider 卡死不会拖垮 agent
- 多 profile 隔离：一个网关进程服务多 profile，provider 实例必须绑定 initialize() 收到的 hermes_home，禁止跨 profile 复用/重绑（memory_provider.py:84-103）
- 树内已有的工业 provider：**ByteRover**（知识树 + 分层检索，brv CLI；plugins/memory/byterover/plugin.yaml）与 **RetainDB**（云端 memory API，7 memory types + hybrid search；plugins/memory/retaindb/plugin.yaml）；docstring 另点 honcho / hindsight（memory_provider.py:112）

#### A.4.3 上下文引擎（与记忆解耦的另一层）

context.engine 是可插拔压缩策略，默认 ContextCompressor；生命周期 on_session_start → update_from_response → should_compress/compress → on_session_end（agent/context_engine.py:1-8）。它决定「遗忘」，与记忆 provider 决定「记住」是两套接口。

### A.5 评估与回滚

| 环节 | 机制 | 证据 |
|---|---|---|
| 变体准入 | 尺寸/缓存兼容/语义保持/pytest 全过；不过则不部署，只留 FAILED 件 | evolve_skill.py:186-204；README.md:71-77 |
| 效果评估 | holdout 上 baseline vs evolved 同指标对比 + 尺寸/耗时 | evolve_skill.py:206-252 |
| 发布 | 只出 PR/分支，**从不直接 commit** | README.md:76；PLAN.md:124-127 |
| 回滚（技能） | 只归档不删除 + restore_skill；LLM 合并前整树快照 | skill_usage.py:617-673；curator.py:935-942 |
| 回滚（会话） | 会话 rewind / 压缩检查点 | hermes_state_rewind.py、agent/conversation_compression_checkpoint.py |

【推断】缺口在**没有线上闭环**：没有「新技能 vs 旧技能」A/B、没有把真实成功率回灌成适应度、PLAN.md 提到的统计显著性检查在代码中未实现。当前是「离线进化 + 人审上线」，不是「生产自学习」。

### A.6 安全边界（记忆 = 持久化注入面，技能 = 供应链面）

| 面 | 风险 | 处置 | 证据 |
|---|---|---|---|
| 记忆写入 | 提示注入/外泄内容跨会话持久化（注释原文：memory enters the system prompt, so a poisoned entry persists across sessions） | strict 威胁扫描；快照里替换为 [BLOCKED]，live 列表保留原样让人可删可查 | tools/memory_tool_store.py:29-32, 223-227 |
| 记忆变更 | 破坏性/后台写入 | gate/staged 审核、old_text 精确匹配、pin 匹配条目 | tools/memory_tool.py:64-141, 167-221 |
| 技能安装 | 恶意技能改 agent 配置/外泄凭据 | skills_guard 正则族 + 信任分级安装策略；自创技能 dangerous 档 ask | tools/skills_guard.py:21-40, 153-260 |
| 出站 | 密钥随记忆同步泄漏 | 全扇出脱敏；即使 security.redact_secrets 关掉也照脱 | agent/memory_manager.py:89-135 |
| 秘密作用域 | 多 profile 下 os.environ 泄漏 | get_secret fail-closed（UnscopedSecretError） | repos/hermes/agent/AGENTS.md（secret_scope 段）；agent/secret_scope.py |

### A.7 闭环图（文字版，不依赖渲染）

```
[用户回合] → turn loop / tool calls
   ├─→ SessionDB(SQLite+FTS5) ──→ 召回: session_search / FTS
   ├─→ trajectory jsonl ─┐
   ├─→ .usage.json 遥测 ─┤
   └─→ MEMORY.md/USER.md ┘  ↑ 超预算强制合并(2200/1375 chars)；压缩边界 on_pre_compress 抽洞见
   ├─→ 技能库 SKILL.md ←─ curator(空闲触发: stale/archive 确定性迁移; 合并 fork 默认 OFF)
   └─→ 学习图谱(记忆卡 × 技能)

离线支路: [SKILL.md + sessiondb 评测集] → GEPA 反思进化 → 约束门 → PR/人审 → 回到技能库
```

### A.8 Hermes 闭环的 6 个具体缺口（可执行）

1. **进化没打到技能文本**（见 A.2.2）：修法是把技能文本变成 GEPA 可写的 instruction 参数，而不是 InputField。
2. **适应度太弱**：把已实现的 LLMJudge 接进 optimizer，并加「成对比较 + 显著性」。
3. **缺行为回归**：--run-tests 应默认开启，并加「描述仍在 60 字符索引内可路由」这类契约测试。
4. **记忆与技能不互通**：learning_graph 只用词面重叠连边（learning_graph.py:192-204），没有「反复出现的记忆条目升级为技能候选」的机制。
5. **召回是单轮的**：prefetch 一次成型，没有迭代检索（对比 Letta 让 agent 反复 search_files/grep）。
6. **没有记忆效果评测**：仓库有大量 wire/行为测试，但没有 LoCoMo/LongMemEval 式记忆能力基线与回归（工业界已有现成口径，见 B.4）。

---
## B. 2025–2026 工业级 memory hub

### B.0 结论先行（5 条）

1. **「记忆 = 抽取 + 巩固 + 检索」已成共识，但 2026 年的巩固在退烧**：Mem0 新算法改成 **ADD-only 单次 LLM 抽取**（不再 UPDATE/DELETE），把判别力挪到检索侧（semantic + BM25 + entity 三信号混合），LoCoMo 71.4→91.6、LongMemEval 67.8→93.4、抽取延迟约减半。用 2025 年的旧数字（+26%、−91% p95、−90% token）评价 Mem0 已经过时。
2. **时间性（bi-temporal）才是图记忆的真正卖点**，不是「图比向量好」：Zep/Graphiti 的核心是事实的生效/失效区间 + 摄取时间，能回答「当时是什么」，纯向量 RAG 结构上做不到。
3. **治理/多租户从附加项变成一等公民**：Zep v4 把产品重定位为 unified context layer for enterprise data，配 RBAC（人）+ ABAC（agent/API key/UserGroup）+ 审计日志 + 源码溯源；Cognee 自 0.5.0 起默认开启多用户模式（存储后端支持时），隔离边界是 dataset，配 user/role/tenant 三级权限。2025 年那种「先做个性化、治理以后再说」的讲法已落后。
4. **基准可信度下降得比模型能力快**：LoCoMo 已饱和/被质疑（各家自报、口径互不可比）；LongMemEval 成为更硬的口径；MemoryAgentBench（arXiv:2507.05257，v4 2026-06）把「增量多轮中的更新/遗忘」当主考点。
5. **最便宜的高分方案可能是最笨的**：文件系统 + grep + 迭代检索（Letta Filesystem，74.0% LoCoMo，gpt-4o-mini）。说明瓶颈在 agent 的检索行为，不在存储引擎。

### B.1 参考架构（ingestion → extraction → consolidation → retrieval → governance → observability）

| 层 | 关键决策 | 失败模式 | 代表实现（一手证据） |
|---|---|---|---|
| 1 Ingestion | 事件粒度：整轮/逐消息/文档 chunk/业务数据行；是否保留原文（episode vs fact） | 粒度太粗→抽取丢信息；太细→实体碎片化 | Zep：episode 与业务数据同图（arXiv:2501.13956）；Cognee：三管线（ingestion / session learning / self-improvement）+ 关系库存 provenance（docs.cognee.ai/core-concepts/architecture.md） |
| 2 Extraction | 用 LLM 抽 fact/triplet/entity；单次还是多轮；是否同时产 embedding | over-extraction 降精度、under-extraction 降召回 | LangMem 把「enrichment 平衡创建与合并」作为可调指令（langchain-ai.github.io/langmem/concepts/conceptual_guide/）；Mem0 新版单次 ADD-only（docs.mem0.ai/open-source/graph-memory.md） |
| 3 Consolidation | 冲突消解：改写/失效/版本化/打时间戳；谁来判定 | 改写丢证据；失效判错即永久丢事实 | Graphiti：旧边失效而非删除，保留 t_valid/t_invalid（help.getzep.com/v4/graphiti/getting-started/overview.md）；Mem0 旧版 ADD/UPDATE/DELETE（arXiv:2504.19413），新版**取消**改写；Hermes：预算驱动自合并 |
| 4 Retrieval | 单信号 vs 混合；是否迭代；上下文预算与重排 | top_k 过大→噪声+token 爆炸；过小→漏 | Mem0 新默认 top_k 20 / threshold 0.1 / rerank 关（graph-memory.md）；Graphiti：semantic + full-text + graph 三路融合；LangMem：相似度 × 重要性 × 强度（新近/频次） |
| 5 Governance | 谁能读哪块记忆；租户隔离边界；删除/遗忘权；审计 | 越权读取、跨租户泄漏、无法证明合规 | Zep v4 Governance：RBAC + ABAC + Audit/API logs + source traceability；Cognee：dataset 级权限 + tenant/role |
| 6 Observability | 每次召回的分层解析：命中哪些记忆、为什么、花多少 token | 记忆坏了却看不出哪层坏 | Cognee 公布 token 账（1,118 tokens over 16,075 corpus；1,864 over 201,987；建图在 23–26 次重复查询后回本，docs.cognee.ai/core-concepts/evaluation-and-efficiency.md）；Hermes 有 recall 指示器（memory_provider.py:52-60, 146-149） |

### B.2 六家拆解（只写一手材料支撑的事实）

#### Mem0
- 形态：OSS 库 + 托管 Platform；论文 arXiv:2504.19413（2025-04-28）。
- 写入：消息 → LLM 抽取 fact（+元数据）→ 去重/embedding → 实体链接 → SQL（事实+元数据）/ 向量库 / 实体库三写（docs.mem0.ai/core-concepts/memory-types.md，2026）。
- 巩固（**已变**）：2026 新算法 = **单次 ADD-only，一次 LLM 调用，无 UPDATE/DELETE**；图记忆从 OSS 移除、转为 Platform 常开特性；search 默认 top_k 20、threshold 0.1、rerank 关；add() 只返回 ADD。
- 检索：语义 + BM25 关键词 + 实体匹配三信号混合。
- 多租户：user_id / agent_id / run_id / metadata 四维 scope；新版这些 id 从顶层参数移入 filters（旧写法直接 ValueError）。
- 评测（自报）：新算法 LoCoMo 71.4→**91.6**、LongMemEval 67.8→**93.4**、抽取延迟约减半；论文版相对 OpenAI memory +26%（LLM-as-judge）、p95 延迟 −91%、token −90%。
- 争议：Letta 指 Mem0 论文中「MemGPT 在 LoCoMo 上的结果」无法复现、请求澄清未获回应（letta.com/blog/benchmarking-ai-agent-memory，2025-08-12）。

#### Zep / Graphiti
- 形态：托管 Context Graph 服务 + OSS 图引擎 Graphiti。
- 写入/巩固：episode 进入 → 抽实体/关系 → 与既有边对齐；事实带**有效期**，新信息使旧边失效而非删除，因此可做「当时为真」的时间旅行查询。
- 检索：semantic + full-text + graph 三路融合；返回 Context Block 供模型消费。
- 治理（v4，2026）：RBAC（人）/ ABAC（API key、UserGroup）/ Audit log / API log / source traceability；企业版含 SOC 2 Type II、HIPAA BAA、VPC 部署、1 年审计日志保留（help.getzep.com/v4/governance.md；getzep.com/pricing）。
- 评测（自报）：DMR 94.8% vs MemGPT 93.4%；LongMemEval 准确率最高 +18.5%、延迟 −90%（arXiv:2501.13956）。
- 定位变化：从 agent memory 扩为「企业统一上下文层」，Context Lake on Konig 支撑百万级图（help.getzep.com/v4/overview.md）。

#### Letta（MemGPT）
- 形态：有状态 agent 运行时 + 托管。
- 写入：agent 通过工具自改（memory blocks / filesystem / MemFS）；MemGPT 论文 arXiv:2310.08560；sleep-time compute（arXiv:2504.13171，2025-04-17）把「思考」挪到空闲期，用延迟换质量。
- 巩固：后台记忆 agent 在空闲时整理上下文；2026 的 Letta Code 把记忆投影成 git 版本化文件系统 MemFS（letta.com/blog/why-memory-isnt-a-plugin/）。
- 检索：search_files（语义）/ grep（字面）/ open-close，让 agent 自己迭代。
- 关键论断（2026-04）：**记忆不是插件，是 harness 的职责**；「RAG over past sessions 可以是插件，但 retrieval 只是记忆的一小部分，而且很难比 grep 做得更好」。
- 评测：LoCoMo 74.0%（gpt-4o-mini，纯文件系统）；主张改用 Letta Leaderboard 这类「同框架同工具、只换模型」的口径。
- 自进化（2026-06）：Mods 让 agent 改 harness 本身；明确点名 DSPy/GEPA 与 skill learning 是「token 空间里的学习」，与 Hermes 同源。

#### Cognee
- 形态：OSS memory engine（Task/DataPoint 管线）+ 云。
- 存储：关系库（文档/chunk/**provenance**）+ 向量 + 图，三库分工（docs.cognee.ai/core-concepts/architecture.md）。
- 巩固：图压缩 + 会话学习 + 自改进三条管线共用同一抽象。
- 治理：0.5.0 起默认多用户模式，隔离边界为 **dataset**（每 dataset 独立图与向量库），user/role/tenant 三级授权（docs.cognee.ai/core-concepts/multi-user-mode.md）。
- 成本：公布 token 账与回本点（B.1 第 6 层），是少见把成本做成可验证指标的厂商。

#### MemOS
- 形态：论文（arXiv:2507.03724，2025-07-04，v4 2025-12-03）+ 产品 MemOS 2.0「Stardust」（memos.openmem.net，2026）。
- 主张：把记忆当 OS 资源调度——统一 plaintext / activation(KV-cache) / parametric 三类记忆，用 MemCube 封装并做生命周期与调度。
- 差异点：唯一把 **KV-cache 级记忆**纳入统一编址的方案，直接挑战「记忆=外部数据库」的默认假设。
- 形态与成本：云 API + plugin/CLI/MCP 接入，宣称毫秒级（厂商页面，未独立验证）。

#### LangMem
- 形态：LangChain 生态 SDK（库，不是服务）。
- 记忆分类：semantic（collection/profile）、episodic、procedural；写入分「有意识（hot path，对话中）」与「潜意识（background，对话后）」。
- 巩固：memory enrichment 显式平衡创建 vs 合并，指令可调；文档直说 over-extraction 降精度、under-extraction 降召回。
- 检索：召回分数 = 相似度 + 重要性 + 强度（新近/频次）。
- 治理/多租户：靠 namespace 约定 + 宿主 store（LangGraph Store）实现；SDK 自身不提供审计。
- 附带能力：可优化记忆 agent 自身的 prompt（与 GEPA 同族思路）。

### B.3 选型矩阵（2026-10 口径）

| 维度 | Mem0 | Zep/Graphiti | Letta | Cognee | MemOS | LangMem | Hermes 内置 |
|---|---|---|---|---|---|---|---|
| 交付形态 | 库/云 | 云 + OSS 图引擎 | 运行时/云 | 库/云 | 云 + 论文 | SDK | agent 内建库 |
| 写入路径 | 单次 LLM 抽取(ADD-only) | episode→实体/边，带有效期 | agent 自改文件/blocks | 三管线 + 三库 | MemCube 调度 | hot path / background | 预算驱动、模型自合并 |
| 巩固/冲突 | 交给检索侧（新版不再改写） | 旧边失效 + 时间戳（可回溯） | 后台 agent 整理 | 图压缩 + 会话学习 | 生命周期/迁移 | enrichment 指令可调 | 超预算强制合并 + 压缩边界抽取 |
| 检索 | 语义+BM25+实体 | 语义+全文+图 | grep/语义/迭代 | 向量+图+关系 | 多类型统一寻址 | 相似度+重要性+强度 | FTS5 会话检索 + provider prefetch |
| 治理/多租户 | user/agent/run/metadata scope | RBAC+ABAC+审计+溯源 | agent/模板隔离 | dataset 级 + tenant/role | 云侧（未公开细节） | namespace（自建） | profile 隔离 + 出口脱敏 |
| 评测口径 | 自报 LoCoMo 91.6 / LME 93.4（2026 算法） | 自报 DMR 94.8 / LME +18.5% | 反对工具间横比，推 Leaderboard | 公布 token 账 | 论文级 | 无统一口径 | 无记忆能力基准 |
| 成本模型 | 抽取 LLM 调用 + 向量存储 | credit（$125/月含 5 万 credits，$25/万） | 自托管为主 | 建图一次性 + 召回省 token | 云 API 计价 | 自付 LLM | 0 额外调用（除压缩模型） |
| 最适合 | 开箱即用 SaaS 记忆层 | 需要时间性/合规的企业 | agent 自治记忆 | 企业语料变可查图 | 研究记忆 OS/多类型 | 已在 LangChain 栈内 | 单人/小团队、强缓存纪律 |

### B.4 评测矩阵：这些基准到底测什么

| 基准 | 规模/形态 | 主考点 | 已知局限 | 一手证据 |
|---|---|---|---|---|
| LoCoMo | 很长对话（35 会话量级），QA | 单跳/多跳/时间/开放域检索 | 接近饱和；各家用不同 agent 包装，分数不可横比；Mem0 的 MemGPT 基线被质疑 | arXiv:2402.17753（2024-02-27）；letta 博客（2025-08-12） |
| LongMemEval | 500 题、可扩展历史 | 五能力：信息抽取、多会话推理、时间推理、**知识更新**、弃答 | 依赖读者模型；历史长度可自由缩放导致横向不可比 | arXiv:2410.10813（v2 2025-03-04；ICLR 2025） |
| DMR | MemGPT 团队自建 | 深度记忆检索 | 单一指标、易被针对 | arXiv:2310.08560 |
| MemoryAgentBench | 增量多轮交互 | 记忆的**更新/遗忘**与增量整合 | 2025-07 才出，生态少 | arXiv:2507.05257（v4 2026-06-28） |
| Letta Leaderboard | 同框架、只换模型 | 模型侧记忆管理能力 | 只覆盖 Letta 框架 | letta.com/blog/benchmarking-ai-agent-memory |

读法建议：把「某产品 LoCoMo X%」当成「该产品 agent 包装 + 检索工具 + 模型」的联合成绩，而不是存储引擎成绩；跨产品比较只在同模型、同工具集、同 top_k/预算下才成立——这正是 Letta 那篇博客的方法论主张。

### B.5 成本：三条路的账

| 方案 | 每轮上下文成本 | 一次性成本 | 何时划算 | 证据 |
|---|---|---|---|---|
| 全上下文 | ≈ 全量历史 token | 0 | 会话短、轮次少 | Mem0 论文基线（arXiv:2504.19413） |
| 图/记忆压缩 | 召回片段（Cognee 实测 1.1k–1.9k tokens） | 建图 token | 同一语料被反复查询 ≥23–26 次后回本 | docs.cognee.ai/core-concepts/evaluation-and-efficiency.md |
| 记忆注入（Hermes 式） | 记忆块 + 技能索引（硬上限 2200/1375 chars） | 0（无额外 LLM 调用） | 个人 agent、缓存敏感 | tools/memory_tool_store.py:188；memory_context.py:123-143 |

被忽略的第二条成本线是**延迟**：Mem0 报 p95 −91%（相对全上下文），Zep 报 −90%；sleep-time compute 反向操作——用离线算力换在线延迟（arXiv:2504.13171）。选型先要决定「延迟预算还是 token 预算更紧」。

### B.6 Hermes 可从工业实践直接借的 5 点

1. **巩固不必靠 LLM 改写**：Mem0 用 ADD-only + 多信号检索拿到更高分，说明「低成本写、聪明地读」是可行路线；Hermes 的「预算内自合并」与之同向，但缺混合检索与实体信号。
2. **时间性尽量别丢**：Hermes 的记忆条目没有生效/失效时间戳，只有文件 mtime；Graphiti 的 bi-temporal 是低成本可加的字段（有效区间 + 摄取时间）。
3. **把召回做成可观测**：Cognee 的 token 账是最可复制的治理手段；Hermes 只有 recall 计数指示器（memory_provider.py:52-60）。
4. **治理要前置**：Cognee 的 dataset 级隔离、Zep 的 ABAC 说明「按 dataset/租户切分」比「按 user_id 过滤」更可审计；Hermes 目前只有 profile 级隔离。
5. **评测别只做 wire 测试**：接一个 LongMemEval 子集做记忆回归，比再加 50 个行为测试更能证明「学习有效」。

### B.7 对 Trident 主架构的 5 条落地建议

衔接 [04-fusion-architecture.md](04-fusion-architecture.md) 的 §7「记忆与成长」与 §11「评测」。本附录的证据只支持到这 5 条具体的接口级取舍，其余留白见 04 文档 §7.2 的治理不变量。

| # | 建议 | 具体做法 | 本报告依据 | 落到 Trident 的位置 |
|---|---|---|---|---|
| 1 | **hot path 用 Hermes 式预算文本记忆** | 会话内高频读写的「用户偏好/当前任务约束」用有硬字符上限的文本块，超限即触发模型自合并（batch 内腾位+新增），并给每回合失败设上限；注入走 Z2/Z3，不进系统提示，保证前缀字节稳定 | 预算 2200/1375、强制合并与 TERMINAL（tools/memory_tool_store.py:188, 329-337, 182-221）；快照冻结保 cache（:194, 650-652）；重复条目重复付费（agent/memory_context.py:123-143） | §7.1 四层记忆的 Working/Episodic 交界；§7.4「读：pre-step 按需检索，不全量注入」 |
| 2 | **cold path 用 Zep/Graphiti 式时序图** | 跨会话事实进 Semantic 层时，边必须带生效/失效区间 + 摄取时间；新信息使旧边失效而非删除，回答「当时是什么」；抽取侧用 ADD-only 降低写入成本，判别力交给检索 | bi-temporal 与失效不删除（help.getzep.com/v4/graphiti/getting-started/overview.md；arXiv:2501.13956）；Mem0 新算法 ADD-only + LoCoMo 71.4→91.6（docs.mem0.ai/open-source/graph-memory.md） | §7.1 Semantic 层；§7.2 的 consolidation（merge / supersede / expire） |
| 3 | **治理按 dataset / tenant 切，不按 user_id 过滤** | 隔离边界做成「dataset（可含多人）× tenant」两级，权限授到 user/role/tenant 三类主体；每次读写在 dataset 级校验；跨租户共享走显式授权而非查询过滤 | Cognee 以 dataset 为隔离边界、user/role/tenant 三级（docs.cognee.ai/core-concepts/multi-user-mode.md）；Zep v4 RBAC+ABAC+审计+溯源（help.getzep.com/v4/governance.md） | §7.2 治理不变量「跨租户隔离」；§0.1 目标 6 可治理 |
| 4 | **检索走混合信号 + 显式 token 预算** | 语义（向量）+ 字面（BM25/grep）+ 图（实体/邻域）三路召回后融合，排序用「相关性 × 时效 × 置信度 × 作用域」，并强制 token 预算截断；保留迭代检索（agent 可再搜一次）作为兜底 | Mem0 三信号混合与 top_k 20/threshold 0.1 默认（graph-memory.md）；LangMem 相似度×重要性×强度（langmem conceptual guide）；Letta 文件系统+grep 74.0%（letta.com/blog/benchmarking-ai-agent-memory） | §7.2 的 retrieval 行；§7.4「解释为什么想起这个」 |
| 5 | **评测接 LongMemEval 子集 + 增量场景，进 canary 门** | 记忆回归用 LongMemEval 子集（含知识更新/弃答两类），增量更新用 MemoryAgentBench 场景；演化产物走「离线评测 → canary → promote/rollback」，指标含成功率、token、延迟、缓存命中、打断次数 | LongMemEval 五能力与 ~30% 掉点（arXiv:2410.10813）；MemoryAgentBench v4（arXiv:2507.05257）；Trident 的评估门要求 held-out | §7.3 Trajectory → Reflection → Proposal → Offline Eval → Canary → Promote/Rollback；§11 评测 |

取舍说明：1 与 2 是分层的，不是二选一——hot path 追求零额外 LLM 调用与缓存稳定，cold path 追求可回溯与时间性；若把时序图放进 hot path，每轮都会引入抽取调用与不稳定前缀，直接违反 §5 的缓存不变量。

---

## C. 「当前常见认知可能落后在哪」10 条

| # | 常见说法（2024–2025 流行） | 2026 的事实 | 来源 |
|---|---|---|---|
| 1 | Mem0 = LLM 抽取 + ADD/UPDATE/DELETE 改写 | 新算法**取消改写**：单次 ADD-only，靠 semantic+BM25+entity 混合检索拿分；LoCoMo 71.4→91.6、LME 67.8→93.4、抽取延迟约减半。引用旧数字（+26%、−91% p95、−90% token）评价它已过时 | docs.mem0.ai/open-source/graph-memory.md（2026）；arXiv:2504.19413 |
| 2 | 「向量库 + 相似度检索」就是记忆 | 检索已是多信号：Mem0 三信号混合、Graphiti 语义+全文+图、LangMem 相似度×重要性×强度；单信号 top-k 是 2024 的做法 | graph-memory.md；help.getzep.com/v4/graphiti/getting-started/overview.md；langmem conceptual guide |
| 3 | 图记忆的价值 = 「关系推理」 | 真正不可替代的是**时间性**：事实带生效/失效区间，旧事实失效而非删除，可回答「当时是什么」；这是纯向量的结构性缺口 | arXiv:2501.13956；Zep v4 overview |
| 4 | LoCoMo 是记忆能力的权威标尺 | 已饱和且不可横比：Letta 用「文件系统 + grep」在 gpt-4o-mini 上拿 74.0%，高于 Mem0 自报的 68.5% 图变体；新工作转向 LongMemEval（含知识更新/弃答）与 MemoryAgentBench（增量更新/遗忘） | letta.com/blog/benchmarking-ai-agent-memory（2025-08-12）；arXiv:2410.10813；arXiv:2507.05257 |
| 5 | 记忆是「可以插拔的插件」 | 2026 主流反驳：记忆是 harness 职责（上下文怎么裁、技能元数据放哪、压缩后什么能活）；RAG over past sessions 可以是插件，但 retrieval 只是记忆一小块，且很难比 grep 更好 | letta.com/blog/why-memory-isnt-a-plugin/（2026-04） |
| 6 | 自我改进 = 微调/RLHF | 文本空间进化已是主流工程实践：GEPA（ICLR 2026 Oral）六任务平均超 GRPO 6%、最多 20%、rollout 少 35 倍；Hermes 直接套在 SKILL.md 上。真正短板不是算法，而是**适应度与行为回归**（Hermes 用关键词重叠，见 A.2.2） | arXiv:2507.19457（v2 2026-02-14）；repos/hermes-evolution/evolution/core/fitness.py:107-136 |
| 7 | 记忆治理是「以后再说」的合规项 | 已成产品主战场：Zep v4 把 RBAC/ABAC/审计/溯源做成一级功能并重定位为「企业统一上下文层」；Cognee 自 0.5.0 起默认多用户（存储后端支持时）、以 dataset 为隔离边界。2026 谈 memory hub 不谈治理等于没谈 | help.getzep.com/v4/governance.md；docs.cognee.ai/core-concepts/multi-user-mode.md |
| 8 | 记住得越多越好 | 反向指标已成共识：over-extraction 降精度（LangMem）、重复条目每轮重复付费（Hermes 注释原文：each duplicate is paid once per turn, forever）、Cognee 用 token 账证明「压缩一次、按需取片」更省 | langmem conceptual guide；repos/hermes/agent/memory_context.py:123-143；docs.cognee.ai/core-concepts/evaluation-and-efficiency.md |
| 9 | 记忆与技能是两套东西 | 2026 开始合流：Letta Mods 把 skill learning / DSPy-GEPA 视作与记忆同源的 token 空间学习；Hermes 把「学到的技能」与 MEMORY/USER 卡片画进同一张学习图 | letta.com/blog/introducing-mods/（2026-06）；repos/hermes/agent/learning_graph.py:1-7, 192-215 |
| 10 | 基准=准确率，成本是工程细节 | 新综述把写/卸/召回/注入/物化/淘汰/**巩固**/遗忘定义为同一套状态迁移，给出统一预算成本模型，主张从静态逐点压缩走向可治理的生命周期管理 | arXiv:2610.21165（2026-10-15） |

#### C 补充（不计入上表 10 条，避免与任务口径冲突）

- **补充 A：**「上下文窗口够大就不需要记忆」——LongMemEval 的结论正相反：即便长上下文模型，跨持续交互的记忆仍会掉约 30% 准确率（arXiv:2410.10813）。窗口变大没有取消「选择性记忆」的问题。
- **补充 B：**「Prompt 优化 = 手写提示词」——GEPA 把「读轨迹 → 自然语言反思 → 提议并测试」做成可复用组件，且能只用 3 个样本起跑（repos/hermes-evolution/PLAN.md:15）；把 prompt 当超参手调正在被当工程对象替代。

---

## D. 来源清单（30 条，均为本报告实际抓取/阅读）

### D.1 论文（一手）

| ID | 标题/内容 | URL | 日期 |
|---|---|---|---|
| S1 | Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory | https://arxiv.org/abs/2504.19413 | 2025-04-28 |
| S2 | Zep: A Temporal Knowledge Graph Architecture for Agent Memory | https://arxiv.org/abs/2501.13956 | 2025-01-20 |
| S3 | MemOS: A Memory OS for AI System | https://arxiv.org/abs/2507.03724 | 2025-07-04（v4 2025-12-03） |
| S4 | GEPA: Reflective Prompt Evolution Can Outperform RL（ICLR 2026 Oral） | https://arxiv.org/abs/2507.19457 | 2025-07-25（v2 2026-02-14） |
| S5 | LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory | https://arxiv.org/abs/2410.10813 | 2024-10-14（v2 2025-03-04） |
| S6 | Evaluating Very Long-Term Conversational Memory of LLM Agents（LoCoMo） | https://arxiv.org/abs/2402.17753 | 2024-02-27 |
| S7 | MemGPT: Towards LLMs as Operating Systems | https://arxiv.org/abs/2310.08560 | 2023-10-12（v2 2024-02-12） |
| S8 | Sleep-time Compute: Beyond Inference Scaling at Test-time | https://arxiv.org/abs/2504.13171 | 2025-04-17 |
| S9 | A-MEM: Agentic Memory for LLM Agents | https://arxiv.org/abs/2502.12110 | 2025-02-17（v11 2025-10-08） |
| S10 | Evaluating Memory in LLM Agents via Incremental Multi-Turn Interactions（MemoryAgentBench） | https://arxiv.org/abs/2507.05257 | 2025-07-07（v4 2026-06-28） |
| S11 | From Long Context to Selective Memory: A Survey of Memory-Centric Compression for LLMs | https://arxiv.org/abs/2610.21165 | 2026-10-15 |

### D.2 官方文档 / 产品页

| ID | 内容 | URL | 说明 |
|---|---|---|---|
| S12 | Mem0「How Mem0 Works」 | https://docs.mem0.ai/core-concepts/memory-types.md | 抽取/检索两阶段、三库、四维 scope（2026） |
| S13 | Mem0 新记忆算法迁移指南 | https://docs.mem0.ai/open-source/graph-memory.md | ADD-only、混合检索、71.4→91.6 / 67.8→93.4、默认值变更（2026） |
| S14 | Zep v4 文档总览 | https://help.getzep.com/v4/overview.md | 企业上下文层、Context Graph / Context Lake / Konig（2026） |
| S15 | Zep v4 Governance | https://help.getzep.com/v4/governance.md | RBAC + ABAC + 审计 + 溯源 |
| S16 | Graphiti 概览 | https://help.getzep.com/v4/graphiti/getting-started/overview.md | 语义+全文+图融合、时间性事实 |
| S17 | Zep 定价 | https://www.getzep.com/pricing | credit 计价；企业版 SOC2/HIPAA/VPC/1 年日志 |
| S18 | Cognee 架构 | https://docs.cognee.ai/core-concepts/architecture.md | 关系（provenance）+向量+图、三管线 |
| S19 | Cognee 多租户 | https://docs.cognee.ai/core-concepts/multi-user-mode.md | 0.5.0 起默认多用户、dataset 隔离、user/role/tenant |
| S20 | Cognee Token 效率 | https://docs.cognee.ai/core-concepts/evaluation-and-efficiency.md | 1,118 / 1,864 tokens 上下文、23–26 次回本 |
| S21 | LangMem 概念指南 | https://langchain-ai.github.io/langmem/concepts/conceptual_guide/ | semantic/episodic/procedural、hot path vs background、相似度+重要性+强度 |
| S22 | MemOS 官网（2.0 Stardust） | https://memos.openmem.net/ | 云 API/插件/MCP、毫秒级宣称（厂商口径） |
| S23 | Letta：Benchmarking AI Agent Memory（文件系统 74.0%） | https://www.letta.com/blog/benchmarking-ai-agent-memory | 2025-08-12 |
| S24 | Letta：Why Memory Isn't a Plugin | https://www.letta.com/blog/why-memory-isnt-a-plugin/ | 2026-04 |
| S25 | Letta：Introducing Mods（harness 级自改） | https://www.letta.com/blog/introducing-mods/ | 2026-06 |
| S26 | OpenAI：Memory and new controls for ChatGPT | https://openai.com/index/memory-and-new-controls-for-chatgpt/ | 2024-02-13（历史锚点） |
| S27 | Graphiti 仓库 | https://github.com/getzep/graphiti | OSS 图引擎 |
| S28 | Mem0 仓库 | https://github.com/mem0ai/mem0 | OSS 库 |

### D.3 源码（本地浅克隆，行号见正文）

| ID | 内容 | 位置 | commit |
|---|---|---|---|
| S29 | NousResearch/hermes-agent | repos/hermes（sparse: agent, tools, skills, plugins, hermes_cli, gateway, evals, apps, hermes_platform, docs） | f4af5c3（2026-10-31） |
| S30 | NousResearch/hermes-agent-self-evolution | repos/hermes-evolution（evolution/ + tests/ + PLAN.md + README.md） | 0a929e3（2026-06-17） |

辅助：arXiv API（export.arxiv.org，2026-11-01 抓取）用于确认 S10 的 v4 修订时间与 S11 的提交日期；Zep 文档索引 help.getzep.com/v4/llms.txt 用于定位 S15/S16。

---

## E. 方法学、可复现与留白

- hermes 行号取自工作树（对应 commit f4af5c3）；上游继续演进后行号会漂移，引用以 commit 为准。
- 为取 skills/、plugins/、tools/ 三个目录做了 sparse-checkout add（原 checkout 仅 agent/apps/docs/evals/gateway/hermes/hermes_cli/hermes_platform），**未修改 repos/ 内任何文件内容**。
- 未验证、明确留白：MemOS 云服务毫秒级延迟、RetainDB/ByteRover 实际检索质量、Zep/Mem0 企业版真实计费、Hermes GEPA 进化的真实收益（A.2.2 已指出代码路径缺陷，未端到端跑通）。
- 本文档中所有「自报」数字均标为自报；未做独立复现。
