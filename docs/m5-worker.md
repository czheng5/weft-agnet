# M5 Worker Pool（v1.6 draft）

> 状态：M5-B 最小 WorkerPool 已实现；Router/SSE/Watchdog/AgentLoop 仍未接。

## 1. 已实现

- src/core/worker-pool.ts
  - 从 RuntimeStore Outbox claim 任务
  - 为 thread 获取 WorkerLease
  - 调用注入的 handler
  - 成功 completeOutbox
  - 失败 failOutbox + backoff
  - lease busy 时 defer，不重复执行
  - heartbeat 定时续租
- 可配置：
  - workerId
  - model
  - sandbox
  - leaseTtlMs
  - pollMs
  - limit
- 测试：
  - 成功 claim/run/complete
  - thread lease busy 时 defer
  - 不重复领取

## 2. 设计边界

- WorkerPool 不直接创建 Agent；handler 注入 AgentLoop/工具。
- Gateway 只写 Outbox；WorkerPool 消费 Outbox。
- lease 是执行所有权，不是 Thread 状态。
- 失败进入 outbox retry，不丢任务。

## 3. 尚未实现

- Router / Eval / Mandate
- SSE
- Watchdog
- Source/Trigger
- AgentLoop 真实接入
- 多 Worker 并发/公平调度

## 4. 验收

- 104 tests pass
- WorkerPool 单元测试覆盖 claim/lease/complete/fail
