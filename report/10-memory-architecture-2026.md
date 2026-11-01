# 10 · Memory 架构 2026：从“Hub + Redis + PG + Vector”到“Memory Fabric”

> 你描述的架构：上层 hub，下层分别调用 Redis、PostgreSQL、向量数据库，追求高可用、有细节、快速反应。
>
> 结论：这个形状没有过时，但分层方式正在被重写。2024–2025 的主流是“hub 编排三个对等存储”；2026 更被认可的是“一个逻辑记忆模型 + 一个系统 of record + 多个派生读模型 + 一个治理/控制面”。Redis 仍然重要，但更多是热缓存/队列/语义缓存，不是记忆权威；PostgreSQL + pgvector（+ 图）正在吞掉很多独立向量库/图库的位置；hub 从“第四个数据库”变成“控制面”。
>
> 一句话：不是不要 Redis/PG/Vector，而是不要让三个存储都当真相，不要让 hub 自己再存一份。

---

## 1. 你描述的模式：为什么流行，哪里开始不够

典型部署：

~~~text
Agent / Harness
   ↓
Memory Hub（编排、路由、召回、写入）
   ├── Redis         → 会话态、热数据、TTL、队列、语义缓存
   ├── PostgreSQL    → 用户/租户、元数据、审计、关系
   └── Vector DB     → 语义索引、ANN 检索
~~~

它流行的原因很实在：Redis 快，PG 稳，向量库专，Hub 统一 API。

它开始不够，通常不是性能，而是一致性与语义：

| 问题 | 表现 |
|---|---|
| 三个真相 | Redis 有会话、PG 有元数据、Vector 有 embedding；谁是最新？谁被删了？ |
| 双写 | Hub 写 PG 成功、写 Vector 失败；或 Redis TTL 到期但 PG 还有 |
| 删除不传播 | 用户删除一条记忆，向量库/图/缓存各留一份 |
| 语义漂移 | 同一个 fact 在 PG、Vector、Redis 里字段/版本不同 |
| 运维税 | 三套备份、三套监控、三套扩容、三套故障演练 |
| 热路径 LLM | 写入时同步抽取/改写，延迟飙高，失败拖死回合 |

所以 2026 的修正不是“再加一个存储”，而是把“谁是权威”与“谁是索引”分开。

---

## 2. 2026 年工业界的 7 种架构

| # | 架构 | 核心主张 | 成熟度 | 采用度 | 适合谁 |
|---|---|---|---|---|---|
| A | Postgres-centric Memory Hub | PG + pgvector + 图关系一个库；Redis/Valkey 只做队列/热缓存；对象存储放大内容 | 高 | 高 | 大多数团队；Weft 首选 |
| B | Polyglot Hub（你描述的三库） | Hub 编排 Redis + PG + Vector | 高 | 仍常见 | 已有三套基础设施、规模大、团队能运维 |
| C | Temporal Graph / Context Layer | 事实带生效/失效区间；图 + 全文 + 向量融合 | 中高 | 增长中 | 需要“当时是什么”、合规、企业上下文 |
| D | Unified Context DB / Memory OS | 关系+图+向量在一个事务/一个引擎里；统一生命周期 | 中 | 早期 | 想要“一个记忆操作系统”的团队 |
| E | Managed Agent Memory | AWS/Azure/GCP 托管短/长期记忆；抽取、巩固、检索全包 | 高 | 云原生增长最快 | 不想自建、能接受厂商绑定 |
| F | Memory Engine + Specialized Model | 专用记忆模型 + 双系统认知管线 + 本地 hub | 早期 | 新 | 追求“记忆质量”而非“存储” |
| G | Memory as Harness Responsibility | 记忆不是插件，是 harness 的上下文/状态管理 | 中 | 思想被广泛接受 | Agent 框架/产品 |

采用度是工程判断，不是市场报告。ContextDB 是 2026-04 预印本，Hy-Memory 是 2026-10 才开源，二者还不能称为“广泛认可”，但代表方向。

---

## 3. 关键证据

### 3.1 Red Hat MemoryHub：PG + pgvector + 图，一个库

