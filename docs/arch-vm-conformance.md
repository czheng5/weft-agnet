# Arch Linux VM Conformance

日期：2026-11-03
环境：VMware Workstation / Arch Linux 7.1.3-arch1-2 x86_64
用户：czheng uid=1000，groups 1000(czheng),998(wheel)
Node：v24.22.2（用户目录 tarball），npm 11.6.2
仓库：~/weft（GitHub main，含 sandboxed approval）

## 结果

- npm test：81 tests，81 pass，0 fail
- npm run demo：M0 complete，steps=7 toolCalls=6 cacheStable=6 cacheReadTokens=0
- npm run demo:v1：PASS，goal=true tasks=2 evidence=1
- npm run acceptance:long：PASS，50 steps / 5 checkpoints / 50 evidence
- npm run conformance:guard：RESULT PASS；non-root/network/write-outside SKIP
- npm run conformance:bwrap：6 项 PASS

## 结论

Weft 在真实 Arch Linux 用户态可安装、可测试、可运行。
workspace-guard 是路径/策略层；新增的 bwrap backend 是 Linux namespace 边界。
Arch VM 当前没有 Docker/Podman，因此没有跑 --backend docker。
bwrap 使用 namespace/ro-bind/cap-drop，不是 Landlock/seccomp；Windows/macOS 原生仍未实现。
