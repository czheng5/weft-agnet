# Weft PRD v1.0

> 状态：**FROZEN for v1.0**（2026-11-01）。本 PRD 固定 v1.0 范围；新增/变更需求必须写 ADR，并提升 PRD 版本。  
> 产品名：Weft（纬）；架构代号：Trident。  
> 关联：Roadmap 见 [ROADMAP.md](ROADMAP.md)；8 概念取舍见 [report/09-ranking-and-concept-merge.md](report/09-ranking-and-concept-merge.md)；Memory 研究见 [report/10-memory-architecture-2026.md](report/10-memory-architecture-2026.md)、[report/11-memoryhub-vs-polyglot.md](report/11-memoryhub-vs-polyglot.md)；未来 Polyglot 见 [appendix/polyglot-hub.md](appendix/polyglot-hub.md)；接口见 [docs/interfaces.md](docs/interfaces.md)。

---

## 0. 一句话定位

**Weft 是一个策略治理、缓存优先、长程可验证、记忆可成长的 Agent Harness。**  
它不是模型，不是通用 RAG，也不是四家实现的拼盘；它用 8 个概念把 Codex 的执行、Claude 的规划、DSH 的内核、Hermes 的记忆收束成一套可替换的运行时。

---

## 1. 目标与非目标

### 1.1 v1.0 目标

1. 一个真实长任务能跑完：计划 → 执行 → 验证 → 恢复。
2. 权限默认不打断：沙箱优先、审批分层、失败才升级。
3. 缓存前缀稳定：同一会话的重复请求命中可观测。
4. 记忆可写、可查、可删：PG 唯一权威，跨会话可用。
5. 外接知识库只读可用：有引用、有作用域、有注入防护。
6. 一切可回放：模型可见的内容能从事件日志重建。

### 1.2 非目标（v1.0）

- 不做模型训练/微调。
- 不做通用 RAG 平台；KB 只做只读 provider。
- 不做多租户 SaaS（v1.0 单租户/单用户；预留 scope）。
- 不做 MemoryHub 专用 UI（TUI/CLI 足够）。
- 不做 Polyglot 默认栈（附录 A，v2.0 评估）。
- 不做 CUA 驱动自研（v1.0 只做治理与策略，驱动可接 MCP/native）。
- 不做语音/消息网关/云会话/插件市场。

---

## 2. 设计原则（v1.0 冻结）

1. **一个概念一个实现**：同一能力不允许两套语义并存；第二实现必须走 provider + 契约测试。
2. **一个权威 + 派生索引**：Memory 以 PG 为权威；向量/缓存/图都是可重建派生。
3. **不要三路双写**：写权威 + outbox；派生异步。
4. **缓存优先**：Z0 稳定、Z1 追加、Z2 快照、Z3 指令；不原地改 system prompt。
5. **权限分层**：静态策略 → 规则 → 会话缓存 → Hook → Guardian → 人工 → 沙箱兜底。
6. **记忆不是知识**：Memory 存学到的偏好/决策/经验；KB 存文档/语料；默认不互相写入。
7. **证据先于声明**：任务完成必须有测试/diff/验证器证据；执行者不给自己打分。
8. **v1 缝合、v1.5 收口、v2 自有**：v1.0 允许一个 borrowed 实现，但概念必须是 Weft 的。

---

## 3. 八个概念