- MCP server 是所有 Agent 的入口；MCP、Python SDK、CLI、Dashboard、harness hooks 都是薄表面。
- PostgreSQL + pgvector + graph 在一个数据库里处理关系、向量、图关系；原文：no separate vector store, no separate graph database。
- Valkey 只做 job queues + push，不是记忆权威。
- MinIO/S3 存大于 100KB 的大内容，PG 存前缀，读时 hydrate。
- OAuth 2.1 + RBAC + scope（user/project/campaign/role/org/enterprise）；所有操作过 MCP/service layer，表面不能直连 PG。
- Fact Checker CronJob + Trace Reviewer 做后台治理；embedding/reranker 独立服务，reranker 挂了退化到 cosine。
- 明确边界：MemoryHub 是 memory，不是 retrieval；文档语料归 RAG。

这直接回答“要不要三个库”：对大多数团队，PG+pgvector+图一个库就够；Redis/Valkey 做队列/热缓存；对象存储放大内容。

### 3.2 ContextDB：把“三库拼接”视为反模式

ContextDB 预印本（Zenodo，2026-04-19）开篇就把 Vector DB + Redis + PostgreSQL + glue code 称为 fragile patchwork，主张用 unified context layer / memory operating system 替代。主张包括统一 token/parametric/latent 三种记忆形态、factual/experiential/working 三种功能、formation/evolution/retrieval 三个过程、多图表示、RL-trained Memory Manager、隐私/保留/审计内建。

GitHub 上的 atomsai/contextdb 走单机/嵌入式路线（SQLite + NumPy，可选 FAISS/Postgres），强调 trust model（wish vs fact、epistemic provenance、contradiction、PII、temporal supersede）。context-graph-ai/contextdb 走嵌入式数据库路线：关系 + 图 + 向量在一个 MVCC 事务里，Apache-2.0。

评价：这是方向性证据，不是“已被广泛采用”的结论。预印本未经同行评审，benchmark 自报；但“三库 glue 是反模式”这个判断，和 Red Hat 的工程选择一致。

### 3.3 Hy-Memory / MemHub：专用记忆模型 + 双系统 + 本地 hub

腾讯混元 2026-10 开源的 Hy Memory 2.0：

- 不是“一个库”，而是“一个记忆引擎 + 可插拔存储”：默认 ChromaDB + Kuzu，可选 Qdrant/FAISS/Neo4j/MySQL cache。
- 专用记忆模型 Hy-Memory-30B-A3B，用 attributed RL 训练读写记忆/冲突消解；另有 8 层 Chat 记忆、Working 双层事实/经验、Coding 版本演化 diff-chain。
- MemHub 是本地优先 hub：把 Claude Code、Cursor、Codex、OpenCode、Qwen Code 的授权会话/编码轨迹汇成一份本地记忆，再授权给其它工具召回。
- 架构原则：所有 memory 读写交给 SDK；MemHub 只做管理面（授权、模型、队列、Runtime 状态），不另存一份 memory 正文；只存 memory_id 作为外键。

评价：它证明 hub 仍然成立，但 hub 的职责是管理/治理/队列，不是“第四个记忆库”。专用模型是前沿，不是当前共识。

### 3.4 Zep / Graphiti：时间性才是图记忆的杀手锏

Zep v4 定位为 unified context layer for enterprise data，用 temporal Context Graphs 组织业务数据、文档、对话；Context Lake 在 Konig 图数据库上管理百万级图。Graphiti 是开源 temporal knowledge graph 框架。

关键不是“图比向量好”，而是事实有 valid_from/valid_until/superseded_by；新信息让旧边失效而不是删除；能回答“当时是什么”；治理（RBAC/ABAC/审计/溯源）是一等公民。

评价：适合时间性/合规/企业上下文；不适合把 hot path 全塞进图，每轮抽取会破坏缓存与延迟。

### 3.5 AWS / Azure / GCP：托管记忆成为默认选项

