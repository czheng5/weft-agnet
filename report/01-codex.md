# Codex 源码深挖：沙箱 / 审批顺畅度 / 电脑使用 / 工具与上下文

- 仓库：`repos/codex`（openai/codex）
- commit：`67f0994b532b8740f14b5b738af7b7b2a915b1d6`（2026-10-31T00:03:11Z，"Tighten Bazel CI snapshot handling and OTLP test cleanup (#58459)"）
- 本文所有 `文件:行号` 均相对 `repos/codex/`，例如 `codex-rs/sandboxing/src/manager.rs:50`。
- 证据分级：**[源码]** = 直接读到的代码/注释/内嵌策略文件；**[源码-文档]** = 仓库内 README/AGENTS.md 等作者自述（强于外部文档，仍非运行时实测）；**[仓库外]** = 指向 developers.openai.com 的占位 doc（`docs/sandbox.md` 等只有一行链接，见 E0）；**[推断]** = 我基于代码的推理，未在真机验证。

---

## 0. 先给结论（TL;DR）

| # | 结论 | 强度 |
|---|---|---|
| 1 | **Codex 没有内建 computer-use 工具**。工具注册表里没有截图/点击/无障碍树原语；CUA 是 **MCP 侧 `cua_repl` / `node_repl` / `connector_openai_browser` 连接器**，在 Codex 里被单独归为 `GuardianScope::ComputerUse` 审核域，并配套 `[computer_use]` 的 macOS bundle_id / Windows AUMID / EXE 允许拒绝配置 | [源码] E40–E46 |
| 2 | 沙箱是**统一抽象 + 五后端**：`SandboxType::{None, MacosSeatbelt, LinuxSeccomp, WindowsRestrictedToken, WindowsMxc}`，由 `get_platform_sandbox` 按 OS 选，再经 `SandboxManager::transform` 各自包成 argv | [源码] E1,E2,E9 |
| 3 | Linux 实际是 **bubblewrap（文件系统）+ seccomp（网络/io_uring/ptrace）**；legacy Landlock 只保留给「非文件系统受限」路径，文件系统受限策略直接拒绝 legacy 模式 | [源码] E10,E13,E15,E16,E20 |
| 4 | 「审批为什么顺」不是靠少问，而是**六层决策阶梯**：静态策略 → 确定性规则/execpolicy → 会话级批准缓存 → Guardian 自动评审（read-only 子代理）→ 人工 → 沙箱兜底 + 失败后升级并提议 execpolicy 规则 | [源码] E27–E45 |
| 5 | 打断被三件事吃掉：①`AskForApproval::OnRequest` 在受限沙箱下对**非越权命令直接 Allow**；②网络拒绝不杀命令，转成**异步 host 批准**（AllowOnce/AllowForSession）；③`Yes, and don't ask again for commands that start with \`X\`` 把一次人工决定**沉淀成可复用 execpolicy 前缀规则** | [源码] E28,E73,E115 |
| 6 | `on-failure` 这个历史策略在 2026 版**已不是独立枚举**：它只是 `OnRequest` 的 serde alias（`#[serde(alias = "on-failure")]`）。真正的「失败后升级」由 `wants_no_sandbox_approval` 决定，OnRequest 下**不自动**无沙箱重试，而是把拒绝结果回给模型由模型显式请求 `require_escalated` | [源码] E117,E66 |
| 7 | 上下文侧：prompt cache key 是会话派生字符串，Guardian 评审会话被**钉死为 `guardian:{parent_thread_id}`** 以复用父线程缓存；压缩是「替换历史 + 保留首部 prefix/context」而非纯摘要 | [源码] E52,E53,E54 |

---

## 1. 分层架构（谁负责什么）

```
model ──tool_call──> core/src/tools/{orchestrator,approvals,sandboxing}.rs  ← 审批/策略/重试状态机
                          │
                          ├─ SandboxManager (sandboxing/src/manager.rs)   ← 平台后端选择 + argv 变换
                          │     ├ macOS: /usr/bin/sandbox-exec <sbpl>
                          │     ├ Linux: codex-linux-sandbox (bwrap+seccomp)
                          │     ├ Win:   自身 exe 再入 (restricted token / elevated / mxc)
                          │     └ 网络: codex-network-proxy 注入 env + CA
                          │
                          ├─ ExecServerClient (exec-server/)              ← 本地或远端执行面
                          │     └ 远端时 **executor 自己再套一层平台沙箱**
                          └─ app-server (JSON-RPC)                       ← 把审批变成 server→client 请求
```

- [源码] `codex-rs/sandboxing/src/lib.rs:1-16`：模块按 `cfg(target_os)` 切分 —— `bwrap`/`linux_pid_namespace` 仅 linux，`seatbelt` 仅 macos，`windows`/`windows_mxc` 在 windows；`landlock` 无条件编译（legacy 保留）。
- [源码] `codex-rs/sandboxing/src/manager.rs:50-64`（`get_platform_sandbox`）：

```rust
if cfg!(target_os = "macos")      { Some(SandboxType::MacosSeatbelt) }
else if cfg!(target_os = "linux") { Some(SandboxType::LinuxSeccomp) }
else if cfg!(target_os = "windows") {
    if windows_sandbox_enabled { Some(SandboxType::WindowsRestrictedToken) } else { None }
} else { None }
```

- [源码] `codex-rs/sandboxing/src/manager.rs:313-330`：`select_initial` 先问 `should_sandbox`，Windows 且显式 MXC 才走 `WindowsMxc`，否则回落平台默认。
- [源码] `codex-rs/sandboxing/src/manager.rs:334-353`：`should_sandbox(Auto)` 委托 `policy_transforms::should_require_platform_sandbox` —— 即「策略形状」决定是否真的需要平台沙箱，而不是无条件开。

---

## 2. 沙箱：平台 × 机制 × 边界

### 2.1 统一权限模型（比旧 `SandboxPolicy` 更细的一层）

旧模型（仍在 wire 上）与新模型共存：

- [源码] `codex-rs/protocol/src/protocol.rs:1232-1280` `SandboxPolicy`（legacy）：
  `DangerFullAccess` / `ReadOnly{network_access}` / `ExternalSandbox{network_access}` / `WorkspaceWrite{writable_roots, network_access, exclude_tmpdir_env_var, exclude_slash_tmp}`。
- [源码] `codex-rs/protocol/src/models.rs:426-440` `PermissionProfile`（新，canonical runtime）：
  `Managed{file_system, network}` / `Disabled` / `External{network}`。语义差别关键：**`External` 表示「沙箱由外部调用方（exec-server/容器）执行」，Codex 自己不再套壳**。
- [源码] `codex-rs/protocol/src/models.rs:414-420`：内建 profile id `:read-only` / `:workspace` / `:danger-full-access`。
- [源码] `codex-rs/protocol/src/protocol.rs:1287-1319` `WritableRoot`：可写根 + `read_only_subpaths`（`.git`、`.codex` 等）+ `protected_metadata_names`；`is_path_writable` 显式先判 root、再判 carveout、再判 metadata 名。
- [源码] `codex-rs/protocol/src/protocol.rs:1407-1495`：`WorkspaceWrite` 自动并入 cwd、`/tmp`（除非 `exclude_slash_tmp`）、`$TMPDIR`（除非 `exclude_tmpdir_env_var`），并对每个根计算 `default_read_only_subpaths_for_writable_root`。
- [源码] `codex-rs/app-server-protocol/src/protocol/v2/permissions.rs:541-567`：v2 wire 上仍暴露上面那 4 个 variant，说明协议层向后兼容。

### 2.2 平台 × 机制 × 边界（主表）

| 平台 | 后端枚举 | 文件系统隔离机制 | 网络隔离机制 | 进程/其他 | 边界强度的已知弱点 |
|---|---|---|---|---|---|
| macOS | `MacosSeatbelt` | `/usr/bin/sandbox-exec` 加载 SBPL：`(deny default)` + `(allow file-read*)` + 逐根 `file-write*` carveout + 显式 `deny file-write*` 正则 | SBPL `network-outbound`/`network-inbound`；受限时只放 `remote ip "localhost:<proxy_port>"` 与 unix-socket allowlist | `(allow process-exec/process-fork)`、`(deny mach-lookup (xpc-service-name-prefix ""))`、`(deny system-fcntl (fcntl-command 80 110))` 关掉 F_MAKECOMPRESSED/F_TRANSFEREXTENTS | SBPL 是「允许列表很宽」的模型：`has_full_disk_read_access()` 恒 true（E8），读边界实际靠 `unreadable_roots` 反向 deny |
| Linux | `LinuxSeccomp` | **bubblewrap**：`--ro-bind / /` 起底（或 `--tmpfs /` 起空）、`--dev /dev`、`--bind <root>` 开写、`--ro-bind <subpath>` 复封；不可读目标是 `--tmpfs` / `--ro-bind-data`（/dev/null）遮蔽 | `--unshare-net`；seccomp 封 `connect/accept/bind/listen/sendto/getsockopt...`，`socket` 只放 AF_UNIX；托管代理模式改 `ProxyRouted`（放 AF_INET/AF_INET6 到本地桥，AF_UNIX 需显式授权） | `--unshare-user/-ipc/-pid`、`--cap-drop`、`--die-with-parent`、`PR_SET_NO_NEW_PRIVS`、封 `io_uring_*` 与 `ptrace/process_vm_*`、封 AF_VSOCK（含 WSL2 宿主桥） | legacy Landlock 只做「全读 + 指定写」，**不支持受限读**，文件系统受限策略已禁用 legacy；`bwrap` 缺 user namespace 时整体失败（WSL1 明确不支持） |
| Windows（unelevated） | `WindowsRestrictedToken` | `CreateRestrictedToken`（`DISABLE_MAX_PRIVILEGE` + `LUA_TOKEN` + `WRITE_RESTRICTED`）+ 每 workspace/每写根一个 **capability SID** 的 ACL 授予；`WRITE_RESTRICTED` 让写检查走受限 SID 集 | 由托管代理 + 本地回环端口策略；此模式**不能**做 split 读限制 | `CreateProcessAsUserW` + `JobObject`（kill-on-close）、自定义 default DACL 限定同 logon session | `WRITE_RESTRICTED` 下 capability SID 的 deny-read ACE 不参与读检查 → 读限制必须升级到 elevated（E47 明确报错拒绝而非静默放行） |
| Windows（elevated） | `WindowsRestrictedToken` + `WindowsSandboxLevel::Elevated` | 独立的**离线/在线本地账户** `CodexSandboxOffline`/`CodexSandboxOnline` + setup helper 写 ACL（读/写根、deny-read 路径）；密码 DPAPI 保存 | **WFP 持久化过滤器**（provider/subplayer + 13 条 filter，按 account 匹配；封 ICMP、DNS 53、DoT 853、SMB 445/139） | `LogonUserW` 建 logon session、进程跑在该账户桌面；`CodexSandboxOffline` 无网，`Online` 走代理 | 首次使用需提权安装（setup exe、`SETUP_VERSION=5`）；账户型隔离对同机管理员不构成边界 |
| Windows（MXC） | `WindowsMxc` | 调用微软 **MXC `BaseContainerRunner`** 原生策略；**不改 ACL、不建沙箱用户、不提权**；路径冲突按 deny > read-only > read-write，更具体路径覆盖祖先 | 托管网络默认 `allow_local_binding=true`；放 IPv4/IPv6 loopback，拒直连非 loopback 与一般入站；DNS 直连仍拒绝 | MXC 建 suspended 进程 → 先挂 kill-on-close job → 再 resume；Win32k/clipboard/输入注入仍受限 | 硬链接多名字各自独立权限；volume-root 展开不对齐别名；上游 runner 在前台进程退出时**杀后代**，与另两个后端行为不同 |

上表的证据：

