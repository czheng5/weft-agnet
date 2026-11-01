# 11 · Polyglot Hub vs Red Hat MemoryHub：差在哪，以及要几个 container

> 按你定义的“PG 唯一真相 + Vector 派生索引 + Redis 缓存”版本，改进设计见 [附录 A · Polyglot Hub](../appendix/polyglot-hub.md)；v1.0 默认仍用 Red Hat 型 MemoryHub。

> 问题一：Polyglot Hub（Redis + PostgreSQL + Vector DB + 上层 hub）和 Red Hat MemoryHub 这套方案，主要差在哪？为什么之前搜到的都说“足够工业级”？
>
> 问题二：如果按 Red Hat 这套做记忆库，大概要 compose 几个 container？
>
> 结论：**两者都能工业级，但“工业级”的代价放在不同地方。** Polyglot 把复杂度放在“多引擎一致性 + 运维”；Red Hat 把复杂度放在“单库容量 + 平台化治理”。对 Weft，v1.0 建议 Red Hat 型（PG+pgvector+图 + Valkey + 对象存储 + MCP/API），container 数量按“核心 5 / 生产 8–10 / 全量 12–13”三档。

---

## 1. 先澄清：两者不是“先进 vs 落后”

“工业级”不是架构纯度，而是：

- 有明确 SLO（延迟、可用性、恢复点）；
- 有 HA/备份/恢复演练；
- 有租户隔离、RBAC、审计、删除传播；
- 有可观测、容量模型、故障降级；
- 有数据迁移/版本化/回滚。

Polyglot Hub 和 Red Hat MemoryHub 都能满足这些；区别是**复杂度落在哪里**：

| | Polyglot Hub | Red Hat MemoryHub |
|---|---|---|
| 复杂度主要在哪 | 多引擎一致性、双写/CDC、三套运维 | 单库容量、平台化部署、治理代码 |
| 适合的团队 | 有平台/数据基础设施团队 | 应用/Agent 团队，想少运维 |
| 适合的规模 | 很大、需要独立扩缩容 | 中等到大，PG 能扛 |
| 工业级门槛 | 高（要自己做一致性） | 中（要接受 PG 边界） |

所以“之前搜到说 Polyglot 足够工业级”没有错；它只是**默认你有平台团队把多引擎的一致性做对**。

---

## 2. 主要差异（8 个维度）

| 维度 | Polyglot Hub | Red Hat MemoryHub |
|---|---|---|
| **真相源** | Redis/PG/Vector 都可能被当真相；hub 负责协调 | PostgreSQL 是唯一真相；pgvector/图是同一库里的索引 |
| **一致性** | 跨库最终一致；双写/CDC/补偿；删除要传播 | 单库事务；写入/删除/索引在一个事务里 |
| **查询模型** | 每种查询走最合适的引擎；hub 融合 | 关系 + 向量 + 图都在 PG；复杂查询用 SQL/递归 CTE |
| **扩展轴** | 每个引擎独立扩；向量库可上专用 ANN | 垂直扩 PG + 读副本；向量/图大了会撞墙 |
| **延迟** | 热路径可很低（Redis/专用向量库） | 热路径低到中；PG 向量检索比专用 ANN 慢一些 |
| **故障模式** | 一个库挂可能只影响一类查询；但一致性更复杂 | PG 挂全挂；但故障面单一、恢复路径清晰 |
| **运维** | 三套备份/监控/升级/安全/容量 | 一套 PG + Valkey + 对象存储；少很多 |
| **治理** | 每库一套权限/审计；跨库删除难证明 | 服务层统一 RBAC/审计/scope；删除可证明 |
| **扩展性** | 专用引擎功能最强（ANN、图算法、全文） | PG 生态足够；深度图/超大向量要外挂 |
| **成本** | 三套基础设施 + 平台人力 | 一套 PG + 少量边车；云上可能更省 |

### 一句话