- AWS Bedrock AgentCore Memory：完全托管的 short-term + long-term memory；自动抽取用户偏好、事实、会话摘要；支持策略与 namespace；不需要自建向量库/管道。
- Azure Foundry Agent Service Memory（preview）：memory store、scope、TTL、remember/forget、memory item CRUD；RBAC；托管长期记忆。
- GCP Vertex AI Memory Bank：托管长期记忆；Gemini 做抽取/巩固/冲突消解；按 user scope 检索；ADK/LangGraph/CrewAI 集成。

评价：买而不是建的路线，采用速度最快，但厂商绑定、数据驻留、可迁移性要提前设计。对 Weft，建议做 MemoryHub provider 接口，把托管服务当 provider，而不是把核心数据模型交出去。

### 3.6 Redis Iris：Redis 自己也在从缓存变“上下文引擎”

Redis Iris（preview）定位为 context engine：Agent Memory、Context Retriever、LangCache（语义缓存）、Data Integration。它把记忆、语义缓存、治理数据访问、实时同步打包成托管/自管理服务。

评价：Redis 不会消失，但角色变了：热缓存 + 语义缓存 + 队列 + 实时数据同步。它仍然不是系统 of record 的首选。

### 3.7 Mem0 / Letta / Hermes：三个方向性信号

- Mem0 2026 新算法：抽取改为 single-pass ADD-only，不再 UPDATE/DELETE；检索改为 multi-signal hybrid（semantic + BM25 + entity）；图记忆移到 platform-only。方向是低成本写、聪明地读。
- Letta：明确说 memory isn't a plugin；记忆是 harness 的上下文/状态管理；用文件系统 + grep + 迭代检索也能很强。方向是检索行为比存储引擎更重要。
- Hermes pgvector provider：Postgres + pgvector 做多 agent 共享记忆；no LLM in the memory hot path；per-agent theme、identity governance、async writer。方向是单库 + 作用域 + 异步。

---

## 4. 2026 年更被认可的 8 条原则

1. 一个逻辑模型，不是三个 schema：MemoryRecord 统一 id、scope、provenance、confidence、validity、sensitivity。
2. 一个系统 of record：Postgres（或事件日志）是权威；Redis/Vector/Graph 是派生读模型。
3. 不要双写：用 outbox/CDC/队列，从权威源派生索引；写失败可重放。
4. 热路径不放 LLM：抽取/巩固/冲突消解异步；hot path 只做 embedding/检索/缓存。
5. Redis 做热与队列，不做权威：会话态、语义缓存、锁、队列、pub/sub；TTL 数据可丢。
6. 向量只是检索信号之一：semantic + BM25/tsvector + graph/entity + rerank；单信号 top-k 已落后。
7. 时间性与信任是一等字段：valid_from/valid_until、superseded_by、user_stated/agent_inferred/third_party、confidence。
8. 治理是产品功能：tenant/dataset 隔离、RBAC/ABAC、审计、删除传播、保留策略、PII；不是以后再说。

---

## 5. 给 Weft 的 Memory Fabric 推荐架构

### 5.1 逻辑模型

~~~text
MemoryRecord
  id, tenant, user, project, session
  layer: working | episodic | semantic | procedural
  kind: fact | preference | decision | experience | skill
  content, structured, embedding?
  source: event_ids[], tool, document
  provenance: user_stated | agent_inferred | third_party
  confidence: 0..1
  validity: valid_from, valid_until, superseded_by
  sensitivity: public | internal | private | secret
  status: active | contested | deleted
~~~

所有 store 都存同一个逻辑记录的不同投影；不允许 Redis/PG/Vector 各自定义“记忆”。

### 5.2 物理拓扑（v1.0 推荐）

~~~mermaid
flowchart TB
  H[Agents / Harness / Weft TUI] --> API[Memory Hub API: MCP + HTTP]
  API --> AUTH[OAuth 2.1 / RBAC / scope]
  API --> HOT[Redis / Valkey: working set, queue, semantic cache]
  API --> CORE[(PostgreSQL: records + metadata + pgvector + graph)]
  CORE --> OBJ[(S3 / MinIO: raw traces, artifacts, snapshots)]
  HOT --> W[Async workers: extraction, consolidation, fact check, deletion]
  W --> CORE
  CORE --> IDX[Derived indexes: pgvector / optional vector DB]
