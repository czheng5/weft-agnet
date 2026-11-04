# M6 RBAC + Tenant Quota（v2.0 draft）

> 状态：M6-C 最小 Principal/RBAC/Quota 已实现；OAuth/控制台/配额计费未做。

## 1. Principal

- id
- token（静态 Bearer，测试/本地）
- role: reader / writer / admin
- scope: tenantId / projectId / workspaceId

Gateway 通过 principals 注入；没有 principals 时使用本地 admin。

## 2. RBAC

- reader：GET
- writer：创建 thread、发送 message
- admin：安装 capability

越权返回 403。

## 3. Quota

- maxThreads：按 tenant scope 统计
- maxMessagesPerThread：只统计 message.user，不计 thread.created
- 超限返回 429

## 4. 隔离

- 所有 thread 查询都按 principal.scope 过滤
- 跨 tenant 访问返回 404
- 不同 tenant 的 thread 不会出现在列表

## 5. 测试

- reader 只能读
- writer 可创建
- admin 才能装 capability
- thread quota 429
- message quota 429
- 111 tests pass

## 6. 尚未实现

- OAuth/OIDC
- 动态 token 签发/撤销
- 配额计费/账单
- 管理控制台
