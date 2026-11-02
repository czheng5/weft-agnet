# WSL Conformance (Dedicated Distro / Non-root)

> 日期：2026-11-01  
> 环境：WSL2 weft-sandbox（Ubuntu 24.04 rootfs 导入），用户 weft uid=1001  
> 结果：**PASS（基础）**

## 构建

~~~powershell
docker pull ubuntu:24.04
docker create --name weft-rootfs ubuntu:24.04
docker export weft-rootfs -o D:\dsh_env\tmp\weft-rootfs.tar
New-Item -ItemType Directory -Force D:\dsh_env\wsl\weft-sandbox | Out-Null
wsl --import weft-sandbox D:\dsh_env\wsl\weft-sandbox D:\dsh_env\tmp\weft-rootfs.tar --version 2
wsl -d weft-sandbox -- useradd -m -s /bin/bash weft
~~~

## 命令

~~~powershell
node --experimental-strip-types scripts/sandbox-conformance.ts --backend wsl --wsl-distro weft-sandbox --wsl-user weft --wsl-mount /mnt/d/dsh_env/workspaces/codex_claude_dsh_comb_mod
~~~

## 结果

~~~text
WEFT SANDBOX CONFORMANCE backend=wsl
  PASS path escape is rejected — guard rejected ../weft-escape.txt
  PASS workspace is reachable — /mnt/d/dsh_env/workspaces/codex_claude_dsh_comb_mod
  PASS workspace write works — weft-ok
  PASS non-root identity — uid=1001
  SKIP network egress is denied — not applicable to this backend
  SKIP write outside workspace is denied — not applicable to this backend

RESULT: PASS
~~~

## 覆盖

- 专用 WSL2 distro：weft-sandbox
- 非 root 用户 weft（uid=1001）
- 工作区 bind 视图可达、可写
- WorkspaceGuard 路径逃逸拒绝

## 限制

- WSL 后端不提供 per-command 网络隔离；network/write-outside 检查 SKIP。
- 未覆盖 Windows 原生 backend/CUA。
- WSL 使用 runuser 降权；默认入口需为 root 或具备 runuser 权限。
