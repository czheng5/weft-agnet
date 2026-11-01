# 06 · 推导审计：核心结论与“已暴露代码 / 功能描述”的对应关系

> 目的：不是再找新证据，而是逐条检查前五份报告中的**推导**是否超出了已暴露的代码、类型、测试、官方文档与发布说明；把“源码事实”“多源综合”“合理推断”“工程外推”分开。
>
> 结论先行：**机制层结论基本都能落到已暴露代码或功能描述；融合架构 Trident 属于“综合推导 + 工程外推”，不是对任一仓库的源码事实陈述；收益层（命中率、成功率、延迟、成本）没有实测，不能由现有证据推出。** 本轮抽查 40 条核心断言：29 条直接/强支持，11 条为综合推断或需要限定措辞；已修正 5 处引用/措辞问题。

---

## 1. 审计口径

| 级别 | 含义 | 判定标准 |
|---|---|---|
| **V1 直接源码** | 类型、函数、测试、注释、配置可直接复核 | 能给出 `path:line` 且语义无歧义 |
| **V2 多源综合** | 多个源码/文档点共同支持，结论是归纳 | 每个环节有证据，但“串起来”的图是分析者画的 |
| **V3 合理推断** | 负证据（grep/缺失）+ 命名/配置/分发形态推断 | 不能被现有仓库直接证明，但反证成本高 |
| **V4 工程外推** | 设计建议、架构组合、工期/收益估算 | 不能由现有证据证明，只能由实验/上线验证 |

| 判定 | 含义 |
|---|---|
| ✅ | 与已暴露代码/功能描述一致 |
| ⚠️ | 有条件一致：结论成立，但必须带限定语，或只是“一种合理解释” |
| ❌ | 不成立，需要改写（本轮未发现必须推翻的核心结论） |

审计范围：`00-overview.md` 的 12 条 TL;DR + `04-fusion-architecture.md` 的核心设计断言 + 各分报告摘要中的关键数字。**不逐行审计 300+ 条证据表**；证据表本身已由各报告给出。

---

## 2. 逐条审计

### 2.1 Codex（10 条）

| # | 断言 | 已暴露证据 | 级 | 判定 | 备注 |
|---|---|---|---|---|---|
| C1 | 权限是“六层决策 + 沙箱兜底” | `protocol.rs:1146-1169`、`sandboxing.rs:195-236`、`exec_policy.rs:857-874`、`approvals.rs:596-621`、`guardian-reviewer/*` | V2 | ✅ | 代码里没有一张“六层”总图；这是把分散分支归纳成阶梯。实际控制流有跳转，不是严格串联 |
| C2 | `OnRequest + Restricted + 未请求越权 → 直接 Allow` | `exec_policy.rs:865-874`（注释原文：“do not prompt for non-escalated, non-dangerous commands”） | V1 | ✅ | 这是“顺”的最硬支点 |
| C3 | 会话级审批缓存可复用 | `sandboxing.rs:72-118`（`ApprovedForSession` 对 key 子集生效） | V1 | ✅ | 缓存 key 是序列化后的规范化动作，不是原始字符串 |
| C4 | Guardian 只读、90s、连续拒绝熔断 | `guardian-reviewer/src/lib.rs:85-87`、`deadline.rs:48-64`、`circuit_breaker.rs:3-7` | V1 | ✅ | 3 次连续 / 50 窗口 10 次是标准模型阈值；cyber 模型更严 |
| C5 | Guardian 用 `risk_level × user_authorization` 分级 | `prompts/templates/guardian/policy_template.md:69-78`、`assessment.rs:11-18` | V1 | ✅ | low/medium→allow，high→需授权且动作窄，critical→deny |
| C6 | Codex 没有内建 CUA，CUA 是 MCP 连接器 + 治理 | 负证据：`core/src/tools/handlers/` 无 screenshot/click；正证据：`protocol/src/mcp.rs:41-52`、`mcp_tool_call.rs:1438-1462`、`config/src/computer_use.rs:9-35` | V3 | ⚠️ | “没有内建”是负证据，强；但 `cua_repl` 的实现不在 repo，无法验证其实际能力与安全行为。结论应表述为“开源仓库内没有驱动，只有治理面” |
| C7 | Windows 有三条部署形态（RestrictedToken / Elevated / MXC） | `sandboxing/src/windows.rs:15-104`、`mxc-sandbox/README.md:3-7,49-58` | V1 | ✅ | `SandboxType` 是五个枚举（含 None）；Windows 三形态是部署层归纳 |
| C8 | `on-failure` 已并入 `on-request` | `protocol.rs:1154`（`#[serde(alias = "on-failure")]`） | V1 | ✅ | 不是独立枚举；旧文档/旧记忆容易错 |
| C9 | 升级保留 denied-read，能力不足即拒绝 | `sandboxing.rs:238-314`、`orchestrator.rs:491-554` | V1 | ✅ | 有 denied-read 时 `RequireEscalated` 会降级为 `UseDefault`，不会真无沙箱 |
| C10 | 网络拒绝可异步等待 host 批准 | `network_approval.rs:198-290` | V1 | ✅ | 进程原地等，不杀命令；批准后继续 |