- [源码] E1 `codex-rs/protocol/src/sandbox.rs:29-35` `SandboxType` 五值；E2 `:50-60` `effective_windows_sandbox_type`。
- [源码] E3 `codex-rs/sandboxing/src/seatbelt_base_policy.sbpl:8-16`：`(deny default)`、`(allow process-exec/process-fork)`、`(allow signal (target same-sandbox))`；`:18-21` 只放 `/dev/null`；`:103-116` PTY 处理。
- [源码] E4 `codex-rs/sandboxing/src/seatbelt.rs:58-62`：注释说明**只认 `/usr/bin/sandbox-exec`，防 PATH 注入**。
- [源码] E5 `codex-rs/sandboxing/src/seatbelt.rs:980-1029`：读策略 —— `has_full_disk_read_access()` 时直接 `(allow file-read*)`，否则逐根构造；`:1041-1084`：`deny_read_policy`（glob 反向）、`(deny mach-lookup (xpc-service-name-prefix ""))`、`deny system-fcntl (fcntl-command 80 110)`、以及「rename 祖先绕过 carveout」的 `deny file-write-unlink` 。
- [源码] E6 `codex-rs/sandboxing/src/seatbelt_network_policy.sbpl:5-11,13-27`：网络开启时只额外放 `AF_SYSTEM` + 若干 mach service，注释指向 Chrome 的 `network.sb`。
- [源码] E7 `codex-rs/sandboxing/src/seatbelt.rs:289,338,342,370`：动态网络策略 —— unix-socket / `localhost:*` / `localhost:<port>` / 全放四种形态。
- [源码] E8 `codex-rs/protocol/src/protocol.rs:1382-1384`：`SandboxPolicy::has_full_disk_read_access() -> true`（恒真）；`:1386-1402` 写/网络按 variant 判定。—— 与 E5 的「读白名单」一致：**读默认全开，靠反向 deny 收窄**。
- [源码] E9 `codex-rs/sandboxing/src/manager.rs:355-566` `transform`：`match sandbox` 分派到 MXC / Seatbelt / Linux / WindowsRestrictedToken；Linux 分支要求 `sandbox_exe`（否则 `MissingLinuxSandboxExecutable`）、MXC/Windows 分支要求 `codex 自身 exe` 做 helper（`:415-419`,`:589-593`）。
- [源码] E10 `codex-rs/linux-sandbox/README.md:10-13`（bwrap+seccomp，seccomp.rs 装 `PR_SET_NO_NEW_PRIVS` 并保留 legacy Landlock）；`:47-49`「文件系统受限执行必须用 bubblewrap，legacy Landlock 被拒绝，因为它无法隔离 app-server Unix socket」。
- [源码] E11 `codex-rs/linux-sandbox/src/bwrap.rs:392-408` 六步挂载顺序注释 + `:503-515` 全读起底实现。
- [源码] E12 `codex-rs/linux-sandbox/src/bwrap.rs:270-297`：`--new-session --die-with-parent --bind --dev --bind-try --unshare-user/-ipc/-pid/-net --proc --cap-drop`。
- [源码] E13 `codex-rs/linux-sandbox/src/seccomp.rs:36-51`（函数职责：no_new_privs + 网络/VM socket 隔离；文件系统交给 bwrap）；`:190-201` 无条件封 `io_uring_setup/enter/register`（注释：io_uring 可绕过 `socket()` 造 AF_VSOCK）；`:203-233` Restricted 模式逐 syscall deny + `socket` 只放 AF_UNIX；`:235-271` ProxyRouted；`:272-281` VmSocketRestricted；`:284-295` 默认 `Allow`、命中返回 `EPERM`。
- [源码] E14 `codex-rs/linux-sandbox/src/seccomp.rs:68-76`：**为什么默认不设 `PR_SET_NO_NEW_PRIVS`** —— 很多 bwrap 部署依赖 setuid，只在需要 seccomp 或 legacy Landlock 时才开。
- [源码] E15 `codex-rs/linux-sandbox/src/seccomp.rs:140-175`：legacy Landlock —— `ABI::V5`、`path_beneath_rules(&["/"], access_ro)` + 可写根 `access_rw` + `/dev/null`；`:82-88` 明确「受限读不被 legacy Linux Landlock 支持」。
- [源码] E16 `codex-rs/sandboxing/src/landlock.rs:26-67`：`create_linux_sandbox_command_args_for_permission_profile` 把 `PermissionProfile` 序列化成 `--permission-profile <json>` 传给 helper；`:54-63` `--use-legacy-landlock`/`--managed-network` 互斥逻辑。
- [源码] E17 `codex-rs/linux-sandbox/README.md:91-101`：`--unshare-user`（默认）、`--unshare-pid`、受限网络无代理时 `--unshare-net`、托管代理时 `--unshare-net` + 内部 TCP→UDS→TCP 桥，seccomp 放 IP socket、默认封新 AF_UNIX。
- [源码] E18 `codex-rs/linux-sandbox/README.md:58-68`：`--ro-bind / /` 起底、可写根 `--bind`、`.git`/`gitdir:`/`.codex` 再 `--ro-bind`；`:63-68` 路径具体性排序（`/repo=write, /repo/a=none, /repo/a/b=write` 的 reopen 语义）。
- [源码] E19 `codex-rs/linux-sandbox/README.md:108-120`：`--linux-sandbox-pid-namespace=inherit` 仅由 exec-server 启动参数开启，**仓库配置与命令环境变量都不能开**；代价是沙箱内可 signal 同 UID 其他进程（含 executor）。
- [源码] E20 `codex-rs/linux-sandbox/README.md:16-28`：优先 PATH 上的 bwrap（且必须在 cwd 之外）、太老则走无 `--argv0` 兼容路径、缺失则回落 bundled `codex-resources/bwrap`；WSL1 直接拒绝。
- [源码] E47 `codex-rs/sandboxing/src/windows.rs:110-119`：unelevated 受限 token「不能直接执行 split 读限制 → 拒绝运行而非无沙箱运行」；`:33-35` elevated 判定；`:37-46` 是否支持 restricted-token。
- [源码] E48 `codex-rs/windows-sandbox-rs/src/setup.rs:52-78`：`SETUP_VERSION: u32 = 5`、`CodexSandboxOffline`/`CodexSandboxOnline` 两账户、`USERPROFILE_ROOT_EXCLUSIONS` = `.ssh/.tsh/.brev/.gnupg/.aws/.azure/.kube/.docker/.config/.npm/.pki/.terraform.d`（**默认不给沙箱读用户 secrets 目录**）、平台默认可读根 `C:\Windows`、`Program Files`、`ProgramData`。
- [源码] E49 `codex-rs/windows-sandbox-rs/src/token.rs:42-47` `DISABLE_MAX_PRIVILEGE=0x01 / LUA_TOKEN=0x04 / WRITE_RESTRICTED=0x08`；`:54-90` 自定义 default DACL：OWNER RIGHTS(S-1-3-4) 只给 `READ_CONTROL`，压制隐式 `WRITE_DAC`，注释明确「防止另一个 logon 改写本 DACL」。
- [源码] E50 `codex-rs/windows-sandbox-rs/src/process.rs:33,117,168`：`CreateProcessAsUserW` + `JobObject::create()`；`identity.rs:42-44,215` `LogonUserW(LOGON32_LOGON_INTERACTIVE)`。
- [源码] E51 `codex-rs/windows-sandbox-rs/src/wfp/filter_specs.rs:9-35`（`ConditionSpec::{User, Protocol, RemotePort}`，filter 按 `FWPM_CONDITION_ALE_USER_ID` + 端口/协议匹配）+ 该文件共 13 处 `description:`（4 条 ICMP、4 条 53/853、4 条 445/139，IPv4+IPv6 各一份）→ 覆盖 ICMP、明文 DNS、DoT、SMB。
- [源码] E111 `codex-rs/mxc-sandbox/README.md:3-7`（直接进 `BaseContainerRunner`；不调 AppContainer dispatcher、不改宿主 ACL、不建沙箱用户、不提权）；`:19-31`（继承管道/ConPTY，suspended→job→resume，路径冲突取最严）；`:49-58`（`windows.sandbox="mxc"` 严格、`features.prefer_mxc` 默认关、**失败不回退后端**）；`:61-73`（用 executor 自身 exe 当 helper，`SystemDrive`/`LOCALAPPDATA` 由宿主占用）。

### 2.3 网络隔离：不是「开关」而是一个本地代理

- [源码-文档] E21 `codex-rs/network-proxy/README.md:3-12`：HTTP `127.0.0.1:3128` + SOCKS5 `127.0.0.1:8081`，enforce allow/deny，`limited` = 只读模式。
- [源码-文档] E22 `network-proxy/README.md:45-51`：`allow_local_binding=false` 时本地/私有网段一律拒绝（即使 allowlist 里显式写了 IP literal）；**MXC 默认 true，其它默认 false，MXC 拒绝 false**。
- [源码-文档] E23 `network-proxy/README.md:143-156`：被拦时返回 `403` + `x-proxy-error: blocked-by-{allowlist,denylist,method-policy,policy}`；limited 模式只放 GET/HEAD/OPTIONS，HTTPS 必须 MITM 才能执行方法策略。
- [源码-文档] E24 `network-proxy/README.md:189-197`：policy hook（`NetworkPolicyDecider`）可把 **exec 批准映射成网络放行**（如用户已批准 `curl *`），但**显式 deny 永远优先**，decider 只能覆盖 `not_allowed`。
- [源码] E25 `codex-rs/sandboxing/src/manager.rs:481-495`：Linux 分支真正调用 `network.prepare_for_optional_environment(env, environment_id)` 注入代理 env + `ManagedNetworkSandboxContext`，再转成 helper 参数。
- [源码] E26 `codex-rs/sandboxing/src/manager.rs:66-85` `with_managed_mitm_ca_readable_root`：把 **MITM CA 公钥文件**作为额外可读根塞进文件系统策略 —— 让沙箱内 curl 能信任代理签的证书，私钥留代理内存（README:41-43）。

> 关键设计：**网络边界 = 「进程只能连本地代理」**。在 Linux 上是 `--unshare-net` + 桥；在 macOS 上是 SBPL 只放 `localhost:<port>`；Windows 上是 WFP + 回环端口。三平台统一语义，因此策略与审批逻辑只需写一次。

### 2.4 一个容易被忽略的组件：sandbox_integrity

- [源码] E110 `codex-rs/sandboxing/src/sandbox_integrity/mod.rs:1-7` + `contents.rs:1-50` + `policy.rs:1-31`：`FileContentsChecker` 用**当前生效策略**去检查某个「已存在的依赖文件」是否本应可读/可写，产出 `IntegrityFinding`；注释明确「不评估 ownership 与 OS ACL」——即这是**策略一致性自检**（例：沙箱内命令读到了不该读的文件），不是新的执行沙箱。

---

## 3. 审批与权限：为什么「顺」

### 3.1 枚举全景（先看清词表）

