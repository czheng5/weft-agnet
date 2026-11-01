# Docker OS 边界 Conformance 结果

> 日期：2026-11-01  
> 环境：Windows + Docker Desktop 4.89（engine 29.7.2），镜像 node:22-bookworm-slim  
> 执行位置：DSH 外层 Windows Terminal（DSH 内 named pipe 被 ACL 限制，不能用）

## 命令

~~~powershell
$env:PATH = "C:\Program Files\Docker\Docker\resources\bin;" + $env:PATH
Set-Location D:\dsh_env\workspaces\codex_claude_dsh_comb_mod
node --experimental-strip-types scripts/sandbox-conformance.ts --backend docker --docker-image node:22-bookworm-slim
~~~

## 结果

~~~text
WEFT SANDBOX CONFORMANCE backend=docker workspace=D:\dsh_env\workspaces\codex_claude_dsh_comb_mod
  PASS path escape is rejected — guard rejected ../weft-escape.txt
  PASS workspace is reachable — /workspace
  PASS workspace write works — weft-ok
  PASS non-root identity — uid=1000
  PASS network egress is denied — exit=7
  PASS write outside workspace is denied — exit=1

RESULT: PASS (docker checks limited to container backend)
~~~

## 验证项

| 检查 | 结果 | 说明 |
|---|---|---|
| 路径逃逸 | PASS | WorkspaceGuard 拒绝 ../weft-escape.txt |
| 工作区可达 | PASS | 容器内 pwd=/workspace |
| 工作区可写 | PASS | bind mount 内写入 weft-ok |
| 非 root | PASS | uid=1000，不是 root |
| 网络出站 | PASS | --network none，fetch 失败 exit=7 |
| 越界写 | PASS | --read-only rootfs，/etc 写入失败 |

## 边界说明

- 这是 **Docker Linux container backend** 的 OS 边界验证；不是 Windows 原生 backend。
- 容器参数：--network none、--read-only、--cap-drop ALL、--security-opt no-new-privileges、--pids-limit 256、--memory 512m、--cpus 1、--user 1000:1000。
- 尚未覆盖：CUA/Windows GUI、WSL backend、Windows RestrictedToken/MXC。
- DSH 内 Weft 进程连接 dockerDesktopLinuxEngine 仍可能 permission denied；这是外层 named pipe ACL，不是 Docker backend 本身。
