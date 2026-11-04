# M6 Capability Marketplace（v2.0 baseline）

> 状态：本地 checksum bundle 已实现；远程索引/签名/来源验证未做。

## 已实现

- src/core/marketplace.ts
  - CapabilityBundle
  - createCapabilityBundle
  - verifyCapabilityBundle
  - installCapabilityBundle
- checksum：
  - canonical JSON manifests 的 sha256
  - 篡改 manifest 后拒绝安装
- 安装仍走 RuntimeStore CapabilityRegistry

## 未实现

- 远程 marketplace 索引
- 发布者签名/公钥验证
- 版本冲突/回滚策略
- 安装审批 UI

## 验收

- 114 tests pass
