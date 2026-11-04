# M5 SSE + Watchdog（v1.6 draft）

> 状态：M5-D SSE 与 Watchdog 已实现；AgentLoop/Eval/Source 仍未接。

## 1. SSE

Gateway 新增：

- GET /threads/:id/events/stream?after=
- content-type: text/event-stream
- 先发送 : connected
- 每 500ms 拉取 after 之后的新事件
- 事件格式：id / event / data
- 15s 心跳
- 客户端断开或 Gateway close 时清理

## 2. Watchdog

新增 src/core/watchdog.ts：

- scanOnce() 返回 expired-lease 告警
- 只报告，不自动杀进程/删租约
- start()/stop()
- onAlert 回调
- 独立于 WorkerPool 运行

## 3. 测试

- SSE 首事件可读，事件类型为 message.user
- Watchdog 发现过期 lease，租约仍保留
- start/stop 状态

## 4. 尚未实现

- AgentLoop 接入
- Eval
- Source/Trigger
- 自动恢复策略（Watchdog 目前只告警）

## 5. 验收

- 102 tests pass
