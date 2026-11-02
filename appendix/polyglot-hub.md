# 附录 A · Polyglot Hub 未来备选设计：PG 唯一真相 + Vector 派生索引 + Redis 缓存

> **状态：APPENDIX / 未来备选，不进入 v1.0 默认栈。** v1.0 采用 Red Hat 型 MemoryHub（PostgreSQL + pgvector + 图、Valkey、MinIO、MCP/OAuth/RBAC）；本方案作为 MemoryProvider 的第二个实现，待 v2.0 用真实规模指标评估后再模块化替换。当前 PRD 见 [../PRD.md](../PRD.md)，roadmap 见 [../ROADMAP.md](../ROADMAP.md)。
>
> 你的理解：PostgreSQL 是唯一真相，Vector 做语义参考/索引，Redis 做常用记忆缓存；相比 Red Hat 少了图框架。
>
> 判断：**可以，而且这已经不是“三库对等”的反模式，而是标准的 CQRS/读模型架构。** 只要坚持“PG 唯一写入口 + Vector/Redis 可重建 + 删除可传播”，它就是工业级；甚至在大规模向量检索上比 Red Hat 的 pgvector 更合适。
>
> 我前面把 Polyglot Hub 定义得偏宽，把“三库都当真相”也算进去了；按你的定义，它是 **PG-authoritative polyglot**，不是 anti-pattern。

---

## 1. 先回答 7 个容器：主进程不在 UI 里

Red Hat 的实际拆分：

- **MCP server** 是主进程，单独一个 Deployment，1 个容器（memory-hub-mcp/deploy/openshift.yaml）。
- **UI** 是另一个 Deployment，**2 个容器**：memoryhub-ui（BFF）+ oauth-proxy sidecar（memoryhub-ui/openshift.yaml）。
- Auth 是独立 Deployment，1 个容器 + 1 个 init（memoryhub-auth/openshift.yaml）。

所以“7 个容器”不是把主进程塞进 UI。7 个的合理组合是：

1. PostgreSQL（权威）
2. Redis/Valkey（缓存/队列）
3. Vector DB（派生索引）
4. MCP / Memory Hub API（主进程）
5. Auth（OAuth/RBAC）
6. Indexer / Outbox Worker（派生索引与删除传播）
7. 以下三选一：UI BFF、Embedding 服务、MinIO（或对象存储网关）

如果第 7 个选 UI BFF，且还要 oauth-proxy，则 UI 变 2 个容器，总数变 8。  
如果 UI 用 Weft TUI/CLI（客户端，不是服务端），第 7 个可以给 Embedding 或 MinIO。

**所以：主进程 = MCP/API，不是 UI；UI 只是客户端/BFF。**

---

## 2. 你的 Polyglot 和 Red Hat 的真正差异

| 维度 | 你的方案 | Red Hat MemoryHub |
|---|---|---|
| 权威 | PostgreSQL | PostgreSQL |
| 向量 | 独立 Vector DB，作为派生索引 | pgvector，同库 |
| 缓存 | Redis，作为热数据/查询缓存 | Valkey，主要做队列/推送/热数据 |
| 图 | 无独立图框架；可用 PG 边表/递归 CTE | PG 图关系；必要时外挂图库 |
| 一致性 | 需要 outbox/CDC 派生 | 单库事务，天然一致 |
| 向量扩展 | 独立扩，专用 ANN 更强 | 受 PG 限制 |
| 运维 | 多一套 Vector/Redis | 少一套向量库 |
| 治理 | 服务层统一；跨库删除要传播 | 服务层统一；单库删除简单 |

**关键判断**：你少的不是“工业级”，而是 **Red Hat 用单库事务换来的简单性**；你多的是 **向量独立扩展的能力**。这不是对错，是取舍。

---

## 3. 什么时候你的方案更好