### 2.2 Claude（10 条）

| # | 断言 | 已暴露证据 | 级 | 判定 | 备注 |
|---|---|---|---|---|---|
| L1 | `claude-code` 仓库不是核心开源 | 1,473 文件；无 `src/`、`package.json`、`cli.js`（本轮实测 `Test-Path` 全 False） | V1 | ✅ | 只有文档/示例/插件/CHANGELOG；核心在 npm 分发的原生包 |
| L2 | plan mode 是“只读前言 + 工作流正文 + ExitPlanMode footer” | `sdk.d.ts:2057-2062` 注释原文：`planModeInstructions` 替换 workflow body，CLI 仍包 read-only preamble + ExitPlanMode protocol footer | V1 | ✅ | 这是“计划外置”的最硬证据 |
| L3 | 计划落盘为文件，压缩后可重注入 | `sdk-tools.d.ts:3395-3404`（`ExitPlanModeOutput.filePath`，注释 “The file path where the plan was saved”） | V1 | ✅ | “压缩后重注入”来自官方 context-window 文档与 02 报告 §3.9；属于 V2 |
| L4 | 新模型默认退役 Todo/Task 四件套 | `CHANGELOG.md:4288` 原文：“no longer available on Opus 4.8, Sonnet 5, Fable 5, Mythos 5, and newer”；可用 `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` 恢复 | V1 | ✅ | 因此“清单是执行力核心”不成立；清单是给人和宿主的投影 |
| L5 | Task DAG 有 blocks/blockedBy/owner | `sdk-tools.d.ts:2805-2870` | V1 | ✅ | 这是工具 schema，不是内部调度器实现 |
| L6 | Workflow 支持节点级缓存续跑 | `sdk-tools.d.ts:2900-2902` 原文：“Completed agent() calls with unchanged (prompt, opts) return their cached results instantly” | V1 | ✅ | 原报告曾误引 `:2841-2842`，本轮已修正为 `:2900-2902` |
| L7 | 子代理默认后台、可命名、可 worktree/remote 隔离 | `sdk-tools.d.ts:797-799,800-803,812-815` | V1 | ✅ | “默认后台”是注释原文；“只回摘要”来自 AgentOutput 结构，属 V2 |
| L8 | 核心引擎在 8 个平台原生包中 | `package.json` 的 `optionalDependencies` 列 8 个平台包；主包只有 7 个文件/190,269 B | V3 | ⚠️ | 只能证明“分发形态是原生包”，不能证明内部架构/语言/模块划分；不要写成“引擎一定是 Rust/Go” |
| L9 | 执行力来自“状态外置 + 三主体验证 + 压缩契约 + 子代理隔离 + 权限分档 + 事件总线” | 02 报告 §5 的六条，每条有 `sdk.d.ts`/`types.py`/`CHANGELOG` 证据 | V2 | ✅ | 这是六条机制的归纳；“六因”不是官方术语 |
| L10 | 权限有 6 模式 + 分类器 + 沙箱 + 目录边界 | `sdk.d.ts:2050-2055`（permissionMode）、`examples/settings/README.md:27`（sandbox 只作用于 Bash） | V2 | ✅ | “6 模式”以 SDK 注释为准；具体组合行为仍需实测 |

### 2.3 DSH（9 条）

