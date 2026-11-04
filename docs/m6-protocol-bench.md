# M6 Weft Protocol + Bench（v2.0 draft）

> 状态：M6-D 协议 envelope 与 Bench 已实现；Marketplace/Desktop 未做。

## 1. Weft Protocol

新增 src/core/protocol.ts：

- protocol: weft/1
- WeftEnvelope：
  - id/type/scope
  - threadId
  - sentAt
  - payload
  - idempotencyKey
- 类型：
  - thread.create
  - thread.message
  - thread.event
  - agent.result
  - capability.install
- 校验：
  - 版本
  - scope 完整
  - thread 类型必须有 threadId
  - sentAt 数值

## 2. Weft Bench

新增 src/core/bench.ts + scripts/weft-bench.ts：

- 迭代计时
- errors
- min/p50/p95/max
- 50 次 Gateway thread+message 写入

本次结果：

~~~text
WEFT BENCH PASS
  iterations=50 errors=0
  p50=4.58ms p95=6.30ms max=19.06ms
~~~

## 3. 测试

- protocol 版本/scope/threadId 校验
- bench percentile/error
- 113 tests pass

## 4. 尚未实现

- Marketplace 签名/来源验证
- Desktop 壳
- 多 Worker 公平调度
- 生产级存储/计算分离的部署编排
- OAuth/OIDC
