# OAuth Authorization Code + PKCE

> 状态：v2.5 code-level baseline。浏览器登录 UI/真实 IdP 联调仍属环境项。

## 已实现

- src/core/oauth.ts
  - createPkcePair（S256）
  - OAuthStateStore（一次性、TTL）
  - buildAuthorizationUrl
  - exchangeAuthorizationCode
  - refreshAccessToken
- src/core/jwks.ts
  - JWKS HTTP cache
  - TTL + min refresh throttle
  - 未知 kid 时 refresh
- src/core/oidc.ts
  - jwksRefresh 旋转钩子
  - RS256/384/512、EdDSA
  - iss/aud/exp/nbf
  - jti 撤销
- 测试
  - PKCE challenge
  - state 一次性/过期
  - auth URL 参数
  - token 交换带 code_verifier
  - refresh_token
  - JWKS 旋转 + OIDC 验证

## 安全约束

- token endpoint 必须 http(s)
- code_verifier 只放表单，不写日志
- state 一次性消费
- JWKS 刷新有最小间隔，避免攻击者用随机 kid 打爆 IdP
- 不把 client_secret 打进 README/仓库

## 尚未完成

- Gateway 登录/回调路由
- 真实 IdP 端到端（需要授权服务器）
- refresh token 轮换策略
- token 撤销与 OIDC session logout 联动

## 验收

- 141 tests pass
- 本地 fake IdP 契约测试 PASS