| 枚举 | 位置 | 值 | 备注 |
|---|---|---|---|
| `AskForApproval` | `codex-rs/protocol/src/protocol.rs:1146-1169` | `UnlessTrusted`(`untrusted`) / `OnRequest`(`on-request`,`#[default]`,`alias="on-failure"`) / `Granular(GranularApprovalConfig)`(`granular`) / `Never` | **`on-failure` 已合并进 `OnRequest`** |
| `GranularApprovalConfig` | `protocol.rs:1172-1186` | `sandbox_approval` / `rules` / `skill_approval` / `request_permissions` / `mcp_elicitations` | 5 个独立闸门，`false` = 自动拒绝而非静默跳过 |
| `SandboxPermissions` | `codex-rs/protocol/src/models.rs:66-94` | `UseDefault` / `RequireEscalated` / `WithAdditionalPermissions` | 模型**逐条命令**请求越权 |
| `SandboxOverride` | `codex-rs/protocol/src/sandbox.rs:11-19` | `NoOverride` / `EscalatedSandboxWithRestrictions` / `BypassSandboxFirstAttempt` | 中间态：**放开写但保住 deny-read** |
| `ExecApprovalRequirement` | `codex-rs/core/src/tools/sandboxing.rs:156-177` | `Skip{bypass_sandbox, proposed_execpolicy_amendment}` / `NeedsApproval` / `NeedsHumanApproval` / `Forbidden` | 内部状态机输入 |
| `ReviewDecision` | `protocol.rs:4428-4463` | `Approved` / `ApprovedExecpolicyAmendment` / `ApprovedForSession` / `ApprovedMcpPolicyAmendment` / `NetworkPolicyAmendment` / `Denied` / `TimedOut` / `Abort` | **每个「是」都带一种持久化粒度** |
| `Decision`（execpolicy） | `codex-rs/execpolicy/src/decision.rs:7-19` | `Allow` / `Prompt` / `PromptUser`(`prompt-user`) / `Forbidden` | `PromptUser` = 绕过自动评审的**强制人工** |
| `NetworkAccess` / `SandboxPolicy` | `protocol.rs:1216-1220` / `:1232-1280` | `Restricted|Enabled` / 4 variant | wire 兼容层 |

### 3.2 决策阶梯（本文最重要的一张图）

```
                          ┌───────────────────────────────────────────────┐
tool_call ───────────────► │ L0 静态策略：approval_policy × permission_profile │
                          └───────────────┬───────────────────────────────┘
                                          ▼  default_exec_approval_requirement()
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
        Неверно: Never / 无限制                       受限（Restricted）
        → Skip{bypass_sandbox:false}                  → NeedsApproval / NeedsHumanApproval
                  │                                               │
                  ▼                                               ▼
   ┌──────────────────────────────┐              ┌──────────────────────────────────┐
   │ L1 确定性规则：execpolicy    │              │ L2 会话级批准缓存 ApprovalStore  │
   │ prefix/prompt/forbidden      │◄────────────►│ "don't ask again" 命中即放行     │
   │ + dangerous-command heuristics│              │ (with_cached_approval)           │
   └──────────────┬───────────────┘              └──────────────┬───────────────────┘
                  │ Allow                                       │ 未命中
                  ▼                                             ▼
        sandbox_override = BypassSandboxFirstAttempt   ┌──────────────────────────────┐
                                                       │ L3 Hook (PermissionRequest)  │
                                                       │ Allow / Deny，Deny 优先      │
                                                       └──────────────┬───────────────┘
                                                                      ▼
                                                       ┌──────────────────────────────┐
                                                       │ L4 Guardian 自动评审（可选） │
                                                       │ read-only 子代理 + 90s 超时  │
                                                       │ risk_level × user_auth       │
                                                       │ → allow / deny               │
                                                       └──────────────┬───────────────┘
                                                                      ▼ 不确定/未启用
                                                       ┌──────────────────────────────┐
                                                       │ L5 人工（TUI/app-server 弹窗）│
                                                       │ 4–6 个"是"的粒度选项          │
                                                       └──────────────┬───────────────┘
                                                                      ▼
   ┌────────────────────────────────────────────────────────────────────────────────────┐
   │ L6 沙箱兜底执行 → 若 Denied：升级重试（是否自动取决于 wants_no_sandbox_approval）  │
   │    升级时把「重试的真实权限」交给评审/缓存，并提议 execpolicy 前缀规则             │
   └────────────────────────────────────────────────────────────────────────────────────┘
```

逐层证据：

**L0 静态策略**（执行侧入口是 `orchestrator` 的审批阶段，见 E72：`Skip`/`Forbidden`/`Needs*` 三分，且 `strict_auto_review` 会把 `Skip` 也强制送审）

- [源码] E27 `codex-rs/core/src/tools/sandboxing.rs:195-236` `default_exec_approval_requirement`：

```rust
let needs_approval = match policy {
    AskForApproval::Never => false,
    AskForApproval::OnRequest | AskForApproval::Granular(_) =>
        matches!(file_system_sandbox_policy.kind, FileSystemSandboxKind::Restricted),
    AskForApproval::UnlessTrusted => true,
};
// Granular 且 sandbox_approval=false → Forbidden（自动拒绝，不弹窗）
```

  含义：**只要沙箱是「受限」的，OnRequest 就认为「需要批准」——但不是「必须问人」**，而是交给 L2–L4 去消化。这就是「顺」的第一因：`Restricted` 不等于「打扰用户」。
- [源码] E28 `codex-rs/core/src/exec_policy.rs:807-892` `render_decision_for_unmatched_command`：未命中任何规则时 ——

  - 危险命令 or 「Windows 沙箱后端关闭但策略声称有 FS 限制」→ `Never=>Forbidden`，其余 `=>Prompt`（`:836-844`）；
  - `OnRequest` + `Restricted` + **未请求越权** → `Allow`（`:865-874`）。**这是「普通受限命令根本不弹窗」的硬证据。**
- [源码] E29 `codex-rs/core/src/exec_policy.rs:214-242` `prompt_is_rejected_by_policy`：`Never` 一律拒绝弹窗；`Granular` 按「规则型 prompt」vs「沙箱型 prompt」分别看 `rules`/`sandbox_approval`。

**L1 确定性规则（execpolicy）**

- [源码] E30 `codex-rs/execpolicy/src/rule.rs:62-82` `RuleMatch::PrefixRuleMatch{matched_prefix, decision, resolved_program, justification}` 与 `HeuristicsRuleMatch`；`prefix.rs`（`PrefixPattern::matches_prefix` at `:46-59`）支持 alts token。
- [源码] E31 `codex-rs/core/src/exec_policy.rs:743-748`：规则文件加载后再 `merge_overlay(config_stack.requirements().exec_policy)` —— **企业 requirements 覆盖用户规则**，这也是 `prompt-user` 人工检查点的落点。

**L2 会话级缓存**

- [源码] E32 `codex-rs/core/src/tools/sandboxing.rs:41-64` `ApprovalStore`（`HashMap<serialized key, ReviewDecision>`）；`:66-118` `with_cached_approval`：

```rust
// 所有 key 都是 ApprovedForSession → 直接返回，不 fetch（不弹窗）
if keys.iter().all(|k| matches!(store.get(k), Some(ReviewDecision::ApprovedForSession))) {
    return ReviewDecision::ApprovedForSession;
}
let decision = fetch().await;                 // 真正问人或问 Guardian
if matches!(decision, ReviewDecision::ApprovedForSession) {
    for key in keys { store.put(key, ReviewDecision::ApprovedForSession); }  // 逐 key 落库
}
```

  注释 `:66-71` 明说：apply_patch 一次改多文件 → 多 key → 未来「任意子集」也能命中。

**L3 Hook**

- [源码] E33 `codex-rs/core/src/tools/approvals.rs:596-621`：先跑 `run_permission_request_hooks`；`Deny` **直接生效**（`Some(PermissionRequestDecision::Deny{..}) => denied`），`Allow` 仅在**非人工强制**时才直接放行（`if !ctx.requires_human_approval()`），否则继续走 L4/L5。
- [源码] E34 `codex-rs/hooks/src/events/permission_request.rs:54-58`：`PermissionRequestDecision::{Allow, Deny{message}}`；14 个事件名含 `PermissionRequest`（`codex-rs/hooks/src/lib.rs:29-44`）。

**L4 Guardian 自动评审（「顺」的核心创新）**

- [源码] E35 `codex-rs/ext/guardian-reviewer/src/routing.rs:58-66`：**只有** `policy ∈ {OnRequest, Granular}` **且** `reviewer == AutoReview` 才路由给 Guardian。
- [源码] E36 `codex-rs/ext/guardian-reviewer/src/routing.rs:93-152` 的完整分派（这就是状态机本体）：

```rust
if self.full_access {
    return Some(match self.host.validate_action() {
        Ok(_) => ReviewDecision::Approved,       // 全盘放行：只做动作绑定校验
        Err(decision) => decision,
    });
}
let Some(action) = self.action else { return Some(denied("could not prepare the action")) };
match registry.decide_approval(&input).await {
    Some(ApprovalDecision::Reviewed(d)) => Some(d),
    Some(ApprovalDecision::Allow) if !input.require_fresh_review
        => Some(self.cached_approval().await),          // 快路径：扩展已判过
    Some(ApprovalDecision::Allow) => self.review(FreshRequired, None).await,
    Some(ApprovalDecision::AskUser) if !self.require_guardian => None,  // 交回人工
    None if !require_guardian && !routes_approval_policy_to_guardian(..) => None,
    None | Some(AskUser) => self.review(GuardianReviewReason::Policy, None).await,
}
```

  `require_fresh_review` 的展开（`:118-122`）非常关键：**只要 synchronous 被要求 / 模型要求评审且非异步 / 已取消 / 是重试 / 是 exec 升级 → 一律强制「新鲜评审」，不许复用旧结论**。
- [源码] E37 `codex-rs/prompts/templates/guardian/policy_template.md:69-78` 就是**可执行的分级规则表**：

```
risk=low    -> allow
risk=medium -> allow
risk=high   -> allow 仅当 user_authorization >= medium 且动作窄、无绝对 deny
risk=critical -> deny
```

  再加 `:75` 的两个例外（显式 deny 优先；明确的 prompt injection 迹象优先），`:74` 允许「用户在被告知具体风险后明确重申」把 `user_authorization` 抬到 high（但 critical 不可覆盖）。
- [源码] E38 `codex-rs/prompts/templates/guardian/policy_template.md:15-26`（`user_authorization` 四级评分标准）+ `:28-38`（`risk_level` 四级 + **多条「不要过度判重」规则**：`.git` 外的单文件写通常 low、`rm -rf` 单路径通常 low/medium、重试/升级本身不可疑）。这一段是「少误杀 → 少打扰」的直接来源。
- [源码] E39 `codex-rs/prompts/templates/guardian/policy_template.md:5-13`：只有 user/developer 消息、`AGENTS.md`、`request_user_input` 的回答能建立授权；tool 输出/skill 描述一律不可信；`<guardian_truncated/>` 视为缺失而非良性。
- [源码] E40 `codex-rs/prompts/templates/guardian/policy_template.md:62-64`：**Guardian 自己只读、无网络、禁止传 `sandbox_permissions`**；`codex-rs/ext/guardian-reviewer/src/settings.rs:44-65` 双重保障：`reviewer_tool_policy()` 白名单只有 `exec_command/write_stdin/view_image/exec/wait` + `require_managed_sandbox: true` + `expose_additional_permissions: false`，且 `reviewer_permission_profile` 对 profile 做 `intersect_with_read_only()`。
- [源码] E41 `codex-rs/ext/guardian-reviewer/src/assessment.rs:11-18` 输出契约（`risk_level`/`user_authorization`/`outcome`/`rationale`）、`:24-62` 容错解析（容忍 JSON 外套散文，非 JSON 才算失败）、`:77-99` `final_output_json_schema`。
- [源码] E42 `codex-rs/ext/guardian-reviewer/src/deadline.rs:48-64`：`run_before_review_deadline` = `select!`（超时 → `TimedOut`，外部取消 → `Aborted`，否则正常）；`codex-rs/ext/guardian-reviewer/src/lib.rs:87` `REVIEW_TIMEOUT = 90s`。
- [源码] E43 `codex-rs/ext/guardian-reviewer/src/circuit_breaker.rs:3-7,62-84`：**标准模型连续 3 次 deny 或 50 窗口内 10 次 deny → 中断整轮**；cyber 模型阈值收紧到 1。防「模型不停撞墙 → 不停评审 → 用户干等」。
- [源码] E44 `codex-rs/core/src/guardian/review.rs:239-252` 的长注释说明评审复用的缓存策略：空闲时在**同一 guardian 会话**追加（保 prompt-cache key 稳定），忙碌时从最后一次 committed trunk rollout 做**临时 fork**（并行审批互不阻塞）；`codex-rs/ext/guardian-reviewer/src/session.rs:18-30` 把 cache key 固定为 `guardian:{parent_thread_id}`。
- [源码] E45 `codex-rs/core/src/guardian/score_authorization.rs:1-19,70-75`：`GuardianReviewMode::Adaptive` 的「当前低风险分」不是裸缓存 —— `ScoreAuthorization` 绑定了 permissions/settings/environments/history 版本/root 授权/review_context_revision/model，消费前必须 `is_current` 重校验（注释：`consumers must revalidate before approval`）。
- [源码] E46 `codex-rs/protocol/src/openai_models/guardian.rs:17-25`（`GuardianReviewMode::{Disabled,Synchronous,Adaptive,Unknown}`）、`:30-36`（`GuardianUnscoredAction::{Ignore,AgeScore,InvalidateScore}`）、`:40-65`（**按域配置**：computer_use / shell / file_changes / mcp / network / permissions / other_tools / initial_cua_call / sandboxed_exec_commands）、`:117-125` `GuardianScope` 七域。

