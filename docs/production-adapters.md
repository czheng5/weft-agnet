# Production Adapters: S3 / Kubernetes / Nomad

> 状态：v2.5 code-level adapter。真实云/集群联调需要环境凭证与 runner。

## S3 Artifact Store

- src/core/artifact-s3.ts
- 注入 S3ClientLike：
  - putObject
  - getObject
  - headObject
- 内容寻址：prefix/aa/<sha256>
- 幂等 put：已存在不覆盖
- 不绑定 AWS SDK；S3-compatible 客户端可接
- 测试：sha256、幂等、has/get

## Kubernetes

- src/core/worker-launchers.ts
- 生成 batch/v1 Job：
  - deployment/worker labels
  - image
  - command
  - env：
    - secretName/secretKey -> secretKeyRef
    - 普通 value
- launch 调 kubectl apply -f -
- stop 调 kubectl delete job
- 未注入 runner 直接失败，不假装启动

## Nomad

- 生成 batch Job：
  - Datacenters
  - TaskGroups
  - docker image
  - Env
- launch 调 nomad job run -
- stop 调 nomad job stop -purge

## 安全边界

- K8s secret 使用 secretKeyRef，不内联 secret value
- Nomad 的 Env 目前由 caller 显式提供；建议只放非敏感值，敏感值用 Vault/模板
- 日志只保留输出前 300 字符；不打印凭证

## 尚未完成

- 真实 AWS/OSS/MinIO 客户端实现
- K8s RBAC/ServiceAccount/NetworkPolicy
- Nomad ACL/Vault 模板
- 部署回滚/健康检查

## 验收

- 147 tests pass
- fake runner contract 测试 PASS
