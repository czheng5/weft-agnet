# Device Sync Protocol

> v2.5 baseline：设备身份 + 事件游标 + 租户隔离；不是完整 E2E 加密同步。

## 设备注册

- DeviceRegistry 持久化到 devices.json
- register 返回 deviceId + 一次性明文 token
- 只存 token 的 sha256
- authenticate 使用 timingSafeEqual
- revoke 立即失效

## Pull

~~~~ts
const batch = await sync.pull(token, scope, cursors);
~~~~

返回：

- deviceId
- threads：threadId/title/status/version/events/nextSeq
- cursors：每个 thread 的新 afterSeq
- serverTime

客户端下次带上 cursors 即可只拉增量。

## 约束

- scope 由调用方传入；只返回同 tenant/project/workspace
- token 错误直接失败
- 不返回其他设备或跨租户事件
- 当前为事件增量拉取，不是双向 CRDT

## 未完成

- 端到端加密
- 设备公钥/签名
- 冲突解决（LWW/CRDT）
- push/ack 协议
- 真实移动端 SDK
