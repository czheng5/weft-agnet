# M5 AgentLoop seam + Eval（v1.6 draft）

> 状态：M5-E AgentLoop 接入点与 Eval gate 已实现；真实 CLI/模型装配仍未完成。

## 1. AgentLoop seam

新增 src/core/agent-worker.ts：

- WorkerPool handler 适配器
- 从 Outbox payload 的 eventId 找到 message.user
- 调用注入的 AgentRunner.run(text)
- 追加 agent.result 事件
- 使用 job.id 做幂等，重试不会重复结果
- 不把 Session 内部事件强塞进 RuntimeEvent

CLI/生产装配通过 createAgent 注入真实 AgentLoop。

## 2. Eval gate

新增 src/core/eval-gate.ts：

- EvalCase
- runEvalSuite
- pass/fail/error 聚合
- 空 suite 视为未通过

## 3. 测试

- message → AgentLoop seam → agent.result
- 重试幂等
- eval 聚合与异常

## 4. 尚未实现

- HTTP Source/Trigger
- CLI serve
- 多 Worker 并发
- 真实模型端到端
- v1.6 release gate

## 5. 验收

- 104 tests pass