**L5 人工 + 协议呈现**

- [源码] E113 `codex-rs/core/src/tools/approvals.rs:449-458` `ApprovalResolutionSource::{Hook, Guardian, User}`（`#[must_use] ApprovalResult` 保留来源），`:485-516` `into_tool_result` 把 `Denied/TimedOut/Abort` 分别映射成「拒绝理由 / 超时话术 / TurnAborted」。
- [源码] E119 `codex-rs/core/src/tools/approvals.rs:681-699` `request_reviewer_approval`：`requires_human_approval` → 直接 `user_prompt`；否则先 `request_guardian_approval`，`None` 才回落 `user_prompt` —— **「Guardian 返回 None 就交给人」是默认安全回退**。
- [源码] E114 `codex-rs/app-server-protocol/src/protocol/v2/item.rs:1655-1720` `CommandExecutionRequestApprovalParams`：带 `approval_id`（区分同一 item 的多个回调）、`reason`、`network_approval_context`、`command_actions`（最佳努力解析的友好展示）、`additional_permissions`、`proposed_execpolicy_amendment`、`proposed_network_policy_amendments`、`available_decisions`（**由服务端下发可选项顺序**）。`:1640-1653` `CommandExecutionApprovalKind::{Command, HumanCommand, WriteStdin}`。
- [源码] E115 `codex-rs/tui/src/bottom_pane/approval_overlay.rs:877-909,910-929`：字面量选项 —— `"Yes, and don't ask again for commands that start with \`{prefix}\`"` / `"Yes, and allow this host for this conversation"` / `"Yes, and allow these permissions for this session"` / `"Yes, don't ask again for this command in this session"` / `"Yes, and allow this host in the future"` / `"No, and block this host in the future"`。
- [源码] E106 `codex-rs/app-server/README.md:1-16`：企业 `requirements.toml` 的 `decision="prompt-user"` 前缀规则 → `kind:"humanCommand"` + 独立 `approvalId`，**只接受 accept/decline/cancel**，会话/持久批准不能替代；无具备能力客户端在线时**直接拒绝执行**。

### 3.3 沙箱失败 → 升级重试（逐行走查）

