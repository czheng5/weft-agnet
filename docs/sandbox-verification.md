# OS 边界完整验证：可选方法与推荐矩阵

> 问题：WSL 在当前 DSH 内不可用，除了 WSL，还有什么方法能完整验证 Weft 的**内层 OS 边界**？
>
> 结论：**没有单一方法能“完整验证”**；正确做法是“契约测试 + 可丢弃 OS 环境 conformance + 对抗性红队 + CI 回归”四层。WSL 只是其中一种 backend，不是唯一答案。

---

## 1. “完整验证”指什么

不是“跑通一个命令”，而是证明下面这些**都应该失败**的 canary 确实失败，同时合法操作仍然可用：

| 面 | 要验证的边界 |
|---|---|
| 文件系统 | 只允许 workspace 读写；..、绝对路径、符号链接/junction、hardlink、UNC、ADS、8.3、大小写、长路径、\\?\ 都不能逃逸 |
| 网络 | 直接出站、DNS、IPv6、loopback、代理、命名管道按策略拒绝或限制 |
| 进程 | 子进程不能逃逸；job object 能杀进程树；资源限制生效 |
| 权限 | 不能提权、不能读注册表/服务/WMI/COM/计划任务、不能继承敏感句柄 |
| 数据 | 环境变量/secret 不泄漏；stdout/stderr 可审计 |
| 审计 | 每次拒绝有事件；backend 不可用必须 fail-closed；不能静默降级 |
| CUA | 应用 allowlist/锁屏/输入注入是独立治理面，不和 shell 沙箱混为一谈 |

“完整”还包括**跨平台**：Windows 原生、Linux、macOS 各有一套 backend。

---

## 2. 可选方法（按实用性排序）

| # | 方法 | 隔离强度 | 当前可用性 | 适合验证 |
|---|---|---|---|---|
| 1 | VMware/Hyper-V/VirtualBox VM | 强（整机/内核级） | 本机有 VMware；需新建 Windows/Linux VM | 最强 practical：Windows 原生 backend、完整 OS 行为 |
| 2 | Docker/Podman 容器 | 中强（命名空间/seccomp/cgroup） | Docker 已安装但 daemon 未运行 | Linux 命令沙箱、网络/FS/资源限制 |
| 3 | Windows Sandbox | 强（一次性 Windows VM） | 需 Windows Pro/Enterprise + 启用功能 | Windows 原生 canary；不适合自动化长任务 |
| 4 | Native RestrictedToken/AppContainer/Job Object | 中强（进程级） | 需实现 native helper；部分 API 需权限 | Windows 原生 backend 本体 |
| 5 | 远程 Linux + bwrap/nsjail/firejail | 强（namespace） | 需 SSH 主机 | Linux backend、网络/FS 隔离 |
| 6 | CI runner matrix（GitHub Actions） | 强（干净 VM） | 需仓库/CI | 回归、跨平台一致性 |
| 7 | Cloud microVM（Firecracker/gVisor/Kata） | 最强 | 需云/基础设施 | 高风险、多租户、不可信代码 |
| 8 | WSL2 + bwrap/unshare | 强（VM + namespace） | DSH 内不可用；外层可用 | Linux backend 的轻量方案 |
| 9 | Job Object + low integrity only | 弱（仅进程/资源） | 可做 | 进程树/资源，不足以称 OS 边界 |
| 10 | 独立物理测试机 | 最强 | 需硬件 | 最终验收/红队 |

---

## 3. 推荐的四层验证

### L1 契约测试（每天跑，不需要 OS 隔离）

- 路径解析：..、绝对路径、符号链接、junction、UNC、ADS、大小写、长路径。
- 策略：read-only/workspace-write/danger；untrusted/on-request/never；危险命令。
- 审批缓存、fail-closed、审计事件。
- 这些测试不证明 OS 边界，只证明“策略层正确”。

### L2 Backend conformance（每个 backend 在可丢弃环境跑）

- 在 VM/容器/Windows Sandbox 里启动 Weft，选择目标 backend。
- 跑 canary 套件：允许的必须成功，禁止的必须失败，拒绝必须有审计。
- 记录 backend 的 osBoundary=true/false、probe 结果、失败原因。

### L3 对抗性红队（发布前）

- 符号链接/junction/hardlink 逃逸；
- 环境变量/secret 泄漏；
- 子进程/孙进程逃逸；
- 命名管道/COM/WMI/服务/注册表；
- fork bomb/磁盘填充/超时；
- 网络 DNS/代理/loopback/IPv6；
- CUA 敏感应用/锁屏/输入注入。

### L4 CI 回归（每次 PR）