| # | 断言 | 已暴露证据 | 级 | 判定 | 备注 |
|---|---|---|---|---|---|
| D1 | 缓存命中是“日志只追加 + 纯函数投影”的推论 | `.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.md:17-19` 原文：“Prefix-cache stability is corollary #1, not the headline… stability is emergent, not managed.” | V2 | ✅ | 这是设计声明 + 代码实现共同支持；不是作者对“所有 provider 都命中”的承诺 |
| D2 | DSH 没有专门的 prompt-cache 管理器 | 全仓 grep 不到“统一缓存策略层”；但存在 `deriveMessages()` 派生消息缓存（`session/src/index.ts:974-1020`） | V3 | ⚠️ | 应表述为“没有独立的 provider prompt-cache 管理器；有派生投影缓存”。本轮已修正 00/03/README 的绝对措辞 |
| D3 | `deriveMessages()` 逐节点缓存 + 深冻结共享 identity | `session/src/index.ts:991-1019`（注释 “CACHED: pure tail growth costs O(new nodes)”，“SHARED and deep-frozen”） | V1 | ✅ | 相邻请求复用同一 Message 对象，序列化自然 byte-identical |
| D4 | 请求分区是 Z0-Z3 四区 | DSH 实际是 `system` 顶层槽 + `tools[]` + `messages` + 尾部 runtime snapshot（`llm-deepseek/src/serialize.ts:57-168`；`agent.ts:463-477`） | V4 | ⚠️ | Z0-Z3 是我们为融合架构画的抽象，不是 DSH 源码里的命名；不要把抽象当事实 |
| D5 | 易变上下文以“追加快照 + supersedes”进入历史 | `agent.ts:463-477`（恒 `surfaceOp: 'append'`）、`runtime-context.ts:157-168`（内容相同不写） | V1 | ✅ | 系统提示保持字节稳定；策略切换不重写前缀 |
| D6 | 压缩请求复用 warm prefix | `compaction-basic/README.md:243-245` 原文：“match the conversation's last routed request byte-for-byte… only that instruction, and the summary output, is uncached” | V1 | ✅ | 这是包 README 的成文契约，不是实测 |
| D7 | 工具顺序确定（字典序/toolOrder） | `system-prompt/src/index.ts:136-175`、`tests/tool-order.spec.ts:27-43` | V1 | ✅ | 与 provider 注册顺序无关；同 order 按码元比较 |
| D8 | fork 子代理不传模型参数以复用父前缀 | `bundle/base/cordis.patch.yml:386-394` 注释原文：“Fork omits model-selection arguments for KV Cache reuse” | V1 | ✅ | 这是“缓存约束反向塑造 API 设计”的直接证据 |
| D9 | 权限 fail-closed、策略按调用携带 | `sandbox/src/index.ts:69-80,139-152`、`user-approval/src/index.ts:293-318` | V1 | ✅ | 无 answerer/异常 → 拒绝；不静默放行 |

### 2.4 Hermes（4 条）

| # | 断言 | 已暴露证据 | 级 | 判定 | 备注 |
|---|---|---|---|---|---|
| H1 | 记忆是 2200/1375 字符预算，超限强制模型自合并 | `tools/memory_tool_store.py:188`（默认值）、`:329-337`（要求同一 batch 腾位+新增） | V1 | ✅ | 预算内自合并，不是向量去重 |
| H2 | 每回合失败 3 次即 TERMINAL | `tools/memory_tool_store.py:182-221`（`_MAX_CONSOLIDATION_FAILURES_PER_TURN = 3`） | V1 | ✅ | 防止记忆副作用拖死回合 |
| H3 | `/learn` 的 description ≤60 字符、author 固定 Hermes | `agent/learn_prompt.py:17-25,30-34` | V1 | ✅ | 60 字符是系统提示索引截断；author 是隐私约束 |
| H4 | GEPA 很可能没有真正优化技能文本 | `evolution/skills/skill_module.py:100-114`（`skill_text` 是 InputField，不是可优化参数）、`evolve_skill.py:181-184`（读 `optimized_module.skill_text`） | V3 | ⚠️ | 这是代码级推断，未端到端跑通；必须继续标“推断” |
| H5 | curator 7/14/30 天、只归档不删除 | `agent/curator.py:31-35`（7 天/14 天/30 天、consolidate 默认 OFF）、`:209-261`（stale/archive 迁移，pinned/cron 保护） | V1 | ✅ | “只移动目录、不删除”见 `_archive_as_curator`，05 报告已给行号 |

### 2.5 融合架构 Trident（6 条）

