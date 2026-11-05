# Marketplace Install UI

> v2.5 baseline：签名 bundle 安装页；远程索引/审批/回滚仍属后续。

## 路由

- GET /marketplace
- GET /marketplace/keys
- POST /marketplace/install
- GET /capabilities

## UI

- 粘贴 SignedCapabilityBundle JSON
- Verify & install
- 显示已安装 capabilities
- 不需要前端构建

## 安全

- install 需要 admin
- 未配置 publisher keyring 返回 501
- 未知 key/revoked/expired/bad signature 返回 400
- 不返回私钥
- 安装复用 installSignedCapabilityBundle

## 测试

- 页面可访问
- 合法 bundle 安装
- bad signature 拒绝
- keyring 只显示 key id/revocation

## 尚未完成

- 远程 marketplace index 页面
- 安装审批/回滚
- 发布者资料/评分
- 凭据/权限 UI