- [源码] E64 `codex-rs/core/src/exec.rs:783-845` `finalize_exec_result`：非零 + `is_likely_sandbox_denied` → `CodexErr::Sandbox(SandboxErr::Denied{output, network_policy_decision: None})`；超时 → `SandboxErr::Timeout`；unix 信号 → `SandboxErr::Signal`。
- [源码] E109 `codex-rs/sandboxing/src/denial.rs:13-42`：判定是**启发式** —— 非零退出 + (executor-managed 关键字命中 / Linux SIGSYS)；先排除 `QUICK_REJECT_EXIT_CODES = [2,126,127]`（`:25-28` 直接 return false）；关键字表 7 项含 `"operation not permitted"`/`"read-only file system"`/`"landlock"`（`:50-58`）。→ **已知局限：退出码 126/127 的拒绝不会被识别为沙箱拒绝。**
- [源码] E65 `codex-rs/core/src/tools/orchestrator.rs:393-445`：只有 `SandboxErr::Denied` 才进升级路径；`!tool.escalate_on_failure()` 直接返回。
- [源码] E66 `codex-rs/core/src/tools/orchestrator.rs:446-480`：**`if !tool.wants_no_sandbox_approval(policy) { 直接返回拒绝 }** —— 唯一例外是 `OnRequest + 有网络决策上下文 + 该项需求是 NeedsApproval`。配合 `codex-rs/core/src/tools/sandboxing.rs:348-356`（`UnlessTrusted=>true, Never=>false, OnRequest=>false, Granular=>sandbox_approval`）可得：

  | policy | 沙箱失败后是否自动无沙箱重试 |
  |---|---|
  | `Never` | 否（直接回拒绝） |
  | `OnRequest` | **否**（拒绝回给模型；由模型显式 `require_escalated` 再触发新一次调用） |
  | `UnlessTrusted` | 是（弹一次人工批准） |
  | `Granular{sandbox_approval:true}` | 是 |
  | `Granular{sandbox_approval:false}` | 否（且 `L0` 已判 Forbidden） |
- [源码] E67 `codex-rs/core/src/tools/orchestrator.rs:491-554`：需要批准时**把 `action.sandbox_permissions` 改写成 `RequireEscalated` 且清空 `additional_permissions`**（`:516-527`，注释：`Review and cache the authority of the actual retry, not the narrower permissions requested for the first attempt`）；再 `retry_preapproved = human_once? false : (source ∈ {User,Hook})`，`bypass_retry_approval` 才允许跳过第二次人工。
- [源码] E68 `codex-rs/core/src/tools/orchestrator.rs:556-631`：第二次尝试重新 `select_initial`；`unsandboxed_allowed` 时 `retry_sandbox_exe=None`（真无沙箱）；成功则记 `sandbox_outcome="escalated"`（`:607-613`）。
- [源码] E69 `codex-rs/core/src/tools/sandboxing.rs:253-286` `sandbox_override_for_first_attempt`：`!unsandboxed_execution_allowed` → 只允许 `EscalatedSandboxWithRestrictions`（且必须 `already_approved`）——**有 deny-read 时永不真无沙箱**；`Skip{bypass_sandbox:true}`（execpolicy Allow 升级为完全信任）→ `BypassSandboxFirstAttempt`；`require_escalated` → `BypassSandboxFirstAttempt`。
- [源码] E70 `codex-rs/core/src/tools/sandboxing.rs:294-314` `unsandboxed_execution_allowed` / `sandbox_permissions_preserving_denied_reads`：`RequireEscalated` 在有 `denied_read` 时**降级为 `UseDefault`**（注释：否则会丢掉唯一的读限制执行器）。
- [源码] E71 `codex-rs/core/src/tools/sandboxing.rs:238-251` `ensure_native_sandbox`：`EscalatedSandboxWithRestrictions` 但 `SandboxType::None` → `ToolError::Rejected("command escalation with denied reads requires an available filesystem sandbox")` —— **能力不足就拒绝，不静默降级**。
- [源码] E108 `codex-rs/core/src/safety.rs:67-125` `assess_patch_safety`：`apply_patch` 的三分结果 `AutoApprove / AskUser / Reject{reason}` —— 若「补丁所有目标都在可写路径内」且（profile 是 Disabled/External 或本机有可用沙箱）→ **AutoApprove**；`Never` 或 `Granular{sandbox_approval:false}` → Reject（带人话理由，`:127-144`）；否则 AskUser。`:102-105` 注释点出真实风险：**补丁目标可能是硬链接指向可写根之外**，所以即便判定可写也仍然要在沙箱里跑 `apply_patch`。

### 3.4 「不打断」的机制清单（可迁移的部分）

| # | 机制 | 代码锚点 | 效果 |
|---|---|---|---|
| 1 | 受限沙箱下的普通命令 = 直接 Allow | E28 | 绝大多数命令零弹窗 |
| 2 | 逐命令 `with_additional_permissions`（只放宽这一条） | E112、E115 | 不用为一条命令把整个会话降级 |
| 3 | 审批结果四种持久化粒度（本条/会话/前缀规则/MCP 策略/网络主机） | E32,E114,E115 | 一次人工换长期安静 |
| 4 | 网络拒绝 → 异步 host 批准，不杀进程 | E73 | 命令停在 socket 上等人，批准后继续 |
| 5 | Guardian 自动评审 + read-only + 90s 超时 + 熔断 | E35–E44 | 无人值守也能推进 |
| 6 | Adaptive 打分 + 授权版本校验 | E45 | 低风险直接过，且不会用过期授权 |
| 7 | 升级时只评审「重试的真实权限」 | E67 | 不会因「先请求小的」通过评审就放大权限 |
| 8 | deny-read 存在时永不真无沙箱 | E69,E70,E71 | 升级 ≠ 塌掉边界 |
| 9 | 强制人工检查点（`prompt-user`/`NeedsHumanApproval`）不可被缓存/Guardian 满足 | E29,E106 | 少数高危动作必须真人 |
| 10 | `Granular` 五个闸门 false = 自动拒绝（不是静默放行） | E116、E29 | 企业管理可精确关掉某一类弹窗 |

- [源码] E73 `codex-rs/core/src/tools/network_approval.rs:198-213`：`allows_network_approval_flow(policy) = policy != Never`、`permission_profile_allows_network_approval_flow = Managed`；`PendingApprovalDecision::{AllowOnce, AllowForSession, Deny} → NetworkDecision`；`:216-244` `PendingHostApproval` 用 `SyncOnceLock + Notify` 让**网络请求原地等**；`:269-290` 会话级 `session_approved_hosts`/`session_denied_hosts`。

### 3.5 `request_permissions` 工具：让模型自己解释「我要什么权限」

- [源码] E74 `codex-rs/core/src/tools/handlers/request_permissions.rs:38-80`：解析 `permissions` → `normalize_additional_permissions_with_context` → 非空校验 → `ApprovalAction::RequestPermissions{reason, permissions}`。
- [源码] E75 `codex-rs/core/src/tools/handlers/shell_spec.rs:186-189` 工具描述原文：「…Granted permissions apply automatically to later shell-like commands **in the current turn**, or **for the rest of the session** if the client approves them at session scope.」—— 权限授予有**作用域**，这是「不用反复问」的另一半。
- [源码] E76 `codex-rs/core/src/tools/handlers/shell_spec.rs:225-268` `create_approval_parameters`：`sandbox_permissions` 的可选值按 `exec_permission_approvals_enabled` 动态生成（关掉时只剩 `use_default`/`require_escalated`），`justification` 明确是「User-facing approval question」、`prefix_rule` 明确「Reusable approval prefix」。
- [源码] E77 `codex-rs/sandboxing/src/policy_transforms.rs:147-220` `intersect_permission_profiles_with_context`：**授予 = 请求 ∩ 批准**，逐 entry 用 `granted_file_system_entry_within_request` 判「是否在请求范围内」，再 `retain_constraining_deny_entries` 把双方更严的 deny 留下 —— 客户端只能「给更少」，不能「给更多」。

### 3.6 为什么「顺」——一段解释（含代价）

1. **把「问人」当成最后手段而不是默认动作**：`OnRequest + Restricted + 未请求越权 = Allow`（E28）。旧 Codex 的「每次 shell 都问」被这行代码删掉了。
2. **把「是」变成可积累的资产**：4 种持久化粒度（E32/E114/E115）让第 N 次同类动作免费。
3. **把「判断」外包给一个专用的、更便宜也更严的评审者**：Guardian 只读、无网、无 `sandbox_permissions`（E40），有 90s 上限与熔断（E42/E43），并用**显式分级表**代替模糊直觉（E37/E38）。这既是安全设计，也是延迟设计：人在等的时候不需要在。
4. **把「边界」放在能持续生效的地方**：不是靠一次审批，而是靠平台沙箱 + 本地代理（E1–E26）。所以「放宽一条命令」不会污染全局。
5. **把「升级」设计成不损失安全属性**：`EscalatedSandboxWithRestrictions` + `deny-read` 保护 + 能力不足即拒绝（E69–E71）。

代价（诚实记录）：
- 沙箱拒绝检测是**启发式关键字 + SIGSYS**（E64），存在漏判（退出码 126/127 先被排除）与误判（用户脚本自己打印 "permission denied"）。→ 这是整个「失败后升级」链条最脆的一环。
- Guardian 是**同一个模型家族**（`resolve_review_model`），评审质量受模型能力与 90s 预算约束；`Adaptive` 的快路径依赖 `ScoreAuthorization` 版本对齐（E45），版本一变就得重新评审。
- `SandboxPolicy::has_full_disk_read_access()` 恒 true（E8）：macOS/Linux 的**读**边界完全依赖反向 deny/carveout，任何 carveout 漏配就是读泄露（代码用「最后一律再加 deny」缓解，见 E5）。

---

## 4. 电脑使用（Computer Use / CUA）

### 4.1 明确结论：**没有内建 computer-use 工具**

- [源码] E78 工具注册表枚举：`codex-rs/tools/src/tool_spec.rs:22-56` 的 `ToolSpec` 只有 `Function`/`Namespace`/`ToolSearch`/`WebSearch`/`Freeform` 五类，**没有任何 UI 原语类型**。
- [源码] E79 处理器目录 `codex-rs/core/src/tools/handlers/` 完整清单（apply_patch / current_time+sleep / dynamic / extension_tools / get_context_remaining / list_available_plugins_to_install / mcp / mcp_resource / multi_agents* / new_context_window / plan / request_permissions / request_plugin_install / request_user_input* / send_message_to_user_async / shell_spec / test_sync / tool_search / unified_exec / view_image / wait_for_environment）—— **无 screenshot / click / accessibility / key_press**。测试断言可见工具集也是 `["exec_command","apply_patch","view_image"]`（`codex-rs/core/src/tools/spec_plan_tests.rs:1149`）。
- [源码] E80 全仓 grep `screenshot|left_click|AXUIElement|SendInput|CGEvent`：命中全部在 `app-server` 的 **plugin 目录元数据**（`screenshots/screenshotUrls` 字段）、测试夹具、schema 导出，**没有一处是实现屏幕捕获或注入输入**。

### 4.2 CUA 的真实形态：MCP 连接器 + 专属审核域

- [源码] E81 `codex-rs/protocol/src/mcp.rs:41-52`：

```rust
pub fn is_node_repl_backed_server(server: &str) -> bool {
    matches!(server, "node_repl" | "cua_repl")
}
pub fn is_node_repl_backed_connector(server: &str, connector_id: Option<&str>) -> bool {
    is_node_repl_backed_server(server)
        || server == "codex_apps" && connector_id == Some("connector_openai_browser")
}
```

  `cua_repl` = Computer-Use-Agent 的 REPL 型 MCP server；`connector_openai_browser` = 浏览器型连接器。**点击/截图能力在这个 server 里，不在 Codex repo 里。**
- [源码] E82 `codex-rs/protocol/src/openai_models/guardian.rs:127-139,160-163`：`GuardianScope::for_mcp_connector` 把上述 server 统一归为 `ComputerUse`，其余 MCP 归 `Mcp`；`for_tool` 也先查 `is_node_repl_backed_tool`。
- [源码] E83 `codex-rs/core/src/mcp_tool_call.rs:1432-1463` `build_confirmation_policies_request_meta`：仅对 node-repl 系连接器、且**非 Guardian 会话**注入 `openai/confirmation_policies` meta，内容为 `{"browser_use": <policy>, "computer_use": <policy>}`（来自 `ResolvedModelMessages::confirmation_policies()`），没有配置时给**空对象以清掉启动默认**；注释强调「Text stays verbatim so runtimes own blank-value fallback」。
- [源码] E84 `codex-rs/protocol/src/mcp.rs:35-36`：`CONFIRMATION_POLICIES_META_KEY = "openai/confirmation_policies"`（host-supplied，Node REPL-backed actor calls）。
- [源码] E85 `codex-rs/protocol/src/openai_models/guardian.rs:194-200` `computer_use_review_required()`：先看模型 policy 的 `computer_use` scope，缺省回落 `node_repl_auto_review_required`；注释「The legacy metadata bit remains the transport understood by older CUA servers」→ **新旧 CUA server 的兼容是靠这个 bit 传的**。
- [源码] E86 `codex-rs/core/src/guardian/review.rs:135-144`：当 `computer_use_review_required()` 为真时，评审会话显式打开 `Feature::RetainClientDeveloperMessages`（否则 CUA 的 REPL developer policy 会在压缩后丢失）。
- [源码] E87 `codex-rs/features/src/lib.rs:1886-1891`：`Feature::ComputerUse`，`key="computer_use"`，`stage=Stable`，`default_enabled=true`。同处 `:1880-1885` 有 `Feature::BrowserUseExternal`。

### 4.3 CUA 的权限模型：按应用识别 + 全局默认 + 锁屏

- [源码] E88 `codex-rs/config/src/computer_use.rs:7-35`：

```rust
pub struct ComputerUseConfigToml {
    pub default_app_access: Option<AllowDenyRequirementToml>,
    pub macos: Option<ComputerUseMacosConfigToml>,    // bundle_ids: BTreeMap<String, Allow|Deny>
    pub windows: Option<ComputerUseWindowsConfigToml>, // aumids: map, exes: Vec<{publisher_name, product_name, binary_name?, access}>
}
```

  → 三个平台标识维度：macOS `bundle_id`、Windows `AUMID`、Windows `(publisher, product, binary)` 三元组签名身份。
- [源码] E89 `codex-rs/config/src/browser_computer_use_requirements.rs:114-137` `ComputerUseRequirementsToml`（企业侧）：`allow_locked_computer_use`、`allow_persistent_approval`、`default_app_access`、`macos.bundle_ids`、`windows.{aumids,exes}` —— 与个人 config 同构但走 requirements 层。
- [源码] E90 `codex-rs/config/src/browser_computer_use_requirements.rs:13-52`：浏览器侧更细 —— 每 origin 可配 `access/downloads/uploads/full_cdp_access/auto_review/persistent_approval/access_approval_lifetime`，后者是 `{turn, thread}` 枚举（`:36-41`）→ **浏览器授权的「有效范围」是可配的 turn/thread 粒度**。
- [源码] E91 `codex-rs/app-server-protocol/src/protocol/v2/config.rs:573-578`：对外协议暴露 `ComputerUseRequirements{allow_locked_computer_use, default_app_access, macos, windows}`，`:435` 还有总闸 `allow_browser_and_computer_use: Option<bool>`。

### 4.4 替代路径分析（若无内建 CUA，Codex 靠什么「用电脑」）

| 路径 | 机制 | 证据 | 能力上限 |
|---|---|---|---|
| **A. MCP CUA 连接器（首选）** | `cua_repl`/`node_repl`/`connector_openai_browser` 提供 `tools.*`，Codex 只做工具代理 + Guardian 审核 + 通过 meta 下发 confirmation policy | E81–E87 | 截图/点击/输入由 server 实现；Codex 侧只有「审核 + 允许清单」，**无法在 repo 内审计具体点击** |
| **B. `exec_command` 跑平台脚本** | 走完整沙箱 + 审批链 | E10–E20, E64–E71 | 可以调 `osascript`/`powershell`/`xdotool`，但**默认无 GUI 会话、无辅助功能权限**，且受 `--unshare-*`（Linux）与 restricted token（Windows）限制 |
| **C. Code Mode（`exec`）编排** | JS V8 isolate 里 `await tools.exec_command(...)`，不直接碰 FS/网络 | E92 | 只是把 B/A 组合成一次调用；`no Node, no file system, no network access` |
| **D. app-server 客户端自建** | 客户端实现 `item/commandExecution/requestApproval` 等回调，自行决定 UI | E114,E106 | Codex 侧不提供 UI 原语，客户端可自行截图/注入，但**审批语义与审计不进 Codex** |
| **E. `view_image`（只读半边）** | 模型可直接看图片（含截图文件） | E79 | **只能「看」不能「动」**：这是「无 CUA」与「弱 CUA」的分界 |

---

## 5. 工具层与执行架构

### 5.1 工具面（约 22 个，全部是函数/自由格式）

- [源码] E79 处理器目录 `codex-rs/core/src/tools/handlers/` 全量：`apply_patch`(23KB)、`apply_patch_spec`、`current_time`/`sleep`、`dynamic`、`extension_tools`(27KB)、`get_context_remaining`、`list_available_plugins_to_install`、`mcp`(37KB)、`mcp_resource`(15KB)、`multi_agents`/`multi_agents_common`/`multi_agents_spec`(39KB)/`multi_agents_v2`、`new_context_window`、`plan`、`request_permissions`、`request_plugin_install`、`request_user_input`/`request_user_input_async`、`send_message_to_user_async`、`shell_spec`(13KB)、`test_sync`、`tool_search`(25KB)、`unified_exec`、`view_image`(20KB)、`wait_for_environment`。**无 screenshot/click/accessibility/key_press。**
- [源码] E80 全仓 grep `screenshot|left_click|AXUIElement|SendInput|CGEvent` → 命中全部落在 `app-server` 的 plugin 元数据字段（`screenshots`/`screenshotUrls`）与测试夹具，无实现。
- [源码] E94 `codex-rs/tools/src/tool_spec.rs:58-140`：`ToolSpec::name()`（`tool_search`/`web_search` 为保留名）；`create_tools_json_for_responses_lite` 把 `Function`/`Freeform` 收进 `functions` namespace —— 适配「命名空间函数」新协议。
- [源码] E93 `codex-rs/tools/src/lib.rs:1-115`：工具相关公共面（`ToolName`/`ToolExecutor`/`ToolExposure`/`ToolOutput`/`JsonSchema`/`image_detail`/`tool_search`/`dynamic_tool`）—— 工具是可插拔的执行器，不是硬编码 if-else。

### 5.2 exec / exec-server

- [源码-文档] E95 `codex-rs/exec-server/README.md:3-21`：`codex-exec-server` = 「spawning and controlling subprocesses through `codex-utils-pty`」的 JSON-RPC 服务；库 + 独立 exe；用 `codex-arg0` 做 hidden FS/process/platform-sandbox 分派；产物放 `bin/` + `codex-resources/`。
- [源码-文档] E96 `exec-server/README.md:25-41`：`metadata.threadId`→`CODEX_THREAD_ID`、`metadata.toolCallId`→`CODEX_TOOL_CALL_ID`；**「Labels support correlation, not authorization」**——标签可被 shell 改写/删除，不能当权限凭据。
- [源码-文档] E97 `exec-server/README.md:43-60`：传输 `ws://IP:PORT`（默认）/ `--remote URL --environment-id` / `forward --connect`；认证 `--ws-auth capability-token --ws-token-sha256`、token 文件、签名 bearer；要求 `wss://` 或 loopback；token 在诊断里脱敏、重连复用。
- [源码-文档] E98 `exec-server/README.md:62-76`：远端注册后连服务端 rendezvous websocket，走 **Noise relay**；forward 模式不解析 RPC、不初始化会话、不重放、不持久化 → 恢复能力受目标端 session/输出保留限制。
- [源码] E99 `codex-rs/core/src/tools/runtimes/unified_exec.rs:184-195`：`uses_executor_managed_process_sandbox = env.is_remote() || shell_snapshot.is_some()`；配合 `orchestrator.rs:155-162`：此时 core 只下传 `PermissionProfile`（symbolic workspace roots 延后到 executor 物化）——**远端执行的沙箱由 executor 自己套**。
- [源码] E100 `codex-rs/apply-patch/src/lib.rs:15-22`：`apply_patch` 依赖 `codex_exec_server::{ExecutorFileSystem, FileSystemSandboxContext, ReadFileOptions, WriteFileOptions, RemoveOptions, GetMetadataOptions, CreateDirectoryOptions}` —— 补丁执行走**文件系统抽象层**，本地/远端/不同平台沙箱共用同一套 patch 语义。
- [源码] E101 `codex-rs/exec/src/lib.rs:1-6,19-25`：非交互 `codex exec` 的输出契约（stdout 只放最终消息；`--json` 为 JSONL；其余全走 stderr）；直接复用 `InProcessAppServerClient` —— **exec 与 app-server 共享同一事件/协议实现**。