| # | 断言 | 依据 | 级 | 判定 | 备注 |
|---|---|---|---|---|---|
| T1 | 一内核、四平面、一交互面 | 对 Codex/Claude/DSH 机制的归纳 | V4 | ⚠️ | 这是架构抽象，不是任一仓库的事实；用于组织设计，不用于证明 |
| T2 | Z0-Z3 请求布局 | DSH 的 system/tools/messages/runtime 分区 + 我们的压缩/指令分层 | V4 | ⚠️ | “Z0-Z3”是设计命名；落地时要按 provider 能力调整 |
| T3 | 权限“15 个顺滑手段” | 1-11 有 Codex 锚点；12-13 部分有 Guardian/request_permissions 锚点；14-15 是融合新增（checkpoint、打断率观测） | V2/V4 | ⚠️ | 表中已标“融合层新增”的项不能算 Codex 源码事实 |
| T4 | hot path 文本记忆 + cold path 时序图 | Hermes 预算记忆 + Zep/Graphiti bi-temporal + Mem0 ADD-only | V4 | ⚠️ | 这是组合设计；两篇来源各自成立，组合未实测 |
| T5 | 先 M0 权限、再 M2 长程、再 M3 记忆 | 工程判断 | V4 | ⚠️ | 工期 2-3/4-6/6-8 周是估算，不是承诺 |
| T6 | “Codex 永不自己拥有屏幕权限” | 基于 repo 边界：CUA 驱动不在 repo，治理在 repo | V3 | ⚠️ | 更准确：“Codex 开源仓库不实现屏幕驱动；是否在闭源客户端/服务端拥有权限，repo 不可证” |

---

## 3. 三条关键推导链（逐步对齐）

### 3.1 Codex 权限“顺”的推导链

```text
① AskForApproval 默认 OnRequest
   protocol.rs:1153-1156
② 文件沙箱是 Restricted
   protocol.rs:1232-1280 / models.rs:426-440
③ 未命中 execpolicy、未请求越权
   exec_policy.rs:857-874
④ 结论：直接 Allow，不弹窗
   exec_policy.rs:865-874（注释原文）
⑤ 沙箱执行；若 Denied，进入升级
   orchestrator.rs:393-445
⑥ 升级只评审“真实重试权限”，并保留 denied-read
   orchestrator.rs:491-554 / sandboxing.rs:253-314
⑦ 批准结果可缓存/可沉淀为规则
   sandboxing.rs:72-118 / ReviewDecision 多粒度
```

**审计结论**：①-⑦ 每一环都有源码；把①-④说成“普通受限命令不弹窗”是直接结论，不是外推。把①-⑦画成“六层阶梯”是**分析者抽象**，但抽象不改变事实。

### 3.2 DSH 缓存命中的推导链

```text
① 会话日志 append-only
   docs/architecture.md:122-124
② deriveMessages() 逐节点纯函数投影 + 深冻结
   session/src/index.ts:974-1020
③ 相邻请求共享同一批冻结 Message 对象
   agent.ts:728-743
④ header（config+tools）只在变化时写全量快照
   agent.ts:665-691；request-header.ts:43-52
⑤ 请求 = 前一个请求的 append-extension
   ①+②+③+④
⑥ 易变上下文以尾部快照追加，不改 system
   agent.ts:463-477；runtime-context.ts:157-168
⑦ provider 前缀缓存命中（服务端行为）
   由 cacheReadTokens 观测；e2e 断言第一次之后 >0
```

**审计结论**：①-⑥ 是源码事实；⑦ 是**服务端行为 + 观测断言**，不是 repo 能单独证明的。因此“DSH 高命中”应表述为“DSH 的请求构造使高命中成为结构默认，并在 with-key e2e 中用 cacheReadTokens 观测”，不能表述为“任何 provider 上都高命中”。

### 3.3 Claude 长程“计划外置”的推导链

```text
① plan mode = 只读前言 + workflow body + ExitPlanMode footer
   sdk.d.ts:2057-2062
② 计划写入文件，返回 filePath
   sdk-tools.d.ts:3395-3404
③ 压缩后从磁盘重注入 plan
   官方 context-window 文档（02 报告 §3.9，V2）
④ Task/Workflow/Subagent 提供执行与恢复
   sdk-tools.d.ts:2805-2870, 2900-2902, 775-816
⑤ 结论：长程执行力来自“计划外置 + 状态机 + 验证”，不是清单
   ①-④ 的归纳
```

