# M5 Router / Mandate（v1.6 draft）

> 状态：M5-C 最小 Router 已实现；SSE/Watchdog/AgentLoop 仍未接。

## 1. 已实现

- src/core/router.ts
  - 空消息拒绝
  - 可注入 admission policy
  - Mandate capability 检查
  - Mandate 过期拒绝
  - appendEvent message.user
  - 无 idempotency 时入 Outbox worker.task
  - idempotency 去重，不重复入队
- Gateway 已改为委托 Router：
  - 不再自己拼 message/outbox 逻辑
- 测试：
  - 允许/拒绝
  - mandate capability
  - mandate 过期
  - idempotency 去重
  - worker.task 入队

## 2. 边界

- Router 不做模型调用。
- Router 只做准入 + 持久化 + 入队。
- Mandate 是任务级授权；不是 per-command approval。
- 没有 Mandate 时默认允许，用于本地开发。

## 3. 尚未实现

- Eval（回归/质量门）
- SSE
- Watchdog
- Source/Trigger
- AgentLoop 接入

## 4. 验收

- 100 tests pass
- Router 单元测试覆盖准入/mandate/idempotency