| 概念 | 职责 | v1.0 实现来源 | owner |
|---|---|---|---|
| **Work Graph** | Goal、Plan、Task、Checkpoint、Evidence 的统一节点/边 | Claude 语义 + DSH 持久化 | core/work-graph |
| **Actor Runtime** | 一个 AgentHandle、角色、邮箱、作用域、父子关系 | Claude 交互 + DSH fork | core/actors |
| **Scheduler** | cron/wakeup/monitor 统一 trigger 与队列 | Claude 语义 + DSH host | core/scheduler |
| **Event Bus** | 生命周期/权限/工具/遥测统一 typed event | DSH bus + Claude taxonomy | core/events |
| **Capability Package** | manifest + instructions + tools + eval 的统一制品 | Claude 格式 + Hermes 生命周期 | core/capabilities |
| **Memory Fabric** | 记忆写入/巩固/检索/治理；hot/cold 分层 | Red Hat 型 MemoryHub | memory/fabric |
| **Context Projection** | 压缩/裁剪/重放都是投影，不是删除 | DSH shadow + Codex retention | core/context |
| **Surface Renderer** | 一套事件 → TUI/Web/Desktop/CLI | DSH runtime + Weft TUI | surface/* |

---

## 4. 功能需求（F-IDs）

状态：IN = v1.0；P1 = v1.5；P2 = v2.0；APPENDIX = 备选；OUT = 不做。  
优先级：P0 必须；P1 应该；P2 可以。

| ID | 功能 | 优先级 | 状态 | 里程碑 | 验收 |
|---|---|---|---|---|---|
| F-WG-001 | Goal 契约（可独立验证的完成条件） | P0 | IN | M2 | 目标可被 evaluator 判定 |
| F-WG-002 | Plan 工件（落盘、可审阅、压缩后重注入） | P0 | IN | M2 | 计划文件存在且可恢复 |
| F-WG-003 | Work Graph schema（节点/边/证据） | P0 | IN | M2 | 任务/计划/检查点同图 |
| F-WG-004 | Task DAG + Todo 投影 | P0 | IN | M2 | 依赖/ owner/验收可查 |
| F-AR-001 | Actor Runtime（后台/命名/隔离） | P0 | IN | M2 | 子代理可启动/停止/收结果 |
| F-AR-002 | Team 邮箱/任务板 | P1 | P1 | M4 | 多 actor 可协作 |
| F-SC-001 | Scheduler（cron/wakeup/monitor） | P0 | IN | M2 | 定时/唤醒可恢复 |
| F-EB-001 | Event Bus + Hooks | P0 | IN | M2 | 事件可订阅/可回放 |
| F-CP-001 | Capability Package registry | P0 | IN | M2 | 技能可安装/加载/卸载 |
| F-CP-002 | 技能演化 + held-out/canary | P1 | P1 | M4 | 演化可回滚 |
| F-MF-001 | MemoryHub 核心（PG+pgvector+图） | P0 | IN | M1/M3 | 写/查/删可用 |
| F-MF-002 | 记忆写入/巩固/冲突消解 | P0 | IN | M1/M3 | 冲突可解释 |
| F-MF-003 | 记忆检索/注入（混合召回） | P0 | IN | M1/M3 | 作用域内召回 |
| F-MF-004 | 记忆治理（scope/RBAC/审计/删除） | P0 | IN | M3 | 删除可传播 |
| F-MF-005 | MemoryProvider 接口 + 契约测试 | P0 | IN | M0 | 默认 provider 过测试 |
| F-MF-006 | Polyglot MemoryProvider | P2 | APPENDIX | M4 | 同契约测试；默认 disabled |
| F-CX-001 | 请求四区（Z0-Z3） | P0 | IN | M0 | 前缀稳定测试 |
| F-CX-002 | 压缩/投影（shadow + retention） | P0 | IN | M2 | 压缩后可恢复 |
| F-CX-003 | 缓存命中观测 | P0 | IN | M1 | cacheReadTokens 可见 |
| F-SR-001 | Weft TUI/CLI | P0 | IN | M0 | 启动/审批/状态可用 |
| F-SR-002 | Web/Desktop surface | P1 | P1 | M4 | 可连接同一 core |
| F-SR-003 | Memory dashboard | P2 | OUT | — | v1.0 不做 |
| F-PS-001 | 沙箱/权限 profile | P0 | IN | M0 | Windows 至少一个后端 |
| F-PS-002 | 审批阶梯 + 会话缓存 | P0 | IN | M0 | 同类动作只问一次 |
| F-PS-003 | Guardian 自动评审（shadow） | P0 | IN | M1 | 影子模式可对比 |
| F-PS-004 | CUA 治理（app allowlist/锁屏/日志） | P0 | IN | M1 | 敏感应用拦截 |
| F-PS-005 | CUA driver（MCP/native，可插拔） | P1 | P1 | M4 | 驱动可替换 |
| F-KB-001 | KnowledgeBaseProvider 接口 | P0 | IN | M0 | 只读/引用/作用域 |
| F-KB-002 | local/web/MCP KB 适配器 | P0 | IN | M1 | 三个适配器可切换 |
| F-OB-001 | 指标/评测（cache/打断/延迟） | P0 | IN | M1 | 仪表可见 |
| F-GOV-001 | 多租户/审计/配额 | P1 | P1 | M4 | 租户隔离测试 |

---

## 5. 执行与权限

- 六层决策 + 沙箱兜底；默认沙箱内执行，失败才升级；升级保留 denied-read。
- v1.0：Codex 型沙箱 + 审批缓存 + Hook + Guardian shadow；CUA 只做治理策略，不自研驱动。
- 不允许静默回退到弱沙箱；能力不足直接拒绝。
- 审批结果必须可审计；拒绝要有结构化原因与替代方案。
- 高风险动作（写/删/部署/发送/购买/改权限）必须经过 Guardian 或人工。

---

## 6. Memory Fabric

### 6.1 v1.0 默认：Red Hat 型

| 组件 | 作用 | 备注 |
|---|---|---|
| PostgreSQL + pgvector + graph | 唯一权威：记录/元数据/向量/图/审计 | 不另设独立向量库 |
| Valkey | 队列、热数据、push | 不是权威 |
| MinIO/S3 | raw traces、附件、大内容 | PG 存指针 |
| Embedding（TEI） | 向量化 | 可替换 |
| Reranker（可选） | 重排 | 可退化到 cosine |
| MCP/API | 主进程，所有 surface 入口 | 不在 UI 里 |
| Auth | OAuth 2.1 / RBAC / scope | 本地可先用 API key |

**容器口径**：

- 核心 **6 个**：PG、Valkey、MinIO、Embedding、MCP、Auth。
- 加 reranker 或 async worker = **7 个**。
- 加 MemoryHub UI（BFF + oauth-proxy）= **8–9 个**；v1.0 **不做 UI**。
- 加 curation agents（trace reviewer/fact checker）= **+2**。
- 加图索引（Graphiti/Neo4j）= **+1**（v1.0 不需要；PG 图关系够用）。

### 6.2 硬约束

1. PG 是唯一写入口；Vector/Redis 不得反向写。
2. 写 PG 事务 + outbox；派生异步；不三路双写。
3. memory_id + version 幂等；删除 tombstone + 传播。
4. 所有 store 带 tenant/scope/version/status；检索后 PG 校验。
5. hot path 不调 LLM；抽取/巩固异步。
6. 记忆不是知识：KB 命中不自动入 Memory。

### 6.3 未来 Polyglot

- 见 [appendix/polyglot-hub.md](appendix/polyglot-hub.md)。
- 作为 MemoryProvider 第二实现；必须通过同一契约测试；v2.0 用真实规模指标评估。
- 不进入 v1.0 默认组合。

---

## 7. 外部知识库接口

- 只读 KnowledgeBaseProvider；与 Memory 分离。
- 每个 hit 带 source/citation；KB 内容是 untrusted data，不是指令。
- 超时/失败返回空 + degraded；不阻塞主任务。
- v1.0 适配器：local-docs、web、mcp-kb、http-kb。
- KB 命中默认不写 Memory；用户确认后才写，并保留 citation。
- 接口定义见 [docs/interfaces.md](docs/interfaces.md)。

---

## 8. 上下文与缓存

- Z0 稳定 system+tools；Z1 追加历史；Z2 运行时快照；Z3 指令/摘要。
- 不原地改 system prompt；工具 schema 变更走版本/series。
- 压缩是 shadow 投影；回放 warm prefix；保留 prefix/context 结构。
- 指标：cacheReadTokens、首 miss 归因、每任务 token。

---

## 9. 非功能需求

| 类别 | 目标 | 验证 |
|---|---|---|
| 缓存 | 第一次之后 cacheReadTokens > 0；无回归 | e2e/录制回放 |
| 权限 | 无静默放行；升级保留 deny-read | 逃逸/拒绝用例 |
| 记忆 | hot 查询 P95 < 10ms；warm < 100ms；删除传播 < 60s | 压测/审计 |
| 隔离 | 跨 tenant/user/project 零泄漏 | 越权测试 |
| 可用 | PG PITR；Redis 可重建；对象存储版本化 | 故障演练 |
| 成本 | hot path 0 次记忆 LLM；每任务 token 可测 | 指标 |
| 可观测 | 审批/缓存/记忆/任务指标 | 仪表 |
| 安全 | KB/记忆注入样本拦截；secret 不入 prompt | 红队 |

---

## 10. Out of scope（v1.0）

- Polyglot 默认栈（附录 A）。
- MemoryHub 专用 UI（dashboard）。
- 多租户 SaaS、计费、配额。
- 通用 RAG/ingest 平台；只读 KB。
- 自研 CUA 驱动；只做治理。
- 语音、消息网关、云会话、插件市场、模型训练。
- 同一能力第二套实现（除非走 provider + 契约测试）。

---

## 11. 发布验收（v1.0 gate）

1. 一个真实 Windows 任务：读文件 → 改文件 → 跑测试 → 验证 → 记录证据。
2. 进程重启后从日志恢复；未完成工具调用标记 unknown。
3. 审批：同类动作只问一次；拒绝可解释；升级保留 deny-read。
4. 缓存：第一次之后 cacheReadTokens > 0；首 miss 可归因。
5. Memory：跨会话记住偏好；删除传播；跨 scope 零泄漏。
6. KB：只读检索带 citation；注入样本不执行；超时降级。
7. TUI：启动/审批/状态/记忆查看可用。
8. 文档：PRD/ROADMAP/接口/附录一致；无未决 P0。

---

## 12. 风险与开放问题

| 风险 | 影响 | 缓解 |
|---|---|---|
| PG 向量/图容量 | 记忆规模上限 | 容量模型；v2 评估 Polyglot 派生 |
| Guardian 误判 | 放行危险/拦截正常 | shadow 对比；人工复核；熔断 |
| KB 注入 | 模型执行不可信指令 | untrusted 标记；不执行；引用 |
| 审批疲劳 | 用户习惯性允许 | 分层/缓存/规则固化/撤销 |
| 适配层变第二实现 | 语义分裂 | provider 契约测试；SRC 标记 |
| 范围蔓延 | v1.0 延期 | PRD frozen；变更走 ADR |

开放问题：

- CUA 驱动 v1.5 用 MCP 还是 native？默认 MCP，native 作为 provider；v1.0 只做治理。
- MemoryHub 的 embedding 用 CPU TEI 还是外部 API？默认 CPU TEI，可配置。
- KB 是否需要写回/ingest？v1.0 不做，v2 评估。
- 多租户何时开启？v1.5 预留，v2 正式。

---

## 13. 变更控制

- 本 PRD 为 v1.0 冻结版；任何新增 P0 必须写 ADR，说明为什么不能延后。
- 新能力先映射到 8 概念；已有 winner 就扩展，不新增第二实现。
- 第二实现必须有 provider 接口、契约测试、回滚方案，默认 disabled。
- 每个 feature 必须带 SRC 标记（Codex/Claude/DSH/Hermes/Hub/NEW），CI 检查同能力双 SRC。