**审计结论**：①-② 是 schema/注释直证；③ 是官方文档（V2）；④ 是工具契约；⑤ 是归纳。把“plan mode”说成“独立规划器”会错——它只是提示词协议 + 文件 + 工具，规划仍由模型完成。

---

## 4. 本轮已修正项

| # | 位置 | 原问题 | 修正 |
|---|---|---|---|
| 1 | `02-claude.md:148` | Workflow `scriptPath` 落盘描述误引 `:2839-2840` | 改为 `:2896-2898` |
| 2 | `02-claude.md:149` | `resumeFromRunId` 节点级缓存误引 `:2841-2842` | 改为 `:2900-2902` |
| 3 | `02-claude.md:147,309,354` | WorkflowInput 范围写作 `:2872-2900` | 改为 `:2872-2903` |
| 4 | `00-overview.md`、`03-dsh.md`、`README.md` | “DSH 没有缓存管理器”过于绝对 | 改为“没有独立的 provider prompt-cache 管理器；有派生投影缓存” |
| 5 | `04-fusion-architecture.md` | “六层”与表内 L0-L6 七行不一致 | 改为“六层决策 + 沙箱兜底”，明确 L6 是执行兜底 |

> 说明：01 报告在定稿过程中曾发生一次 read-then-write 截断（80KB→50KB），作者已用分块写回恢复为 659 行/E0–E119；本轮抽查其 §2/§3/§4 关键结论，行号与源码一致。

---

## 5. 不能由现有证据推出的结论（必须保留为“未知”）

1. **性能/收益数字**：缓存命中率、任务成功率、审批延迟、成本下降——没有同任务同模型 A/B。
2. **Guardian 的误放行率/误拦截率**：只有策略模板与阈值，没有标注集上的 ROC。
3. **CUA 驱动的真实行为**：`cua_repl` 实现不在 repo；无法验证它是否真的按 app allowlist 执行、是否记录每个点击。
4. **Claude 内部压缩提示词 / auto 分类器**：native binary 不可读；只有协议/类型/变更日志。
5. **Hermes GEPA 的端到端效果**：代码路径存在“技能文本可能未被优化”的疑点，未跑通。
6. **Memory Hub 厂商分数**：LoCoMo/LongMemEval 多为自报，未独立复现；跨厂商不可横比。
7. **Trident 的组合收益**：hot/cold 记忆、Z0-Z3、六层权限的组合是否真的更好——需要 M0/M2 实测。
8. **“Codex 永不拥有屏幕权限”**：只能证明开源 repo 不实现驱动；闭源客户端/服务端不可证。

---

## 6. 可信边界与使用建议

| 层 | 可信度 | 可以怎么用 |
|---|---|---|
| **机制层**（源码/类型/测试） | 高 | 直接作为设计依据；引用 `path:line` |
| **设计层**（多源综合/成熟模式） | 中高 | 作为架构方案；标注“综合推导” |
| **收益层**（性能/成本/成功率） | 低 | 只能作为假设；上线前用 M0 指标验证 |

**一句话**：这份研究目前是“**机制一致、设计合理、收益待证**”。它符合已暴露代码与功能描述，但没有把“推导”冒充“实测”。如果只做一件事来升级可信度：选一个真实 Windows 任务跑 M0，记录 **cache hit rate / 人工打断次数 / 误放行次数** 三个数，就能把设计层从“合理”推进到“有效”。

---

## 7. 复现命令（抽查用）

```powershell
# Codex：普通受限命令不弹窗
Select-String -Path repos/codex/codex-rs/core/src/exec_policy.rs -Pattern "do not prompt for non-escalated"

# Codex：on-failure 是 alias
Select-String -Path repos/codex/codex-rs/protocol/src/protocol.rs -Pattern "alias = "on-failure""

# Claude：plan mode 三段式
Select-String -Path report/evidence/claude/npm/sdk-ts/package/sdk.d.ts -Pattern "read-only enforcement preamble"

# Claude：Todo/Task 退役
Select-String -Path repos/claude-code/CHANGELOG.md -Pattern "no longer available on Opus 4.8"

# DSH：缓存稳定是推论
Select-String -Path repos/dsh/.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.md -Pattern "corollary #1"

# Hermes：记忆预算与失败上限
Select-String -Path repos/hermes/tools/memory_tool_store.py -Pattern "2200|_MAX_CONSOLIDATION_FAILURES_PER_TURN"
```