~~~

- 系统 of record：PostgreSQL。记录、元数据、审计、作用域、向量、图关系都在这里；pgvector 先够用。
- 热层：Redis/Valkey。working set、队列、语义缓存、分布式锁、pub/sub；不是权威。
- 冷层：S3/MinIO。raw trajectory、附件、快照、大内容；PG 存指针。
- 异步层：worker + outbox/queue。抽取、巩固、冲突消解、fact check、删除传播；不在 hot path 调 LLM。
- API 层：MCP + HTTP SDK。所有 surface 过同一 service layer；不直连 DB。
- 可选：当向量规模/延迟真的超 PG 能力，再加 Qdrant/Milvus；当图查询真的超 PG 递归 CTE，再加 Neo4j/Graphiti。先证明需要，再加库。

### 5.3 写入路径

~~~text
turn/end or memory API
  → validate scope/provenance
  → append raw event / record (PG, transaction)
  → outbox job (PG or queue)
  → async worker: extract / consolidate / conflict resolve
  → update record + embedding + graph edges (same PG transaction where possible)
  → invalidate hot cache
~~~

关键：先写权威，再派生索引；不要 Redis/PG/Vector 三路同时写。

### 5.4 读取路径

~~~text
query
  → auth/scope filter
  → hot cache (semantic cache / working set)
  → hybrid recall: pgvector + tsvector/BM25 + graph/entity
  → rerank (optional)
  → token budget + recency/confidence/salience
  → return with provenance/citations
~~~

目标延迟：hot < 10ms；warm 10–100ms；cold 异步。不要为了快把未验证的记忆注入 hot path。

### 5.5 高可用

- PG：primary/standby + PITR + 连接池；写走事务，读走只读副本（注意 read-your-writes）。
- Redis/Valkey：Sentinel/Cluster；缓存丢失可重建；队列持久化（AOF/streams）。
- 对象存储：版本化 + 跨区复制。
- Hub：无状态水平扩展；OAuth/JWKS 缓存；幂等键（memory_id + version）。
- 异步：lease + retry + dead-letter；失败不阻塞 turn。
- 删除：tombstone + 异步传播 + 审计；删除完成前不返回“已删除”。

### 5.6 治理

- Scope：tenant → user → project → session；dataset 级隔离优先于 user_id 过滤。
- RBAC/ABAC：人、agent、API key 三类主体。
- 审计：谁读/写/删、为什么、命中哪些记录。
- PII/secret：写入前扫描；hot path 不注入 secret。
- 保留：TTL + 法务保留 + 可验证遗忘。
- 来源：每条记忆可追溯到 event/文档；第三方内容标记 untrusted。

---

## 6. 与你现有认知的差异

| 你的认知 | 2026 的修正 | 建议 |
|---|---|---|
| Hub 编排 Redis + PG + Vector 三库 | Hub 是控制面，不是第四个库；一个系统 of record + 派生索引 | 保留 Hub，但把 PG 设为权威；Redis/Vector 降为派生 |
| 三个库都存“记忆” | 只有 PG 存权威记录；Redis 存热/队列；Vector 存索引 | 统一 MemoryRecord；禁止三套 schema |
| 写入时同步抽取/巩固 | 抽取/巩固异步；hot path 不调 LLM | outbox + worker；turn 不被记忆拖死 |
| 删除只删主表 | 删除要传播到向量/图/缓存 | tombstone + 异步传播 + 审计 |
| 向量库是核心 | 向量只是信号之一；混合检索 + rerank 更强 | pgvector 起步；规模需要再上专用向量库 |
| 图是可选 | 时间性/关系是差异化；bi-temporal 很有价值 | 先 PG 图关系；需要时接 Graphiti/Neo4j |
| 记忆是插件 | 记忆是 harness 职责 | Memory Fabric 是核心服务，不是外挂 |
| 自建三库才“工业级” | 托管 memory 服务已可用；单库+治理也很工业级 | 先 PG-centric；云上用托管 provider |

---

