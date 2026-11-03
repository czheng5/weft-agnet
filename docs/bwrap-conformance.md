# Bubblewrap Linux Backend Conformance

日期：2026-11-03
环境：Arch Linux 7.1.3-arch1-2 / bubblewrap 0.13.1
用户：czheng uid=1000
结果：PASS（真实 Linux namespace 边界）

## 命令

npm run conformance:bwrap

## 结果

WEFT SANDBOX CONFORMANCE backend=bwrap workspace=/home/czheng/weft
PASS path escape is rejected
PASS workspace is reachable
PASS workspace write works
PASS non-root identity — uid=1000
PASS network egress is denied — exit=7
PASS write outside workspace is denied — exit=1
RESULT: PASS

## 实现

新增 BwrapSandboxBackend（src/core/sandbox-backends.ts）：
--unshare-all 隔离 network/pid/ipc/uts/cgroup
--ro-bind / / 宿主文件系统只读
--bind 工作区 只开放工作区写
--dev /dev、--proc /proc、--tmpfs /tmp
--cap-drop ALL
--die-with-parent、--new-session
probe 先跑 --version，再做 namespace smoke test；失败 fail-closed

## 意义

workspace-guard 是路径/策略层；bwrap 是真实 Linux OS 边界。
网络出站和 /etc 写入由内核 namespace/只读挂载拒绝，不是字符串检查。
--sandbox bwrap 自动使用 sandboxed 审批。

## 限制

仅 Linux；需要 bubblewrap 和可用的 user namespaces。
没有 GUI/CUA 隔离。
Windows RestrictedToken/AppContainer、macOS Seatbelt 仍未实现。
该验证在 VMware Arch guest 中完成，不是裸金属。
