# Weft（纬）：Codex / Claude / DSH 三体融合研究

> **产品名：Weft（纬）** · **主题色：Weft Cyan `#22D3EE`** · TUI 模板与 ANSI 渲染器见 [../brand/README.md](../brand/README.md)。
>
> **开发文档：** [PRD v1.0（FROZEN）](../PRD.md) · [Roadmap v1.0（FROZEN）](../ROADMAP.md) · [接口契约](../docs/interfaces.md) · [附录 A · Polyglot](../appendix/polyglot-hub.md)。
>
> 研究目标：从三个官方仓库与公开分发物中，提炼各自真正的结构性优势，给出一套可落地的融合型 Agent 架构，并把 Hermes Agent 的自我成长与工业级 Memory Hub 作为附录。
>
> **一句话结论：以 Codex 之手（策略化执行与权限）、Claude 之脑（可验证的长程规划）、DSH 之脊（插件内核与缓存友好上下文）为主干，以 Hermes / Memory Hub 为记忆与成长层，构建“策略治理的执行 + 可验证的长程规划 + 缓存友好的事件内核 + 带评估门的记忆成长”。**

---

## 1. TL;DR：12 条核心发现

1. **Codex 的真正护城河是“可执行的权限系统”，不是代码能力。** 它把权限拆成六层决策 + 沙箱兜底：静态策略 → execpolicy 规则 → 会话审批缓存 → Hook → Guardian 自动评审 → 人工；默认在沙箱内执行，失败才升级，升级还保留 denied-read 约束。
2. **Codex 的“顺滑”不是“少问”，而是“问得准”。** `AskForApproval` 四档 + `Granular` 细分 + 会话级审批缓存 + “批准一次固化为规则” + 审批风暴熔断，共同把打断降到最低，同时保留可审计的拒绝路径。
3. **Codex 的电脑使用在开源仓库里主要是“治理面”。** CUA 不在 repo 内实现，而是 MCP 连接器 `cua_repl` / `node_repl` / `connector_openai_browser`；Codex 负责 `GuardianScope::ComputerUse` 审核、按 `browser_use` / `computer_use` 下发确认策略、按 macOS bundle_id / Windows AUMID/EXE 授权、锁屏与持久批准策略。**它永远不自己拥有屏幕权限。**
4. **Windows 沙箱是 Codex 2026 年的重点。** `SandboxType` 共五个枚举（含 None），Windows 有三条部署形态：RestrictedToken（非提权）、Elevated ACL + Windows 服务（提权）、MXC BaseContainer（PSEC 原生严格后端）。还有 WFP 网络隔离、AppContainer、DPAPI、桌面隔离等配套。
5. **Claude Code 的强项是把长程任务“产品化”。** Goal（可被独立 evaluator 验证的完成条件）、Task DAG（blocks/blockedBy/owner）、Workflow（agent/parallel/pipeline/phase + resumeFromRunId）、Subagent（后台/命名/worktree/remote）、Cron/Wakeup/Monitor、Checkpoint/Rewind，都是一等对象。**但要注意**：2.1.233 起 TodoWrite/Task 四件套在 Opus 4.8+/Sonnet 5+ 默认退役（官方理由：新模型不需要书面清单）——清单应定位为“给人/宿主看的进度投影”，而不是执行力的核心机制。
6. **Claude 的执行力来自闭环，不是单次提示。** 计划 → 执行 → 证据 → 独立验证 → 失败分类 → 重规划/恢复；状态外置在任务与日志里，不依赖模型记忆。
7. **Claude Code 核心并非完整开源。** `anthropics/claude-code` 仓库主要是文档、插件、示例与变更日志；核心引擎在 npm 分发包（且 2.1.316 已是 native wrapper + schema）；官方开源的是 Agent SDK（Python/TypeScript）。本研究对 Claude 的证据严格区分“SDK/分发包 schema 证据”“官方文档”“逆向/推断”。
8. **DSH 的强项是“一切皆插件 + 会话日志为唯一事实源 + 缓存友好上下文”。** 连 agent-loop、模型适配器、工具注册表、会话日志都是可替换插件；模型所见上下文由追加式日志投影而来。
9. **DSH 把 KV Cache 效应写进了每个包的契约，但它没有专门的“provider prompt-cache 管理器”**（有派生消息缓存与工具缓存，见 §3）。 命中是“日志只追加 + 投影是纯函数”的推论：稳定前缀、字节一致、追加快照、压缩复用 warm prefix、工具 schema 稳定排序——这是目前三者中最系统的缓存工程。
10. **融合的关键是共同内核，而不是功能拼接。** 追加式事件日志 + 冻结请求 + 策略化执行 + 可验证计划 + 带治理的记忆，这五件事让三家的优势能长在一个身体上。
11. **落地顺序应是“先安全执行，再长程规划，再记忆成长”。** 没有可靠的权限与恢复，长程规划会变成事故放大器；没有评估门，记忆成长会变成污染源。
12. **最大风险不是能力不足，而是治理失效。** Guardian 误判、审批疲劳、缓存僵化、计划剧场、子代理发散、记忆投毒、自我演化失控——每一条都要在架构里有对应机制。