- **Polyglot 是“数据平台思维”**：每个负载用最合适的引擎，代价是平台工程。
- **Red Hat 是“产品功能思维”**：记忆是一个产品能力，先保证一致/治理/可运维，再按需外挂。

---

## 3. 为什么 Red Hat 这套更“容易工业级”

看它的实际选择（来自 repo 的 ARCHITECTURE.md）：

- **PostgreSQL + pgvector + graph 一个库**：关系、向量、图关系同库；原文明确 no separate vector store, no separate graph database。
- **Valkey 只做 job queues + push**：不是记忆权威；会话焦点/队列/推送。
- **MinIO/S3 放大内容**：大于 100KB 的内容 spill 到对象存储，PG 存前缀。
- **MCP server + service layer**：所有 surface 过同一层；表面不能直连 PG。
- **OAuth 2.1 + RBAC + scope**：user/project/campaign/role/org/enterprise；跨租户隔离在服务层。
- **Fact Checker + Trace Reviewer + retention CronJob**：后台治理，不是“以后再说”。
- **明确边界**：MemoryHub 是 memory，不是 retrieval；文档语料归 RAG。

这套的工业级来自**收敛**：一个真相、一个权限面、一个审计面、一个备份面。代价是 PG 的容量边界。

---

## 4. 什么时候 Polyglot 仍然是对的

不要因为“新”就拆掉已有的三库。以下情况 Polyglot 更合适：

1. **向量规模超过 PG 舒适区**：千万级以上、高并发 ANN、需要专用量化/过滤。
2. **图查询很深/很重**：多跳、路径、社区发现，PG 递归 CTE 不够。
3. **检索负载和事务负载需要独立扩缩容**：搜索洪峰不能拖慢写入。
4. **已经有成熟平台团队**：CDC/outbox、跨库一致性、三套可观测都已具备。
5. **多产品共享一个检索平台**：记忆只是其中一个消费者。

如果属于这些，保留 Polyglot，但补三件事：**一个权威源、outbox/CDC、删除传播**。不要继续“hub 三路双写”。

---

## 5. Red Hat 这套的边界

- **PG 向量/图有上限**：千万级向量、深图、高并发要提前做容量模型。
- **不是 RAG**：文档语料检索是另一套；MemoryHub 只存“学到的经验/偏好/决策”。
- **部署不轻**：OpenShift/K8s 原生，8–10 个 workload；本地 compose 只是开发栈。
- **治理代码是资产也是负担**：OAuth/RBAC/scope/审计都要自己维护。
- **Embedding/Reranker 是独立服务**：模型升级、GPU/CPU、网络都要算。

---

## 6. 要几个 container？

先区分三种口径：**本地 compose / 核心生产 / 全量参考**。

### 6.1 本地 compose（repo 的 compose.yaml）

默认 4 个 service：

1. postgres（pgvector）
2. mcp
3. ui
4. auth

可选 profile：

5. valkey（profile: valkey）

所以：**4 个默认，5 个带 Valkey**。注意：本地 compose **没有** MinIO、embedding、reranker，不是完整生产栈。

### 6.2 核心生产（deploy-full.sh 的默认栈）

| # | workload | 容器数 | 说明 |
|---|---|---|---|
| 1 | PostgreSQL StatefulSet | 1 | pgvector + 图 |
| 2 | MinIO Deployment | 1 | 大内容/对象存储 |
| 3 | Valkey Deployment | 1 | 队列/推送/热数据 |
| 4 | Embedding Deployment | 1 | TEI，all-MiniLM-L6-v2 |
| 5 | Reranker Deployment | 1 | TEI，ms-marco-MiniLM；可退化 |
| 6 | MCP Deployment | 1 | FastMCP，工具面 |
| 7 | Auth Deployment | 1 + init | OAuth 2.1；init 只做 CA bundle |
| 8 | UI Deployment | **2** | BFF + oauth-proxy sidecar |
| 9 | Retention CronJob | 1（周期） | 保留/删除传播 |