1. 向量规模超过 pgvector 舒适区（千万级、高并发、强过滤）。
2. 需要专用 ANN/量化/混合检索能力。
3. 检索负载和事务负载需要独立扩缩容。
4. 已有成熟 Vector DB 平台和运维团队。
5. 记忆只是多个检索消费者之一。

## 4. 什么时候 Red Hat 更合适

1. 团队小、想少运维。
2. 数据量中等，PG+pgvector 足够。
3. 需要单库事务、简单删除、简单备份。
4. 需要快速上治理/多租户/审计。
5. 不想维护第二套向量 schema 和索引重建。

---

## 5. 改进设计：把“派生”做成硬约束

### 5.1 PostgreSQL：唯一写入口

建议表：

~~~text
memories
  id, tenant_id, user_id, project_id, session_id
  layer, kind, content, structured
  provenance, confidence, sensitivity, status
  valid_from, valid_until, superseded_by
  version, created_at, updated_at, deleted_at

memory_versions
  memory_id, version, content_hash, change_reason, created_at

outbox
  id, aggregate_id, event_type, payload, created_at
  processed_at, attempts, last_error

memory_edges          -- 可选，简单图
  from_id, to_id, relation, weight, valid_from, valid_until

audit_log
  actor, action, memory_id, scope, at, request_id
~~~

规则：

- 只有 Memory Hub 的写路径能写 memories；Vector/Redis 不能反向写 PG。
- 每次写记忆在同一事务里写 memories + memory_versions + outbox。
- 删除写 tombstone（status=deleted, deleted_at），不物理删；由 outbox 传播。
- 版本号单调递增，作为缓存/索引的幂等键。

### 5.2 Vector DB：只是索引，不是真相

每条向量 metadata 至少包含：

~~~text
memory_id, version, tenant_id, user_id, project_id
status, sensitivity, valid_from, valid_until
embedding_model, content_hash, deleted_at
~~~

规则：

- 向量库只做 ANN；结果必须回 PG hydrate + 过滤，不能直接当最终答案。
- upsert 用 memory_id + version 做幂等；旧版本可保留短窗口，查询按 version/status 过滤。
- 删除用 tombstone + 异步 delete；定期 reconciliation 对比 PG 与向量库。
- 换 embedding 模型时蓝绿重建索引，别名切换；不要原地混模型。
- 租户隔离：向量 namespace/partition 按 tenant；检索后 PG 再校验 scope，防止越权。

### 5.3 Redis：缓存，不是权威

缓存三类：

1. 查询结果缓存：key = tenant + user + query_hash + scope + version；TTL 短。
2. 热记忆 ID 集合：按 user/session 的最近/高频 ID；只存 ID，不存正文。
3. 会话工作集：当前 turn 的 working memory；TTL 跟随会话。

规则：

- 缓存 key 必须带 version/updated_at；写入/删除后 bump version 并 publish 失效。
- 缓存只存“可重建”的东西；丢失不影响正确性。
- 不要把权限决策缓存成长期值；权限变了要立即失效。
- 不要用 Redis 当唯一队列；队列要可持久化/可重放（Redis Streams 或 PG outbox）。

### 5.4 写路径

~~~text
API write
  → validate scope/provenance
  → PG transaction: memories + versions + outbox
  → commit
  → publish cache invalidation (best effort)
  → return memory_id + version

Outbox worker
  → claim outbox row (lease)
  → vector upsert/delete (idempotent)
  → mark processed
  → on failure: retry/backoff/DLQ
~~~

关键：**不要 API 直接三路写**；只写 PG + outbox，派生由 worker 做。

### 5.5 读路径

~~~text
query
  → auth/scope
  → Redis query cache (hit? return with version)
  → Vector ANN top-K (tenant namespace)
  → PG hydrate + filter (status/scope/validity/version)
  → optional BM25/tsvector + graph/edge
  → rerank
  → token/recency/confidence budget
  → cache result (short TTL)
~~~