### 5.3 app-server（客户端协议面）

- [源码] E102 `codex-rs/app-server-protocol/src/protocol/common.rs:1855-1885`：server→client 三类请求 —— `item/commandExecution/requestApproval`、`item/fileChange/requestApproval`、`item/permissions/requestApproval`。
- [源码-文档] E103 `codex-rs/app-server/README.md:18-24,54-58,60-82`：`thread/memory/read`；关停准入错误 `-32600 {"reason":"serverShuttingDown"}`；`readState{firstUnread, revision}` 的未读语义（只有新投递、持久、可见的终态结果才推进，且在 `turn/completed` 之前）。
- [源码-文档] E104 `app-server/README.md:12-14`：待决审批在**具备能力的客户端重连**时走「approval replay flow」→ 客户端断线不丢 prompt。
- [源码] E106 `app-server/README.md:1-16`：企业 `requirements.toml` 的 `decision="prompt-user"` 前缀规则 → `kind:"humanCommand"` + 独立 `approvalId`，只接受 `accept/decline/cancel`，会话/持久批准不可替代；无具备能力客户端在线则**直接拒绝执行**。

### 5.4 MCP

- [源码] E105 `codex-rs/core/src/tools/handlers/mcp.rs`(37KB) + `mcp_resource.rs`(15KB) + `codex-rs/rmcp-client/`：MCP 工具与资源两类入口；MCP 工具在 Guardian 归 `GuardianScope::Mcp`（E82），elicitation 有独立闸门 `GranularApprovalConfig.mcp_elicitations`（E116）；MCP 会话全程不参与 `openai/confirmation_policies` 注入（E83 的 `is_basic_session_source` 排除）。
- [源码] E107 `codex-rs/core/src/tools/approvals.rs:79-170`：`ApprovalAction` 六类（ExecCommand / WriteStdin / ApplyPatch / McpToolCall / NetworkAccess / RequestPermissions），每类带 `#[serde(skip)]` 的 hook 字段 —— **UI 展示的数据与 hook 内部数据分离**，避免敏感字段被序列化给客户端。

---

## 6. 上下文 / 缓存 / 压缩

### 6.1 prompt cache key

- [源码] E52 `codex-rs/core/src/client.rs:709-740`：

```rust
fn prompt_cache_key(&self, metadata) -> Option<String> {
    match &self.prompt_cache_key_policy {
        PromptCacheKey::SessionDerived => Some(self.session_derived_cache_key(metadata)),
        PromptCacheKey::Custom(key) => Some(key.clone()),
        PromptCacheKey::Omit => None,
    }
}
// session_derived_cache_key: session_id_override
//   → 内部源 + parent_thread_id : "{source}:{parent_thread_id}"
//   → 否则 metadata.session_id
```

  `:732-740` 另外区分 `responses_session_id`：ChatGPT 从 Responses session-id header 派生 cache affinity；非根 agent 用真实 session id。
- [源码] E53 `codex-rs/ext/guardian-reviewer/src/session.rs:18-30`：Guardian 的 override = `format!("guardian:{parent_thread_id}")` → **所有评审共享父线程的缓存前缀**，这是「评审也不贵」的经济学基础。
- [源码] E44 `codex-rs/core/src/guardian/review.rs:239-252`：idle 时追加到同一 trunk 会话「to preserve a stable prompt-cache key」，busy 时从最后一次 committed trunk rollout 做临时 fork（并行审批互不阻塞，也不污染缓存线程）。

### 6.2 压缩（compaction）

- [源码] E54 `codex-rs/core/src/compact.rs:63-115`：`COMPACT_USER_MESSAGE_MAX_TOKENS = 20_000`；`build_compaction_replacement_history` = 重新 `build_initial_context_with_world_state` → 拆成 prefix/context → `assemble_compaction_history(compacted, prefix, context)`；顺序为 **prefix（初始上下文）→ insert_initial_context_before_last_real_user_or_summary(compacted, context)**。即压缩产物 = 摘要 + **重新注入的结构化上下文**，不是纯摘要。
- [源码] E55 `codex-rs/core/src/compact.rs:69-81,117-170`：`CompactedHistoryMetadata{input_goal_ids, message, window_number, window_ids, compaction_response_id, compaction_model_hash, reviewer_compaction_hash}`；`run_inline_auto_compact_task` 用 `config.compact_prompt` 或 `SUMMARIZATION_PROMPT`，标 `CompactionTrigger::Auto`；手动压缩标 `Manual/UserRequested`。
- [源码] E56 `codex-rs/core/src/compact.rs:65-67`：`AutoCompactionDisabled` 是 thread-local 策略，「保留继承上下文但不改模型/技能预算」。
- [源码] E57 `codex-rs/ext/guardian-reviewer/src/context_policy.rs:11-55`：`ReviewContextPolicy::{Legacy, LegacyWithCheckpointReuse, ThreadOwned, Independent}`；`parent_compaction()` 允许复用父线程 `CompactionCheckpoint`，但校验 `is_usable()`：不可用时 LegacyWithCheckpointReuse 返回 `None`（降级），ThreadOwned 直接 `ensure!` 报错（**fail-closed**）。

### 6.3 上下文片段（typed context fragments）

- [源码] E58 `codex-rs/context-fragments/src/fragment.rs:45-177`：`ContextualUserFragment` trait —— `role()` / `content_kind()`（稳定 `<feature>.<name>` 分类）/ `markers()`（start/end 标记，用于**事后识别**被注入的上下文）/ `body()` / `content_metadata()`（producer 归因，默认 `ContentItemMetadata::harness()`）；`render()` 无分隔符拼接（由实现方负责空白）；`matches_marked_text` 做大小写不敏感首尾匹配。注释 `:53`：`Producers must enforce size bounds for all model-visible content before rendering`。
  迁移价值：让「哪段文字是系统注入的」成为**结构化事实**（kind + metadata + markers），而不是靠正则猜 `<system-reminder>`。
- [源码] E59 `codex-rs/context-fragments/src/lib.rs:1-30`：导出 `AnnotatedContent`/`additional_context`/`answered_question`/`recap_prompt` 等具体片段类型；`annotated_content.rs` 把 content + kind + metadata 打包。

### 6.4 memories（跨会话记忆）

- [源码-文档] E60 `codex-rs/memories/README.md:29-38`：触发条件 —— 非 ephemeral、feature 开、非 sub-agent、state DB 可用；**异步后台**两阶段执行。
- [源码-文档] E61 `codex-rs/memories/README.md:40-77`：Phase 1 逐 rollout 抽取 —— state DB lease/claim 防重复、并发上限、结构化输出（`raw_memory`/`rollout_summary`/可选 `rollout_slug`）、**redact secrets**、失败带 retry backoff、三种 job 结果（succeeded / succeeded_no_output / failed）。
- [源码-文档] E62 `codex-rs/memories/README.md:79-152`：Phase 2 全局整合 —— 单一全局锁、按 `usage_count` → 最近 `last_usage`/`generated_at` 排序取 top-N、写 `raw_memories.md`（**按 thread-id 升序以稳定 diff**）与 `rollout_summaries/`、以 git-baseline（`~/.codex/memories/.git`）产出 `phase2_workspace_diff.md`，然后**起内部 sub-agent 做整合**（`no approvals, no network, local write only`，禁用 collab 防递归），完成后 reset baseline 并删 diff 文件（避免已删内容留在 prompt 产物或不可达对象里）。
- [源码-文档] E63 `memories/README.md:139-152`：「git 工作区是否脏」决定要不要跑 agent，DB watermark 只做记账 —— **用文件系统 diff 代替 dirty flag**，避免 watermark 漂移导致的漏跑/重跑。

---

## 7. 可迁移到「融合 Agent」的设计要点（11 条）

> 每条：Codex 怎么做 → 为什么 → 迁移时改什么。按我的优先级排序。

1. **权限三层分离：策略形状 / 执行后端 / 审批决策**。
   `PermissionProfile`（要什么，E7）、`SandboxType`（谁执行，E1/E9）、`AskForApproval + ExecApprovalRequirement`（要不要问，E117/E48）三者解耦。迁移：**别**把 `sandbox_mode` 与 `approval_policy` 合成一个字符串——这正是旧 Codex 的痛点，也是 `on-failure` 最终被并入 `on-request` 的原因（E117）。
2. **「受限沙箱下的普通动作」直接放行，让沙箱承担边界**。
   `OnRequest + Restricted + !requests_override → Allow`（E28）是整个体验的支点。迁移：**先有可信沙箱，才敢有「不问」**，顺序不能反。
3. **把一次人工决定变成可复用的「权限票据」，且票据有多种粒度**。
   `ReviewDecision` 的 5 种「是」（E118）+ 会话缓存（E32）+ 前缀规则（E76）。迁移：至少实现 3 种 —— 本条 / 本会话 / 本前缀。**前缀规则要落成可读的规则文件**（execpolicy），用户才能审计与撤销。
4. **升级必须是「有约束的升级」，不能是「塌掉边界」**。
   `SandboxOverride::EscalatedSandboxWithRestrictions` + `unsandboxed_execution_allowed` + `ensure_native_sandbox`（E69–E71、E47）。迁移：设一个「deny 集合不可绕过」的位；只要存在 deny-read，就禁止真无沙箱；能力不足时报错而不是降级。
5. **升级时只评审「实际要用的权限」**。
   重试前把 action 改写成 `RequireEscalated` 再送审（E67）。迁移：审批对象必须是**将执行的真实能力**，否则「先请求小的骗过评审再放大」是必然漏洞。
6. **自动评审器要是一个独立、受限、有预算的 agent**。
   Guardian：read-only + 无网 + 5 工具白名单 + `expose_additional_permissions:false` + 90s + 熔断（E40/E42/E43）。迁移：评审 agent 权限必须**严格小于**被评审 agent；必须有硬超时与失败熔断；超时/失败要 fail-closed 到人工或拒绝。
7. **评审结论要「分级 + 归因」，不要一个 bool**。
   `risk_level × user_authorization → outcome` + `rationale`（E37/E41）。迁移：结构化输出（JSON schema）才好做统计、回归、UI 解释与 Adaptive 复用。
8. **缓存键必须绑定「授权版本」**。
   `ScoreAuthorization` 绑定 permissions/settings/environments/history 版本/root/review_context_revision/model，消费前 `is_current` 重校验（E45）；重试/升级/同步要求时强制 fresh review（E36）。迁移：任何「上次说可以」的缓存都要带 version tuple，任一维变化即失效。**最易漏、后果最重。**
9. **网络边界做成「本地代理 + 域名策略」而不是「允许/禁止网络」**。
   `codex-network-proxy`（E21–E26）：HTTP+SOCKS5、allow/deny/limited、`x-proxy-error` 分类、MITM CA 只读挂载、policy hook 可把 exec 批准映射到网络但显式 deny 优先。迁移：让「网络审批」变成可解释、可持久化（per host）的一件事。