## 7. Memory 的 v1.0 → v2.0 路线

| 阶段 | 目标 | 做什么 | 验收 |
|---|---|---|---|
| v1.0 缝合 | 能记住、能召回、能删除 | PG 记录 + pgvector + Redis 热/队列 + outbox worker + MCP API | 一个真实任务跨会话记住偏好；删除可传播；hot path 无 LLM |
| v1.5 收口 | 一个模型、一个权威 | 统一 MemoryRecord；去掉三套 schema；加 temporal/provenance/confidence；混合检索 | 冲突消解可解释；删除审计通过；召回 P95 |
| v2.0 自有 | 记忆成为差异化 | 自有 Memory Fabric 协议；可选专用记忆模型；canary/回滚；多租户治理 | LongMemEval/MemoryAgentBench 子集；trust/fabrication 指标；成本/延迟达标 |

---

## 8. 评测：不要只看 LoCoMo

- LongMemEval：多会话推理、时间推理、知识更新、弃答。
- MemoryAgentBench：增量多轮中的更新/遗忘。
- Trust/fabrication：wish vs fact、矛盾、PII、跨租户泄漏（ContextDB 的 trust bakeoff 是一个可借鉴的测试思路）。
- 工程指标：召回 P50/P95、写入 P95、hot path LLM 调用数（应为 0）、删除传播时间、cache hit、token/任务、人工纠错率。
- 不要把厂商自报 LoCoMo 当横比；同模型、同工具、同预算才有意义。

---

## 9. 风险与开放问题

- 单库极限：PG+pgvector 在千万级向量/高并发下会撞墙；需要提前做容量模型，必要时拆向量库，但保持“一个权威 + 派生索引”。
- 图查询：PG 递归 CTE 对深图/复杂路径不够；Graphiti/Neo4j 可作为派生图，不替代权威。
- 异步一致性：outbox/worker 带来延迟；需要 read-your-writes 策略（版本号/等待索引）。
- 托管锁定：AWS/Azure/GCP 托管 memory 的导出/迁移能力要提前验证。
- 专用模型：Hy-Memory 这类模型是否值得自建/托管，取决于记忆质量是否成为产品差异化；不要为了新而引入 30B 模型。
- 评测过拟合：记忆 benchmark 容易刷；要建自己的任务集 + 人工复核。

---

## 10. 来源

- Polyglot vs Red Hat MemoryHub 对比与 container 清单: [11-memoryhub-vs-polyglot.md](11-memoryhub-vs-polyglot.md)
- Red Hat MemoryHub Architecture: https://github.com/redhat-ai-americas/memory-hub/blob/main/docs/ARCHITECTURE.md
- ContextDB preprint (Zenodo, 2026-04-19): https://zenodo.org/records/19647089
- ContextDB (embedded relational+graph+vector): https://github.com/context-graph-ai/contextdb
- ContextDB (unified memory layer): https://github.com/atomsai/contextdb
- Hy-Memory / MemHub: https://github.com/Tencent-Hunyuan/Hy-Memory
- Hy-Memory 2.0 news: https://article.pchome.net/news/16374.html
- Zep v4 overview: https://help.getzep.com/overview.md
- Zep vs Graphiti: https://help.getzep.com/zep-vs-graphiti
- AWS Bedrock AgentCore Memory: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html
- Azure Foundry memory: https://learn.microsoft.com/en-us/azure/ai-foundry/agents/how-to/memory-usage
- GCP Vertex AI Memory Bank: https://discuss.google.dev/t/how-to-build-ai-agents-with-long-term-memory-using-vertex-ai-memory-bank-adk/193013/1
- Redis Iris context engine: https://redis.io/docs/latest/develop/ai/context-engine/
- Mem0 new algorithm migration: https://mem0.mintlify.app/migration/oss-v2-to-v3
- Letta: Why Memory Isn't a Plugin: https://www.letta.com/blog/why-memory-isnt-a-plugin/
- Hermes pgvector provider: https://pypi.org/project/hermes-memory-pgvector/
- Cognee memory versioning: https://docs.cognee.ai/core-concepts/further-concepts/memory-versioning