**核心生产：8 个常驻 Pod / 9 个常驻容器**（UI 两个容器；auth 的 init 不算常驻），**加 retention CronJob 共 10 个容器**。

如果 reranker 先不上：**7 个常驻 Pod / 8 个常驻容器 + retention = 9 个容器**。

### 6.3 加 curation agents（推荐但可选）

- Trace Reviewer Deployment：1 个常驻容器
- Fact Checker CronJob：1 个周期容器

**加完：9 个常驻 Pod / 10 个常驻容器；加 retention + fact checker 共 12 个容器。**

### 6.4 全量参考栈

再加：

- Test-data cleanup CronJob：+1（周期）
- EvalHub adapter：+1（独立 namespace，可选）
- Operator：skeleton，未默认部署；+1（若用）
- Observability（Prometheus/Grafana）：+2–3（TBD）

**全量大约 12–13 个容器；加可观测/评测可到 15–17。**

### 6.5 一句话回答

- **只想跑一个“记忆库核心”**：Postgres + Valkey + MinIO + Embedding + MCP = **5 个容器**；加 Auth = 6；加 Reranker = 7；加 UI = 8–9。
- **按 Red Hat 默认生产栈**：**8 个常驻 Pod / 9 个常驻容器**，算上 retention 是 **10 个容器**。
- **加 curation agents**：**12 个容器**左右。
- **全量参考**：**12–13 个容器**，加观测/评测 15–17。

---

## 7. 给 Weft 的建议

### v1.0：Red Hat 型，7–9 个容器

~~~text
postgres (pgvector + graph)
valkey (queue/hot/semantic cache)
minio (raw/cold)
embedding (TEI/CPU)
mcp-api (Memory Hub API)
auth (OAuth/RBAC)          # 可先用 API key
ui (optional)              # 先用 Weft TUI/CLI
reranker (optional)        # 先不上，纯 cosine
~~~

核心 5 + auth = 6；加 UI/reranker = 8–9。这个规模最适合“先工业级、再优化”。

### v1.5：加治理与后台

- retention CronJob
- trace reviewer / fact checker（按需）
- 混合检索（BM25 + vector + graph）
- 删除传播与审计

### v2.0：按指标决定是否外挂

- 向量超过 PG 舒适区 → 加 Qdrant/Milvus 作为派生索引；
- 图查询超过 PG → 加 Graphiti/Neo4j 作为派生图；
- 仍然保持“一个权威 + 派生索引”，不要回到三库双写。

---

## 8. 选型判断表

| 你的情况 | 建议 |
|---|---|
| 团队小、想少运维、数据量中等 | **Red Hat 型**（PG+pgvector+图 + Valkey + 对象存储） |
| 已有 Redis/PG/Vector 平台、团队能运维 | **Polyglot**，但补 outbox/CDC/删除传播 |
| 向量千万级、ANN 要求高 | Polyglot 或 PG + 专用向量库（派生） |
| 深图/时序/合规 | PG 图起步，必要时 Graphiti/Neo4j（派生） |
| 云原生、不想自建 | 托管 memory（AWS/Azure/GCP）+ 本地 provider 接口 |
| 记忆质量是差异化 | 专用记忆模型（Hy-Memory 类）+ 自建 eval；不要先上 30B |

---

## 9. 来源与文件

- Red Hat MemoryHub compose: repos/memory-hub/compose.yaml
- 部署脚本与 namespace: repos/memory-hub/scripts/deploy-full.sh
- 架构: repos/memory-hub/docs/ARCHITECTURE.md
- 子系统清单: repos/memory-hub/docs/SYSTEMS.md
- UI 两容器: repos/memory-hub/memoryhub-ui/openshift.yaml
- Auth init 容器: repos/memory-hub/memoryhub-auth/openshift.yaml
- Agents: repos/memory-hub/memoryhub-agents/deploy/
- 外部: https://github.com/redhat-ai-americas/memory-hub