10. **平台适配抽象成「生成 argv 的 transformer」**。
    `SandboxManager::transform`（E9）为每个后端产出「最终 argv + arg0 override + pending permission profile」。迁移：新增平台/后端只实现一个 transform；审批、重试、遥测层完全不动。同时保留 `SandboxablePreference::{Auto,Require,Forbid}` 让调用方可强制度量。
11. **上下文注入要「可识别、可归因、可预算」**。
    `ContextualUserFragment`（E58）+ 压缩保留 prefix/context 结构（E54）+ 压缩元数据（E55）。迁移：不要裸字符串拼接注入系统信息；给 marker 与 kind，才能做「压缩后仍保留关键上下文」与「审计哪段是注入的」。
12. **（附加）标签只做关联，不做授权**。
    `CODEX_THREAD_ID`/`CODEX_TOOL_CALL_ID` 的注释（E96）值得原样抄进设计文档：环境变量标签可被 shell 改写，任何基于标签的授权判断都是漏洞。

---

## 8. 证据清单（E0–E119，可逐条 grep 复核）

| ID | 结论摘要 | 位置（相对 `repos/codex/`） | 强度 |
|---|---|---|---|
| E0 | 仓库内 `docs/sandbox.md` 等只是一行外链占位 | `docs/sandbox.md:1-3`、`docs/execpolicy.md:1-3` | [源码] |
| E1 | `SandboxType` 五后端 | `codex-rs/protocol/src/sandbox.rs:29-35` | [源码] |
| E2 | `effective_windows_sandbox_type`：MXC 优先，Disabled→None | `codex-rs/protocol/src/sandbox.rs:50-60` | [源码] |
| E3 | Seatbelt 基础策略 `(deny default)` + process/signal/sysctl/iokit/PTY | `codex-rs/sandboxing/src/seatbelt_base_policy.sbpl:8-16,18-21,84-92,103-116` | [源码] |
| E4 | 只用 `/usr/bin/sandbox-exec` 防 PATH 注入 | `codex-rs/sandboxing/src/seatbelt.rs:58-62` | [源码] |
| E5 | 读/写/deny-read/mach-lookup/fcntl 策略拼装（含 rename 祖先 deny） | `codex-rs/sandboxing/src/seatbelt.rs:940-1084` | [源码] |
| E6 | 网络开启时只放 AF_SYSTEM + 少数 mach service | `codex-rs/sandboxing/src/seatbelt_network_policy.sbpl:5-31` | [源码] |
| E7 | 动态网络策略四形态 | `codex-rs/sandboxing/src/seatbelt.rs:289,300,338,342,370` | [源码] |
| E8 | `has_full_disk_read_access()` 恒 true | `codex-rs/protocol/src/protocol.rs:1382-1402` | [源码] |
| E9 | `transform` 平台分派 + helper exe 要求 | `codex-rs/sandboxing/src/manager.rs:355-566,568-603` | [源码] |
| E10 | Linux = bwrap + seccomp；FS 受限策略拒绝 legacy Landlock | `codex-rs/linux-sandbox/README.md:10-14,47-57` | [源码-文档] |
| E11 | bwrap 六步挂载顺序 | `codex-rs/linux-sandbox/src/bwrap.rs:392-408,503-515` | [源码] |
| E12 | bwrap 参数集（unshare/cap-drop/die-with-parent） | `codex-rs/linux-sandbox/src/bwrap.rs:270-297,340-381` | [源码] |
| E13 | seccomp 三模式 + 封 io_uring/ptrace/AF_VSOCK + 命中 EPERM | `codex-rs/linux-sandbox/src/seccomp.rs:45-129,190-302` | [源码] |
| E14 | 默认不设 `PR_SET_NO_NEW_PRIVS`（兼容 setuid bwrap） | `codex-rs/linux-sandbox/src/seccomp.rs:68-76,131-138` | [源码] |
| E15 | legacy Landlock V5 只做「全读+指定写」，不支持受限读 | `codex-rs/linux-sandbox/src/seccomp.rs:82-88,140-175` | [源码] |
| E16 | `PermissionProfile` → `--permission-profile` JSON | `codex-rs/sandboxing/src/landlock.rs:26-67` | [源码] |
| E17 | 托管代理 = `--unshare-net` + TCP→UDS→TCP 桥 | `codex-rs/linux-sandbox/README.md:91-101` | [源码-文档] |
| E18 | 可写根 `--bind` + 受保护子路径 `--ro-bind` 复封 + 路径具体性排序 | `codex-rs/linux-sandbox/README.md:58-68` | [源码-文档] |
| E19 | `--inherit-pid-namespace` 只能由 exec-server 启动参数开启 | `codex-rs/linux-sandbox/README.md:108-120` | [源码-文档] |
| E20 | bwrap 解析顺序/兼容/缺失回落/WSL1 拒绝 | `codex-rs/linux-sandbox/README.md:16-46` | [源码-文档] |
| E21 | 网络代理 = 本地 HTTP 3128 + SOCKS5 8081 + allow/deny + limited | `codex-rs/network-proxy/README.md:3-12` | [源码-文档] |
| E22 | `allow_local_binding` 语义；MXC 默认 true 且拒绝 false | `codex-rs/network-proxy/README.md:45-51` | [源码-文档] |
| E23 | `403` + `x-proxy-error` 四类；limited 只放 GET/HEAD/OPTIONS | `codex-rs/network-proxy/README.md:143-156` | [源码-文档] |
| E24 | policy hook 可把 exec 批准映射为网络放行，显式 deny 优先 | `codex-rs/network-proxy/README.md:189-197` | [源码-文档] |
| E25 | 注入代理 env 与 `ManagedNetworkSandboxContext` | `codex-rs/sandboxing/src/manager.rs:396-412,481-495` | [源码] |
| E26 | MITM CA 公钥作为额外可读根 | `codex-rs/sandboxing/src/manager.rs:66-85` | [源码] |
| E27 | `default_exec_approval_requirement` 全量映射 | `codex-rs/core/src/tools/sandboxing.rs:195-236` | [源码] |
| E28 | 未命中规则的默认决定（含 `Restricted+!override→Allow`） | `codex-rs/core/src/exec_policy.rs:807-892` | [源码] |
| E29 | `prompt_is_rejected_by_policy` 五闸门分「规则型/沙箱型」 | `codex-rs/core/src/exec_policy.rs:214-242` | [源码] |
| E30 | `RuleMatch`/`PrefixRuleMatch` + prefix 匹配 | `codex-rs/execpolicy/src/rule.rs:37-90` | [源码] |
| E31 | requirements execpolicy 以 `merge_overlay` 合并（企业优先） | `codex-rs/core/src/exec_policy.rs:714-748` | [源码] |
| E32 | 会话级审批缓存（多 key / 逐 key 落库） | `codex-rs/core/src/tools/sandboxing.rs:41-118` | [源码] |
| E33 | Hook 决定优先，Deny 立刻生效 | `codex-rs/core/src/tools/approvals.rs:594-638` | [源码] |
| E34 | `PermissionRequestDecision` + 14 个 hook 事件 | `codex-rs/hooks/src/events/permission_request.rs:54-58`；`hooks/src/lib.rs:29-44` | [源码] |
| E35 | 只有 OnRequest/Granular + AutoReview 才走 Guardian | `codex-rs/ext/guardian-reviewer/src/routing.rs:58-66` | [源码] |
| E36 | Guardian 决策分派 + `require_fresh_review` 展开 | `codex-rs/ext/guardian-reviewer/src/routing.rs:93-207` | [源码] |
| E37 | 风险×授权 → allow/deny 分级表 | `codex-rs/prompts/templates/guardian/policy_template.md:66-78` | [源码] |
| E38 | `user_authorization`/`risk_level` 评分细则与「勿过度判重」 | `.../policy_template.md:15-38` | [源码] |
| E39 | 可信内容边界 + 截断标记处理 | `.../policy_template.md:5-13` | [源码] |
| E40 | Guardian 只读/无网/禁 `sandbox_permissions` + 工具白名单 | `.../policy_template.md:62-64`；`ext/guardian-reviewer/src/settings.rs:43-65` | [源码] |
| E41 | 评审输出契约 + 容错解析 + JSON schema | `codex-rs/ext/guardian-reviewer/src/assessment.rs:11-99` | [源码] |
| E42 | 评审超时/取消语义；`REVIEW_TIMEOUT=90s` | `ext/guardian-reviewer/src/deadline.rs:10-64`；`src/lib.rs:87` | [源码] |
| E43 | 熔断：3 连 deny / 50 窗 10 deny；cyber 收紧到 1 | `codex-rs/ext/guardian-reviewer/src/circuit_breaker.rs:3-7,62-97` | [源码] |
| E44 | Guardian 会话复用/fork 与稳定 cache key | `codex-rs/core/src/guardian/review.rs:239-252` | [源码] |
| E45 | `ScoreAuthorization` 授权版本绑定与重校验 | `codex-rs/core/src/guardian/score_authorization.rs:1-19,70-76` | [源码] |
| E46 | Guardian 按域策略 + 七类 `GuardianScope` | `codex-rs/protocol/src/openai_models/guardian.rs:14-36,40-65,115-183` | [源码] |
| E47 | Windows unelevated 不能做 split 读限制 → 拒绝运行 | `codex-rs/sandboxing/src/windows.rs:33-46,106-120` | [源码] |
| E48 | 沙箱账户 + secrets 目录排除 + 平台默认可读根 | `codex-rs/windows-sandbox-rs/src/setup.rs:52-78` | [源码] |
| E49 | restricted token 标志位 + 自定义 default DACL | `codex-rs/windows-sandbox-rs/src/token.rs:42-47,54-90` | [源码] |
| E50 | `LogonUserW` + `CreateProcessAsUserW` + `JobObject` | `.../identity.rs:42-44,215`；`.../process.rs:33,117,168` | [源码] |
| E51 | WFP 13 条持久化过滤器（ICMP/DNS53/DoT853/SMB445,139） | `codex-rs/windows-sandbox-rs/src/wfp/filter_specs.rs:1-35`（全文 13 处 `description`） | [源码] |
| E52 | prompt cache key 策略与派生规则 | `codex-rs/core/src/client.rs:709-740` | [源码] |
| E53 | Guardian cache key 固定为 `guardian:{parent}` | `codex-rs/ext/guardian-reviewer/src/session.rs:18-30` | [源码] |
| E54 | 压缩 = 摘要 + prefix + 重新注入 context | `codex-rs/core/src/compact.rs:63-115` | [源码] |
| E55 | 自动/手动压缩入口 + 压缩元数据 | `codex-rs/core/src/compact.rs:69-81,117-170` | [源码] |
| E56 | `AutoCompactionDisabled` thread-local 关闸 | `codex-rs/core/src/compact.rs:65-67` | [源码] |
| E57 | 评审上下文策略可复用父压缩检查点（fail-closed） | `codex-rs/ext/guardian-reviewer/src/context_policy.rs:11-55` | [源码] |
| E58 | `ContextualUserFragment` 契约（markers/kind/metadata） | `codex-rs/context-fragments/src/fragment.rs:45-177` | [源码] |
| E59 | context-fragments 导出面 | `codex-rs/context-fragments/src/lib.rs:1-30` | [源码] |
| E60 | memories 触发条件 | `codex-rs/memories/README.md:29-38` | [源码-文档] |
| E61 | Phase 1：lease/claim、结构化输出、redact、backoff | `codex-rs/memories/README.md:40-77` | [源码-文档] |
| E62 | Phase 2：全局锁、top-N、git baseline diff、内部 sub-agent | `codex-rs/memories/README.md:79-152` | [源码-文档] |
| E63 | 用 git 工作区脏度而非 watermark 决定是否跑 | `codex-rs/memories/README.md:139-152` | [源码-文档] |
| E64 | `finalize_exec_result`：非零+启发式命中→`Denied`；超时→`Timeout`；信号→`Signal` | `codex-rs/core/src/exec.rs:783-845` | [源码] |
| E65 | 只有 `SandboxErr::Denied` 进升级路径；`!escalate_on_failure` 直接返回 | `codex-rs/core/src/tools/orchestrator.rs:393-445` | [源码] |
| E66 | `wants_no_sandbox_approval`：UnlessTrusted→true / Never→false / **OnRequest→false** / Granular→sandbox_approval | `codex-rs/core/src/tools/orchestrator.rs:446-480`；`core/src/tools/sandboxing.rs:348-356` | [源码] |
| E67 | 重试前把 action 改写成 `RequireEscalated` 并清空 `additional_permissions` | `codex-rs/core/src/tools/orchestrator.rs:491-554` | [源码] |
| E68 | 第二次尝试重新选后端；`unsandboxed_allowed` 时 `retry_sandbox_exe=None`；记 `escalated` | `codex-rs/core/src/tools/orchestrator.rs:556-631` | [源码] |
| E69 | `sandbox_override_for_first_attempt`：有 deny-read 时只能受限升级 | `codex-rs/core/src/tools/sandboxing.rs:253-286` | [源码] |
| E70 | `unsandboxed_execution_allowed` / `sandbox_permissions_preserving_denied_reads` | `codex-rs/core/src/tools/sandboxing.rs:288-314` | [源码] |
| E71 | `ensure_native_sandbox`：要求受限升级但无可用沙箱 → `Rejected` | `codex-rs/core/src/tools/sandboxing.rs:238-251` | [源码] |
| E72 | orchestrator 审批阶段：`Skip`/`Forbidden`/`Needs*` 三分 + `strict_auto_review` 强制送审 | `codex-rs/core/src/tools/orchestrator.rs:125-233` | [源码] |
| E73 | 网络拒绝 → 异步 host 批准（AllowOnce/AllowForSession/Deny） | `codex-rs/core/src/tools/network_approval.rs:198-290` | [源码] |
| E74 | `request_permissions` 解析与 approval action | `codex-rs/core/src/tools/handlers/request_permissions.rs:28-80` | [源码] |
| E75 | `request_permissions` 工具描述（turn/session 作用域） | `codex-rs/core/src/tools/handlers/shell_spec.rs:186-189` | [源码] |
| E76 | 审批参数 schema（`prefix_rule`/`justification`/动态可选值） | `codex-rs/core/src/tools/handlers/shell_spec.rs:225-268` | [源码] |
| E77 | 授权 = 请求 ∩ 批准，更严 deny 保留 | `codex-rs/sandboxing/src/policy_transforms.rs:147-220` | [源码] |
| E78 | `ToolSpec` 五类，无 UI 原语 | `codex-rs/tools/src/tool_spec.rs:18-68` | [源码] |
| E79 | 处理器清单（22 个，无截图/点击） | `codex-rs/core/src/tools/handlers/` | [源码] |
| E80 | 全仓无 screenshot/click/AX/SendInput 实现 | grep（仅 plugin 元数据与测试） | [源码]（负证据） |
| E81 | `cua_repl`/`node_repl`/`connector_openai_browser` | `codex-rs/protocol/src/mcp.rs:41-52` | [源码] |
| E82 | CUA 连接器 → `GuardianScope::ComputerUse` | `codex-rs/protocol/src/openai_models/guardian.rs:127-139,160-163` | [源码] |
| E83 | 下发 `openai/confirmation_policies`（browser_use/computer_use） | `codex-rs/core/src/mcp_tool_call.rs:1421-1463` | [源码] |
| E84 | meta key 常量 | `codex-rs/protocol/src/mcp.rs:35-39` | [源码] |
| E85 | `computer_use_review_required`（legacy bit 兼容） | `codex-rs/protocol/src/openai_models/guardian.rs:186-201` | [源码] |
| E86 | CUA 评审会话保留 client developer messages | `codex-rs/core/src/guardian/review.rs:135-148` | [源码] |
| E87 | `Feature::ComputerUse`（Stable/default on） | `codex-rs/features/src/lib.rs:1880-1897` | [源码] |
| E88 | `[computer_use]` 配置结构（bundle_id/AUMID/EXE） | `codex-rs/config/src/computer_use.rs:7-35` | [源码] |
| E89 | requirements 版 computer_use（含 `allow_locked_computer_use`） | `codex-rs/config/src/browser_computer_use_requirements.rs:95-137` | [源码] |
| E90 | browser_use 每 origin 策略 + turn/thread 授权寿命 | `.../browser_computer_use_requirements.rs:13-52,36-41` | [源码] |
| E91 | 协议暴露 CUA requirements + 总闸 | `codex-rs/app-server-protocol/src/protocol/v2/config.rs:435,573-578` | [源码] |
| E92 | Code Mode `exec`：V8 isolate、`tools.*`、无 Node/FS/网络 | `codex-rs/code-mode-protocol/src/description.rs:16-34` | [源码] |
| E93 | 工具公共面（ToolName/ToolExecutor/ToolExposure/ToolOutput） | `codex-rs/tools/src/lib.rs:1-115` | [源码] |
| E94 | `ToolSpec::name()` + lite 协议打包 | `codex-rs/tools/src/tool_spec.rs:58-140` | [源码] |
| E95 | exec-server 职责与 arg0 分派 | `codex-rs/exec-server/README.md:3-21` | [源码-文档] |
| E96 | 环境标签只做关联不做授权 | `codex-rs/exec-server/README.md:25-41` | [源码-文档] |
| E97 | exec-server 传输与认证 | `codex-rs/exec-server/README.md:43-60` | [源码-文档] |
| E98 | 远端 Noise relay / forward 语义 | `codex-rs/exec-server/README.md:62-76` | [源码-文档] |
| E99 | `uses_executor_managed_process_sandbox` 条件 | `codex-rs/core/src/tools/runtimes/unified_exec.rs:184-195` | [源码] |
| E100 | `apply_patch` 依赖 `ExecutorFileSystem` | `codex-rs/apply-patch/src/lib.rs:15-22` | [源码] |
| E101 | `codex exec` 输出契约 + 复用 app-server client | `codex-rs/exec/src/lib.rs:1-6,19-25` | [源码] |
| E102 | 三类审批 RPC | `codex-rs/app-server-protocol/src/protocol/common.rs:1855-1885` | [源码] |
| E103 | app-server 线程 RPC/错误码/未读语义 | `codex-rs/app-server/README.md:18-24,54-58,60-82` | [源码-文档] |
| E104 | 审批重放（客户端重连不丢 prompt） | `codex-rs/app-server/README.md:12-14` | [源码-文档] |
| E105 | MCP 工具/资源处理器与 rmcp-client | `codex-rs/core/src/tools/handlers/mcp.rs`、`mcp_resource.rs`；`codex-rs/rmcp-client/` | [源码] |
| E106 | 「强制人工」检查点协议细节 | `codex-rs/app-server/README.md:1-16`；`v2/item.rs:1640-1653` | [源码-文档]+[源码] |
| E107 | `ApprovalAction` 六类 + hook 字段与 UI 字段分离 | `codex-rs/core/src/tools/approvals.rs:79-170` | [源码] |
| E108 | `assess_patch_safety` 三分结果与硬链接风险注释 | `codex-rs/core/src/safety.rs:58-180` | [源码] |
| E109 | 沙箱拒绝判定的启发式与 126/127 早退 | `codex-rs/sandboxing/src/denial.rs:13-72` | [源码] |
| E110 | sandbox_integrity：策略一致性自检（不评估 ACL） | `codex-rs/sandboxing/src/sandbox_integrity/{mod,contents,policy}.rs` | [源码] |
| E111 | MXC 后端语义与限制 | `codex-rs/mxc-sandbox/README.md:3-31,49-58,61-73,80-123` | [源码-文档] |
| E112 | `SandboxPermissions` 三值 + 三谓词 | `codex-rs/protocol/src/models.rs:61-94` | [源码] |
| E113 | `ApprovalResolutionSource` + `into_tool_result` 错误映射 | `codex-rs/core/src/tools/approvals.rs:449-516` | [源码] |
| E114 | `CommandExecutionRequestApprovalParams` 全字段 + `ApprovalKind` | `codex-rs/app-server-protocol/src/protocol/v2/item.rs:1640-1720` | [源码] |
| E115 | TUI 审批选项文案与粒度 | `codex-rs/tui/src/bottom_pane/approval_overlay.rs:843-929` | [源码] |
| E116 | `GranularApprovalConfig` 五闸门 | `codex-rs/protocol/src/protocol.rs:1171-1208` | [源码] |
| E117 | `AskForApproval` 4 值 + `OnRequest` 默认 + `alias="on-failure"` | `codex-rs/protocol/src/protocol.rs:1128-1169` | [源码] |
| E118 | `ReviewDecision` 8 值（含 5 种「是」的持久化粒度） | `codex-rs/protocol/src/protocol.rs:4425-4499` | [源码] |
| E119 | `request_reviewer_approval`：Guardian 返回 `None` 即回落人工 | `codex-rs/core/src/tools/approvals.rs:681-699` | [源码] |

