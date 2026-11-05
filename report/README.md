# Weft（七襄）研究报告索引：Codex × Claude × DSH 融合 + Hermes / Memory Hub 附录

## 四句话结论

1. **Codex 的护城河是“可执行的权限系统”**：六层决策（静态策略 → execpolicy → 会话缓存 → Hook → Guardian → 人工）+ 沙箱兜底；默认在沙箱内执行，失败才升级，升级保留 denied-read。
2. **Claude 的强项是“把长程任务产品化”**：Goal 契约、Plan 文件、Task DAG、Workflow（节点级缓存）、Subagent、Checkpoint/Rewind；但核心引擎闭源，且新模型已默认退役 Todo/Task 清单——清单是进度投影，不是执行力核心。
3. **DSH 的强项是“缓存友好的事件内核 + 一切皆插件”**：没有专门的 prompt-cache 管理器；命中是“日志只追加 + 投影是纯函数”的推论，稳定前缀只是 corollary #1。
4. **融合架构 Trident**：Codex 之手（权限/沙箱/CUA 治理）+ Claude 之脑（可验证的长程规划）+ DSH 之脊（事件日志/插件/缓存）+ Hermes / Memory Hub 之记忆（带评估门的成长）。

## 阅读路径

| 时间 | 读什么 |
|---|---|
| 15 分钟 | [00-overview.md](00-overview.md) 的 TL;DR + 融合映射表 |
| 45 分钟 | [04-fusion-architecture.md](04-fusion-architecture.md)（重点 §4 权限、§5 缓存、§6 长程、§12 路线图） |
| 2 小时 | 按兴趣读 [01-codex.md](01-codex.md)、[02-claude.md](02-claude.md)、[03-dsh.md](03-dsh.md) |
| 深读 | [05-appendix.md](05-appendix.md)：Hermes 自我成长 + 六家 Memory Hub + 2026 认知差清单 |
| 核对推导 | [06-derivation-audit.md](06-derivation-audit.md)：40 条断言 → 证据级别/判定、修正记录、不可证清单 |
| 核对边界 | [07-prd-roadmap-union-audit.md](07-prd-roadmap-union-audit.md)：四家并集？24 类覆盖、O/D/N 清单、PRD/roadmap 缺口 |
| 定实现 | [08-capability-selection.md](08-capability-selection.md)：同一能力只做一次；25 个 winner、8 个重复风险、薄适配层 |
| 排优劣 | [09-ranking-and-concept-merge.md](09-ranking-and-concept-merge.md)：8 处高风险能力排名、合法复用/可维护选型、v1.0→v2.0 概念合并 |
| 更新记忆认知 | [10-memory-architecture-2026.md](10-memory-architecture-2026.md)：三库 hub 是否过时、7 种工业架构、Weft Memory Fabric 推荐 |
| 对比记忆部署 | [11-memoryhub-vs-polyglot.md](11-memoryhub-vs-polyglot.md)：Polyglot vs Red Hat、工业级边界、compose/容器清单 |
| 未来记忆备选 | [附录 A · Polyglot Hub](../appendix/polyglot-hub.md)：PG 权威 + Vector 索引 + Redis 缓存、outbox/删除传播；v1.0 不启用 |

## 产品与开发文档（根目录）

- [PRD.md](../PRD.md) — **Weft PRD v1.0（FROZEN）**：8 概念、F-ID、MemoryHub 默认、KB 接口、验收
- [ROADMAP.md](../ROADMAP.md) — **Weft Roadmap v1.0（FROZEN）**：M0–M5、exit criteria、依赖、回滚
- [docs/interfaces.md](../docs/interfaces.md) — MemoryProvider / KnowledgeBaseProvider 契约
- [appendix/polyglot-hub.md](../appendix/polyglot-hub.md) — 附录 A：未来 Polyglot 记忆 provider
- [PROJECT_LOG.md](../PROJECT_LOG.md) — 项目管理台账：模块/问题/效果、时间线、缺口、下一步

## 研究文件

- [00-overview.md](00-overview.md) — 12 条核心发现、三个 Harness 画像、融合映射表、证据口径
- [01-codex.md](01-codex.md) — 沙箱五后端、审批六层阶梯、Guardian、CUA 治理、工具层、缓存、11 条可迁移要点、E0–E119 证据表
- [02-claude.md](02-claude.md) — 开源边界、13 个机制、长程执行力六因、10 条可迁移要点、E1–E33 证据表
- [03-dsh.md](03-dsh.md) — 插件化、缓存装配链路与七条不变量、权限/沙箱、Team、SDK、61 条行号证据
- [04-fusion-architecture.md](04-fusion-architecture.md) — Trident 参考架构：数据模型、权限状态机、CUA、缓存布局、规划闭环、记忆接口、路线图
- [05-appendix.md](05-appendix.md) — Hermes 自我成长闭环、六家 Memory Hub 拆解、10 条认知落后清单、S1–S30 来源
- [06-derivation-audit.md](06-derivation-audit.md) — 推导审计：40 条核心断言 → 源码/文档对应、5 处修正、8 条不可证结论、复现命令
- [07-prd-roadmap-union-audit.md](07-prd-roadmap-union-audit.md) — PRD/Roadmap 集合审计：24 类覆盖、14 项不做、13 项延后、8 项融合新增
- [08-capability-selection.md](08-capability-selection.md) — 择优录取决策表：25 个能力 winner/runner-up/rejected、8 个重复风险、薄适配层
- [09-ranking-and-concept-merge.md](09-ranking-and-concept-merge.md) — 8 处高风险能力的优劣排名、合法复用/可维护选型、v1.0→v2.0 概念合并
- [10-memory-architecture-2026.md](10-memory-architecture-2026.md) — Memory 架构 2026：Hub+Redis+PG+Vector 是否过时、7 种架构对比、Weft Memory Fabric 推荐
- [11-memoryhub-vs-polyglot.md](11-memoryhub-vs-polyglot.md) — Polyglot Hub vs Red Hat MemoryHub：差异、工业级边界、container 数量清单
- [../appendix/polyglot-hub.md](../appendix/polyglot-hub.md) — 附录 A：未来 Polyglot 记忆 provider（v1.0 不启用，作为模块化替换备选）
- [../brand/README.md](../brand/README.md) — 品牌 **Weft（七襄）**：命名、Weft Cyan 色板、Claude 式 TUI 模板、ANSI 渲染器与预览图

## 证据与复现

- 三个官方仓库浅克隆在 `repos/`（不随报告提交）：`codex` @ `67f0994`、`dsh` @ `ce7073d5`、`claude-code` @ `80c6959`。
- Claude 的 npm 分发包与 SDK 类型在 `report/evidence/claude/`，含 SHA-256 与复现命令。
- 证据分级：A=官方源码；B=官方文档/SDK/分发物；C=官方博客/论文；D=逆向/推断（文中标注）。
- **明确边界**：Claude Code 核心引擎未开源；Codex 的 CUA 驱动不在 repo 内；本地 DSH 版本可能与 GitHub master 不同；所有结论未做端到端真机复现。

## 研究局限

- 没有对三个 harness 做同任务、同模型的 A/B 实测；性能与成本结论来自源码机制与官方数字，不是本机 benchmark。
- Codex 的 Windows 沙箱、Guardian 评审质量、CUA 驱动行为未在真机验证。
- Hermes 的 GEPA 流水线存在“技能文本可能未被真正优化”的实现疑点（附录已标推断），未端到端跑通。
- Memory Hub 厂商分数多为自报，未独立复现；选型矩阵是 2026-10 时点的快照。