- GitHub Actions matrix：Windows/Linux/macOS；
- 每平台跑 L1 + 对应 backend 的 L2；
- 结果存档；backend 不可用就 fail，不跳过。

---

## 4. 当前环境能做什么

| 方法 | 现在能否做 | 说明 |
|---|---|---|
| workspace-guard 契约测试 | ✅ | 已跑通 22 tests |
| WSL backend probe/fail-closed | ✅ | --sandbox wsl 在 DSH 内显式失败 |
| WSL backend conformance | ⚠️ 需外层/正常主机 | DSH 内 EPERM/E_ACCESSDENIED |
| Docker conformance | ⚠️ 需启动 Docker daemon | 且 DSH 内可能被 named pipe 限制 |
| Windows VM conformance | ✅ 本机有 VMware | 新建 Windows VM，在 VM 内跑 |
| Windows Sandbox | ⚠️ 需启用功能/管理员 | 一次性环境 |
| CI matrix | ⚠️ 需仓库/CI | 适合回归 |
| 远程 Linux | 需主机/凭据 | 强隔离 |

---

## 5. 给 Weft 的推荐路线

1. **现在**：保留 workspace-guard 为 dev backend，明确 osBoundary=false；WSL backend 只做 probe/fail-closed。
2. **M1 验收**：在 **Windows VM**（VMware/Hyper-V）里跑 Windows 原生 backend 的 conformance；在 **Docker 容器**里跑 Linux backend 的 conformance。
3. **M1.5**：把 conformance 套件接 GitHub Actions matrix；每个 PR 跑 L1，nightly 跑 L2。
4. **v1.0 gate**：至少一个 osBoundary=true 的 backend 通过 L2 + L3；否则不宣称“OS 边界”。
5. **长期**：WSL2/bwrap、Windows RestrictedToken/MXC、Docker、远程 Linux 都是可插拔 backend；用同一套 conformance 打分。

---

## 6. 不需要改 DSH 授权

- 上述 VM/容器/CI 都是**外部测试环境**，不是放开 DSH 沙箱。
- 当前 DSH 内继续用 workspace-guard；WSL/Docker 在外层或 VM 里跑。
- 只有当你主动要求“在当前 DSH 内放宽 WSL/Docker 访问”时，才涉及策略例外；不作为默认路径。

---

## 7. 当前实现与运行方式

已实现：

- workspace-guard conformance：通过（路径逃逸/工作区可达/工作区写入）。
- WSL backend：probe/命令构造/fail-closed；DSH 内不可用。
- Docker backend：DockerSandboxBackend，默认镜像 node:24-bookworm-slim。
- conformance.cmd：可在外层 Windows Terminal 跑 Docker canary。

Docker 运行命令（外层终端，Docker Desktop 已启动且镜像已拉取）：

~~~powershell
docker pull node:24-bookworm-slim
.\conformance.cmd --backend docker
~~~

或：

~~~powershell
node --experimental-strip-types scripts/sandbox-conformance.ts --backend docker --docker-image node:24-bookworm-slim
~~~

注意：在 DSH 内，Node 的 child_process 管道会被外层沙箱限制（EPERM），所以 Docker conformance 要放到外层终端跑；这不是 Docker 的问题。

当前 Docker daemon 状态：com.docker.service 为 Stopped，尚未做真实容器 conformance。启动 Docker Desktop 后再跑；不能把“脚本存在”当成“已验证”。

---

## 8. Docker Desktop GUI 的限制

Docker Desktop 的 “Run a new container” 对话框只暴露：

- container name
- ports
- volumes
- environment variables

它**不暴露**：

- command / entrypoint
- --network none
- --read-only
- --cap-drop ALL
- --security-opt no-new-privileges
- --user / pids / memory / cpus

所以 GUI 可以验证 engine、image、container 启动和日志，但不能单独完成 OS 边界 conformance。完整 canary 需要 Docker Desktop 的 Terminal（当前显示 Enable Docker terminal）或 CLI；两者都不是“另开一个外部终端”的必要条件。

---

## 9. DSH 外层对 Docker 的限制

即使 Docker Desktop GUI 已开：

- DSH 里的 Node/Weft 进程连接 dockerDesktopLinuxEngine 仍可能 permission denied（named pipe ACL）。
- GUI 的 Run 对话框可以绕过 CLI，但不能传 conformance 参数。
- 因此“产品自启动 Docker”必须在正常主机上验收；在 DSH 内只能验证 GUI/外层终端，不应把外层限制当成产品缺陷。

---

## 10. 一句话

**WSL 只是 OS 边界 backend 的一个候选；完整验证靠“契约 + 可丢弃 OS 环境 + 红队 + CI”，而不是靠某一个命令。**