读自己刚写的：如果 version 还没进向量索引，直接按 memory_id 从 PG 读；或等待 index watermark。不要假设向量库强一致。

### 5.6 删除传播

~~~text
delete API
  → PG: status=deleted, deleted_at, version+1, outbox(delete)
  → cache: delete keys by memory_id/version
  → worker: vector delete
  → audit
  → reconciliation: periodic diff PG vs Vector
~~~

删除完成前不要返回“已删除”；返回“删除中”，并提供审计状态。

### 5.7 高可用

- PG：primary/standby + PITR；写主读从，注意 read-your-writes。
- Redis：Sentinel/Cluster；缓存丢失可重建；Streams/AOF 做队列持久化。
- Vector：副本/分片；索引重建蓝绿；快照备份。
- Worker：多副本 + lease；幂等；DLQ；重放。
- Hub：无状态；OAuth/JWKS 缓存；请求幂等键。
- 观测：outbox lag、index lag、cache hit、vector recall、delete propagation time。

---

## 6. 图：不是必须，但要知道什么时候需要

你的方案“少了图框架”不一定是缺陷。先问三个问题：

1. 是否需要多跳关系（人-项目-决策-结果）？
2. 是否需要“当时是什么”（bi-temporal）？
3. 是否需要实体消歧/社区发现？

如果答案是“否”，PG 边表 + 递归 CTE 足够。  
如果“是”，把 Graphiti/Neo4j 作为**派生图索引**，不要做第二真相；边从 PG outbox 派生，删除同样传播。

---

## 7. 7 个容器的推荐拓扑

~~~text
1. postgres        (authority + outbox + audit)
2. redis           (cache + queue)
3. vector          (derived ANN index)
4. mcp-api         (main process)
5. auth            (OAuth/RBAC)
6. indexer-worker  (outbox → vector/cache)
7. ui-bff          (optional; or embedding/minio)
~~~

- 如果 UI 用 Weft TUI/CLI，不需要 ui-bff 容器；第 7 个给 embedding。
- 如果自建 embedding + MinIO + UI 都要，变成 8–9 个。
- 如果 reranker 也要，+1。
- 如果加图索引，+1（Graphiti/Neo4j）。
- 如果加 curation agents（trace reviewer/fact checker），+2。

**所以“7 个”是可行的，但它是“核心 + 一个可选服务”，不是“所有东西都塞进 UI”。**

---

## 8. 和 Red Hat 的最终判断

| 问题 | 答案 |
|---|---|
| 你的 PG 唯一真相 + Vector 索引 + Redis 缓存能工业级吗？ | **能**，前提是 outbox/CDC、幂等、删除传播、版本化、治理 |
| 它和 Red Hat 的主要差？ | 向量独立扩展 vs 单库简单；有/无图框架；运维复杂度不同 |
| 少了图框架是硬伤吗？ | 取决于查询；不是默认硬伤。需要时加派生图。 |
| 7 个容器够吗？ | 核心够；UI/embedding/MinIO/reranker 按需再加 |
| 主进程在 UI 里吗？ | **不在**；主进程是 MCP/API，UI 是 BFF/客户端 |

---

## 9. 反模式（必须避免）

- API 直接写 PG + Vector + Redis 三路（双写）。
- Vector/Redis 被其它服务当权威读。
- 删除只删 PG。
- 缓存 key 不带 version/scope。
- 向量结果不回 PG 过滤，直接返回。
- 换 embedding 模型原地混跑。
- 把图索引当第二真相。

---

## 10. 一句话

**你描述的不是“三库对等”的 Polyglot 反模式，而是“PG 权威 + 两个派生读模型”的 CQRS 变体。** 它完全可以工业级；关键不是“少一个图框架”，而是把 **outbox、幂等、删除传播、版本化、治理** 做成硬约束。7 个容器足够起步，主进程是 MCP/API，不在 UI 里。
