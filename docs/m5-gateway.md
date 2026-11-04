# M5 Agent Gateway（v1.6 draft）

> 状态：M5-A 最小 Gateway 已实现；完整 Super-agent 运行时未完成。  
> 目标：先有持久 Thread API，再接 Router/Worker/Watchdog。

## 1. 已实现

- src/core/gateway.ts
  - HTTP server
  - GET /health
  - GET /threads
  - POST /threads
  - GET /threads/:id
  - POST /threads/:id/messages
  - GET /threads/:id/events?after=&limit=
  - 可选 Bearer token
- 使用 RuntimeStore：
  - SQLite / Postgres 均可注入
  - Thread/Event 持久化
  - Outbox 任务入队
- 幂等：
  - Idempotency-Key 去重 event
  - 重复消息不重复入 Outbox
- 测试：
  - auth 401/200
  - thread 创建
  - message + event
  - idempotency
  - events 查询

## 2. 尚未实现

- SSE/WebSocket 流式事件
- Router / Eval / Mandate
- Worker Pool / lease 消费
- Watchdog
- Source/Trigger（GitHub/Feishu/Webhook）
- Capability Registry API
- 模型调用与 AgentLoop 接入

## 3. 设计约束

- Gateway 不直接跑模型；它持久化消息并投递 Outbox。
- 后续 Worker 从 Outbox claim，再执行 AgentLoop。
- 不允许 Gateway 在内存里保存唯一消息事实。
- 所有 Thread/Event 必须可重启恢复。

## 4. 验收

当前：

- 96 tests pass
- Gateway 单元测试覆盖

M5 完成条件：

- SSE
- Router + Eval + Mandate
- Worker Pool + lease
- Watchdog
- Source/Trigger 至少 HTTP/GitHub
- 真实 AgentLoop 接入
