# M4 Runtime Schema（v1.5 draft）

> 状态：**schema/contract + SQLite RuntimeStore 已实现；M4 尚未完成**。  
> 目标：在 v1.5 把 Thread/Worker/Event/Mandate/Capability 的语义收口，避免到 M5 再造第二套。

## 1. 本轮落了什么

- src/core/runtime-schema.ts
  - RuntimeScope
  - ThreadRecord
  - WorkerLeaseRecord
  - RuntimeEventRecord
  - MandateRecord
  - CapabilityManifest
  - OutboxRecord
  - validate* / assertSameScope / createThreadRecord
- src/core/runtime-store.ts
  - RuntimeStore 接口
- src/core/runtime-store-sqlite.ts
  - SQLite RuntimeStore：threads/events/leases/mandates/capabilities/outbox
  - append-only trigger；seq/idempotency；乐观版本
- src/core/runtime-store-postgres.ts
  - Postgres RuntimeStore：同一契约；pg-mem 测试
  - 真实 PG 契约待补
- src/core/thread-workgraph.ts
  - Thread ↔ WorkGraph 绑定；一个 graph 只能绑一个 thread
  - WorkGraphJSON 持久化 threadId
- src/core/capabilities.ts
  - CapabilityRegistry 统一到 runtime CapabilityManifest
  - v1 legacy manifest 只读迁移；persist version 2
- src/core/v1-compat.ts
  - 只读读取 v1 workgraph/capabilities/scheduler/checkpoints
  - 显式迁移到 RuntimeStore；不改写 v1 文件
- migrations/002_runtime.sql
  - runtime_threads
  - runtime_events（append-only trigger）
  - runtime_worker_leases
  - runtime_mandates
  - runtime_capabilities
  - runtime_outbox
- tests/runtime-schema.test.ts
  - scope 隔离、lease 时间、事件 seq、mandate 过期、capability sandbox
- tests/runtime-store-sqlite.test.ts
  - thread 版本冲突、event idempotency/seq、lease 过期、outbox claim/complete/fail
- tests/runtime-store-postgres.test.ts
  - pg-mem 同契约：threads/events/lease/mandate/capability/outbox
- tests/thread-workgraph.test.ts
  - 绑定、JSON roundtrip、跨 thread 拒绝
- tests/capabilities.test.ts
  - manifest 统一、legacy v1 迁移、权限/sandbox
- tests/v1-compat.test.ts
  - 只读快照、迁移到 thread/event/capability、原文件不变

## 2. 概念归属

| 概念 | owner | 说明 |
|---|---|---|
| Thread | ThreadStore | 用户可理解的持续工作单元；跨入口继续 |
| WorkGraph | WorkGraphStore | Thread 内部的任务 DAG，不替代 Thread |
| RuntimeEvent | EventLog | Thread/Worker/Outbox 生命周期事实，append-only |
| Session event | Session | 单次 turn 的对话/工具记录，不是 runtime 事实 |
| WorkerLease | LeaseStore | 临时 Worker 的所有权/租约，不持久化业务状态 |
| Mandate | MandateStore | 任务级授权范围；不是每次 approval |
| CapabilityManifest | CapabilityRegistry | Capability 的权限/沙箱/eval 声明 |
| Outbox | OutboxStore | 外部副作用与回执，支持重试/对账 |

## 3. 不变量

1. tenantId/projectId/workspaceId 必须完整；跨 scope 直接拒绝。
2. RuntimeEvent 只追加；seq 在 thread 内从 1 递增。
3. WorkerLease 必须有 leaseUntil >= heartbeatAt；过期可被回收。
4. Mandate 必须有 expiresAt > createdAt。
5. CapabilityManifest 的 sandbox 必须是已支持后端或 any。
6. Outbox 状态机：pending → claimed → done/failed；失败带 retryAt。
7. Thread 版本号用于乐观并发；更新必须带 version。

## 4. 当前完成边界

- 真实 PostgreSQL RuntimeStore 契约 ✅（见 runtime-pg-live.md）
- EventLog/Outbox 的实际事务实现 ✅（SQLite）
- v1.0 数据迁移与只读兼容 ✅（最小迁移）
- Thread/WorkGraph 的绑定规则 ✅（最小绑定）
- CapabilityManifest 与现有 CapabilityRegistry 的合并 ✅
- 多租户查询/索引 ✅（配额仍属 M6）
- contract tests 对真实 PostgreSQL ✅

M4 的 schema/store/迁移主链已完成；v1.5 release gate 尚未执行，不能宣称 M4 已发布。

## 5. 验收

当前：

- 95 tests pass
- runtime-schema 单元测试覆盖核心不变量

M4 完成条件：

- RuntimeStore 至少一个本地适配器（SQLite）✅
- EventLog append-only + seq/idempotency 契约测试 ✅
- Outbox 重试/对账契约测试（SQLite）✅
- v1.0 数据只读兼容 ✅
- docs/v2-plan 的 M4 exit criteria 全部有证据
