# WSL Conformance (Root / Default User)

> 日期：2026-11-01  
> 环境：WSL2 Ubuntu，默认 root 用户  
> 结果：**基础 PASS；非 root 检查 SKIP**

## 命令

~~~powershell
node --experimental-strip-types scripts/sandbox-conformance.ts   --backend wsl --wsl-distro Ubuntu --wsl-user default   --wsl-mount /mnt/d/dsh_env/workspaces/codex_claude_dsh_comb_mod
~~~

## 结果

~~~text
WEFT SANDBOX CONFORMANCE backend=wsl
  PASS path escape is rejected — guard rejected ../weft-escape.txt
  PASS workspace is reachable — /mnt/d/dsh_env/workspaces/codex_claude_dsh_comb_mod
  PASS workspace write works — weft-ok
  SKIP non-root identity — not applicable to this backend
  SKIP network egress is denied — not applicable to this backend
  SKIP write outside workspace is denied — not applicable to this backend

RESULT: PASS (docker checks limited to container backend)
~~~

## 覆盖

- WSL2 VM 内 pwd / 工作区可达
- 工作区 bind 视图内写入
- WorkspaceGuard 路径逃逸拒绝

## 未覆盖 / 限制

- **以 root 运行**：非 root 检查被跳过，不能宣称“非 root 隔离”已验证。
- 网络出站/越界写检查对 WSL 后端跳过；WSL 本身不提供 per-command 网络隔离。
- 未覆盖 Windows 原生 backend/CUA。
- --wsl-user cz0919 报 WSL_E_USER_NOT_FOUND；这是 WSL 用户映射问题，不是路径检查失败。
- 尝试在 Ubuntu 内创建 weft 用户后，wsl -d Ubuntu -u weft 仍报 WSL_E_USER_NOT_FOUND；非 root 路径未打通。
- 改用 WSL 内 runuser（不经 wsl -u）后，Ubuntu/Kali 的 useradd 均报 Permission denied，仍无法创建非 root 用户。