---

## 9. 缺口与「未验证」清单（诚实边界）

1. **没有任何真机运行**：本文全部结论来自静态阅读。沙箱实际拦截率、Seatbelt/bwrap 在真实项目上的误杀率、Guardian 在真实审批上的准确率，均未测量。
2. **`cua_repl`/`connector_openai_browser` 的实现不在本仓库**：截图/点击/无障碍如何做、是否用 CDP/Playwright/AX API，只能看到 Codex 侧的「审核 + 允许清单」契约。要写深 CUA 需另找该 server 的仓库或文档。
3. **官方文档是外链**：`docs/sandbox.md`/`docs/execpolicy.md`/`docs/exec.md`/`docs/config.md` 均只有一行指向 `developers.openai.com`（见 E0），因此「官方口径」只能引 URL：
   - https://developers.openai.com/codex/security （sandbox & approvals）
   - https://developers.openai.com/codex/exec-policy
   - https://developers.openai.com/codex/noninteractive
   - https://developers.openai.com/codex/config-basic / config-advanced / config-reference
4. **Guardian 扩展生态未读完**：`codex-rs/ext/` 下另有 `guardian-v2`/`guardian-v3`/`agent`/`mcp`/`skills`/`memories` 等；本文只读了 `guardian-reviewer`。v1/v2/v3 分工（`GuardianV2Enabled`、`GuardianV2Event`、`decide_approval` 注册表）需要单独一轮。
5. **`windows-sandbox-service` 未深入**：该 crate 有 machine policy、package lifecycle、IPC 认证（`src/ipc/authentication.rs`），像是「把 elevated setup 变成常驻服务」的演进方向；本文只引用了 `setup.rs` 的静态事实。
6. **`network-proxy` 的 MITM/credential-broker 只读了 README**：`credential_broker/`（76KB）、`mitm_hook.rs`（46KB）、`aws_sigv4.rs`（26KB）涉及密钥替换与 SigV4，未展开。
7. **性能数字全无**：Guardian 90s 是 timeout 不是 P50；「评审不贵」的论断来自 cache key 设计（E52/E53/E44），没有实测 token/延迟。
8. **未核对运行时行为**：例如 `--unshare-pid` 与 `--proc` 在被内核拒绝时的回落分支（`linux-sandbox/README.md:102-107`）只按注释记录，未在容器内验证。

---

*基于 commit `67f0994b532b8740f14b5b738af7b7b2a915b1d6` 的浅克隆 · 全部证据可 grep 复核 · 生成于 2026-10-31*