---

## 2. 三个 Harness 的“一句话画像”

| Harness | 一句话 | 最强能力 | 最适合借鉴的部分 |
|---|---|---|---|
| **Codex** | 一个安全默认、可审计、跨平台的执行内核 | 沙箱 + 审批 + Guardian 自动评审 | 权限决策阶梯、平台沙箱、CUA 治理、失败升级 |
| **Claude Code** | 一个把长程任务做成产品的工作流系统 | Goal/Task/Workflow/Subagent/Checkpoint | 目标契约、任务 DAG、验证闭环、恢复与调度 |
| **DSH** | 一个一切皆插件、缓存友好的 Agent 运行时 | 插件内核 + 会话日志 + 缓存契约 | 事件溯源、能力缝、请求分区、压缩投影 |

---

## 3. 核心结论：三者分别解决什么失效面

```text
Codex   → “敢不敢让它动手”      → 执行与权限平面
Claude  → “能不能把长活干完”    → 规划与执行控制平面
DSH     → “能不能便宜稳定地跑”  → 内核、上下文与插件平面
Hermes  → “能不能越干越强”      → 记忆与成长平面
```

这也是融合架构的分层依据：**权限是地基，规划是骨架，缓存是血液循环，记忆是成长。**

---

## 4. 融合映射表（摘要）

| 能力 | 主借鉴 | 融合做法 | 不要照搬 |
|---|---|---|---|
| 沙箱 | Codex | 统一 `PermissionProfile` + 多后端（Seatbelt / bubblewrap+seccomp / Windows RestrictedToken+ACL / MXC / 容器） | 不要把平台差异泄漏给模型 |
| 审批 | Codex | 六层阶梯（策略/规则/缓存/Hook/Guardian/人工）+ 规范化动作 + 规则固化 + 熔断 | 不要“每次操作都问” |
| 自动评审 | Codex Guardian | 风险/授权/历史检索/超时/熔断 + 多模态证据 | 不要让评审模型拥有最终执行权 |
| 电脑使用 | Codex + DSH | 驱动与治理解耦；按应用授权；动作日志；锁屏策略 | 不要把屏幕内容当指令 |
| 长程规划 | Claude | Goal 契约 + Plan + Task DAG + 独立验证 | 不要把计划写进系统提示 |
| 子代理/工作流 | Claude | 后台子代理 + 命名通信 + worktree 隔离 + 可恢复工作流 | 不要用子代理替代控制面 |
| 上下文 | DSH | Z0-Z3 四区 + 只追加 + 冻结请求 | 不要原地改 system prompt |
| 压缩 | DSH | shadowing + 回放 warm prefix | 不要删除原始事件 |
| 记忆 | Hermes/Memory Hub | 四层记忆 + 写入/巩固/检索/治理 + 评估门 | 不要把一切塞进向量库 |
| 成长 | Hermes | 轨迹→反思→技能候选→离线评估→canary | 不要让自我演化改安全策略 |
| 组合 | DSH | Cordis 式插件 + 能力缝 + 可撤销 effect | 不要把所有逻辑塞进循环 |

---

## 5. 报告结构

| 文件 | 内容 |
|---|---|
| [01-codex.md](01-codex.md) | Codex 源码深挖：沙箱、审批、Guardian、CUA、工具层、缓存 |
| [02-claude.md](02-claude.md) | Claude Code / Agent SDK：长程规划、任务、工作流、子代理、恢复、权限 |
| [03-dsh.md](03-dsh.md) | DSH 源码深挖：插件化、缓存、会话日志、沙箱、多代理 |
| [04-fusion-architecture.md](04-fusion-architecture.md) | 融合架构 Trident：数据模型、权限状态机、缓存布局、规划闭环、记忆接口、路线图 |
| [05-appendix.md](05-appendix.md) | 附录：Hermes Agent 自我成长 + 工业级 Memory Hub + 认知差清单 |
| [06-derivation-audit.md](06-derivation-audit.md) | 推导审计：核心断言与已暴露代码/功能描述的对应关系、修正记录、不可证清单 |
| [07-prd-roadmap-union-audit.md](07-prd-roadmap-union-audit.md) | PRD/Roadmap 集合审计：是否采取四家并集、24 类覆盖矩阵、排除/延后/新增清单 |
| [08-capability-selection.md](08-capability-selection.md) | 择优录取决策记录：每个能力选谁、为什么、适配层与重复风险处置 |
| [09-ranking-and-concept-merge.md](09-ranking-and-concept-merge.md) | 8 处高风险能力的优劣排名、合法复用/可维护选型、v1.0 缝合→v2.0 自有形状 |
| [10-memory-architecture-2026.md](10-memory-architecture-2026.md) | Memory 2026：三库 hub 是否过时、7 种工业架构、Weft Memory Fabric 推荐 |
| [11-memoryhub-vs-polyglot.md](11-memoryhub-vs-polyglot.md) | Polyglot vs Red Hat MemoryHub 对比、工业级边界、compose/容器数量 |
| [../appendix/polyglot-hub.md](../appendix/polyglot-hub.md) | 附录 A：未来 Polyglot 记忆 provider（v1.0 不启用） |

