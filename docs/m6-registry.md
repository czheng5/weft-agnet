# M6 Capability API + BYOM Registry（v2.0 draft）

> 状态：M6-B Capability Registry HTTP API 与 ModelProfile BYOM 注册表已实现。

## 1. Capability API

Gateway 新增：

- GET /capabilities
- POST /capabilities
  - body 可以是 manifest 或 { manifest }
  - 校验 Runtime CapabilityManifest
  - 400 返回 schema 错误
- GET /capabilities/:id/:version
  - 先按 name/version 查，再按 id 匹配
  - 支持 id 或 name 选择器

## 2. BYOM ModelRegistry

新增 src/core/model-registry.ts：

- ModelProfile：
  - id/name/kind/baseUrl/model
  - apiKeyEnv（只存环境变量名）
- upsert/get/list/remove
- resolveApiKey 从 env 读取
- 不存储 API key 明文
- 校验 id / http(s) baseUrl / env 变量名

## 3. 测试

- Capability POST → GET → list → invalid 400
- ModelRegistry 持久化、reload、移除
- 不把 secret 写入 models.json
- 拒绝非法 kind/baseUrl/env

## 4. 尚未实现

- Marketplace 签名/评分/安装审批
- 模型 profile 与 AgentLoop 自动装配
- RBAC/租户配额
- Web 设置页

## 5. 验收

- 109 tests pass
