# M5 HTTP Source + CLI serve（v1.6 draft）

> 状态：M5-F Source/CLI/端到端 smoke 已实现，准备 v1.6 release gate。

## 1. HTTP Source

新增 src/core/http-source.ts：

- 轮询 JSON HTTP 源
- 支持数组或 { items: [...] }
- 必填 id/text
- 跨轮询去重
- 可注入 fetch / headers / interval
- handler 串行执行
- 错误回调

## 2. CLI serve

新增：

~~~bash
weft --serve --port 4780
~~~

- 使用 workspace/.weft/runtime.db
- 启动 AgentGateway
- scope: local/weft/workspace
- 可选 WEFT_GATEWAY_TOKEN Bearer
- SIGINT/SIGTERM 关闭

## 3. 端到端 smoke

scripts/m5-smoke.ts：

- Gateway 创建 Thread
- POST message
- Router 入 Outbox
- WorkerPool claim
- AgentWorker seam 执行
- agent.result 写回
- GET events 验证

结果：

~~~text
M5 E2E PASS
  events=3 result=echo:end to end
~~~

## 4. 尚未完成

- 真实模型端到端（需要用户 key）
- 多 Worker 公平调度
- Source 只支持 HTTP JSON
- v1.6 release gate