---

## 6. 证据口径与版本

| 对象 | 版本 / commit | 说明 |
|---|---|---|
| openai/codex | `67f0994b532b8740f14b5b738af7b7b2a915b1d6`（2026-10-31） | 完整浅克隆，Rust workspace |
| deepseek-ai/deepseek-harness | `ce7073d51254c26cd63b22a60835b8f948deb447`（2026-10-30） | 官方 GitHub 源码（MIT） |
| anthropics/claude-code | `80c6959d28c4c30ecd14fc1cdf172f19d9adad81`（2026-10-31） | **非核心引擎开源**；文档/插件/示例/CHANGELOG |
| @anthropic-ai/claude-code | `2.1.316` | npm 分发包；`sdk-tools.d.ts` 是工具契约的硬证据 |
| claude-agent-sdk-python | `2146f9d8985513053e904b13200c8f744b36785a`（v0.2.176） | 官方开源 SDK |
| claude-agent-sdk-typescript | `3a0b748adbb1d31fa66a24a15df7e7c973fe1368` | 官方开源 SDK |
| NousResearch/hermes-agent | `f4af5c3391424f92c1967a8b0acb362db1448bf9`（2026-10-31） | 自我成长附录 |
| hermes-agent-self-evolution | `0a929e3aa20e15cf04dc7c28492a7d41a5139125` | DSPy + GEPA 演化 |

**证据等级**：

- **A 级**：官方源码中的类型、函数、测试、注释，可直接 `path:line` 复核。
- **B 级**：官方文档、SDK 类型、npm 分发物 schema。
- **C 级**：官方博客/论文/公开访谈。
- **D 级**：基于行为的逆向或推断，文中会显式标注。

---

## 7. 关键判断：你当前的认知可能落后在哪

> 详见 [05-appendix.md](05-appendix.md)。这里先给结论。

1. **“沙箱 = 一个开关”已经落后。** 2026 年的工业实践是“权限 profile + 多后端 + 策略引擎 + 自动评审 + 审计”的组合。
2. **“审批 = 弹窗”已经落后。** 审批是一条决策流水线，包含缓存、规则、风险评分、历史授权检索、熔断。
3. **“上下文 = 塞得越多越好”已经落后。** 缓存友好、可压缩、可投影、可回放，比单纯长上下文更重要。
4. **“记忆 = 向量库”已经落后。** 工业级 memory hub 是写入/巩固/检索/治理/评测的完整数据系统。
5. **“自我成长 = 自动改 prompt”已经落后。** 必须有 held-out 评估、canary、回滚，且安全策略不可演化。
6. **“多代理 = 多开几个模型”已经落后。** 需要任务 DAG、写作用域、缓存前缀规划、结果汇总与冲突消解。
7. **“Codex 内建了电脑使用”是误读。** Codex 开源仓库没有点击/截图原语；CUA 是 MCP 连接器 + Guardian 治理 + 按应用授权。它的优势是“让 CUA 可控”，不是“自己会点”。
8. **“缓存命中靠加一个缓存层”已经落后。** 真正有效的是“日志只追加 + 请求是纯函数投影”，前缀稳定是推论；DSH 没有专门的 prompt-cache 管理器，只有派生投影缓存。
9. **“Todo 清单是执行力核心”已经落后。** Claude 2.1.233 起在新模型上默认退役 todo/task 工具；清单是给人和宿主的进度投影，执行力的大头在状态机、验证与恢复。

---

## 8. 最终建议

如果你要马上开始做，建议按这个顺序：

1. **先做 M0**：会话日志 + 请求分区 + 策略引擎 + 一个 Windows 沙箱后端 + 审批缓存。没有这些，后面都是空中楼阁。
2. **再做 M1**：Guardian 自动评审 + CUA 治理 + 审批规则固化。这是“体验质变”的一层。
3. **然后 M2**：Goal/Task DAG + 验证闭环 + Checkpoint/Rewind。这是“长程可用”的一层。
4. **最后 M3**：Memory Hub + 技能演化 + 评估门。这是“越干越强”的一层。

**不要反过来**：先做记忆/成长，再做权限/恢复，会把系统变成“会学习的定时炸弹”。
