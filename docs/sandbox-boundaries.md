# 沙箱边界：外层 DSH 沙箱 vs 内层 Weft 沙箱

> 结论：**不需要你改授权。** 当前 workspace-write 足够我继续开发；M1 的“Windows OS 沙箱”是 Weft 的产品能力，不是要求你放开对我的限制，也不是要求 API key / 管理员权限。

---

## 1. 两个沙箱，不要混

| | 外层：DSH sandbox | 内层：Weft sandbox |
|---|---|---|
| 限制谁 | 限制我这个 Agent 的文件/命令 | 限制 Weft 运行时执行的 shell/文件 |
| 当前实现 | workspace-write（DSH 提供） | workspace-guard（Weft 自己实现） |
| 是否 OS 边界 | 是（平台提供） | **否**（M0 是用户态路径守卫） |
| 谁需要改 | 不需要改 | 需要 Weft 自己实现 OS 后端 |

“Windows OS 沙箱未实现”说的是**内层**：Weft 目前只能做路径守卫 + 命令策略，shell 仍以当前用户执行。它不是“我要求你改外层授权”。

---

## 2. 为什么当前环境不能完整验证内层 OS 沙箱

内层 OS 沙箱需要原生 Windows 能力：

- Restricted Token / AppContainer / Job Object / integrity level；
- 或 MXC BaseContainer / Windows Sandbox；
- 完整验证需要能启动受限进程、创建容器/账户/ACL 的测试环境。

当前环境观察到：

- Docker daemon 未运行；
- WSL 访问被拒绝；
- Chrome headless 被外层沙箱挡住（crashpad/mojo EPERM）；
- Node test runner 的 spawn 也被外层限制（所以用 test-isolation=none）。

因此：

- **可以**在当前 workspace 内写代码、接口、策略、单元测试；
- **不能**在当前环境完整证明“OS 级隔离生效”；
- **不应该**通过放开外层授权来伪造这个证明。

---

## 3. 不需要你做的事

- 不需要把 DSH approval 改成 danger-full-access。
- 不需要给 Weft 管理员权限。
- 不需要现在提供模型 API key；demo/tests 用 ScriptedModel。
- 不需要启动 Docker/WSL；那是可选的测试基础设施，不是开发前提。

---

## 4. M1 的正确做法

1. 定义 SandboxBackend 接口：workspace-guard / windows-restricted-token / docker / none。
2. 每个 backend 有 probe + fail-closed：不可用就拒绝执行，不静默降级。
3. M1 先实现 workspace-guard + 接口 + 单测；Windows 后端在原生测试机做 conformance。
4. 在任何时候，策略层都先于 backend：不允许“backend 不可用就裸跑”。

这样既推进产品能力，也不要求改你的授权。

---

## 5. WSL 诊断（2026-11-01）

实测结论：

- **Windows Terminal 外层**：wsl --status 正常，默认分发 Kali，默认版本 2。
- **DSH 内层**：wsl --status / wsl -l -v 返回 Wsl/E_ACCESSDENIED。
- DSH 内层的 USERPROFILE/LOCALAPPDATA/APPDATA/HOME 被重定向到 D:dsh_env...；真实用户 profile 下 WSL 包和 .wslconfig 都存在。
- 即使把 env 指回真实 profile，DSH 内仍然 E_ACCESSDENIED；说明不只是路径问题，外层 sandbox 的 token/服务/管道访问限制也在起作用。

判断：**WSL 本身没坏，是 DSH 外层 sandbox 下的嵌套访问被限制。** 这不是 Weft 的 bug，也不是必须修的阻塞项。

可选处理：

1. **推荐**：WSL 相关命令放到 Windows Terminal 外层跑；Weft 代码继续在 workspace 内开发。
2. 给 DSH 增加一条窄例外（WSL 包、Program Files\WSL、WSL service 管道）；这是安全策略变更，会削弱隔离，不建议只为测试做。
3. 用一次性 danger-full-access 提权跑 WSL；这等于绕过沙箱，不建议作为常规方案。

对 Weft 产品：WSL 仍可作为未来沙箱 backend 的候选，但必须在正常主机上做 conformance，不应该依赖“在 DSH 沙箱里嵌套 WSL”来证明。

---

## 6. 一句话

**外层沙箱是“限制我”的；内层沙箱是“Weft 限制它自己执行”的。前者不用改，后者要在 Weft 里实现；当前环境能写代码和单测，但不能完整验证 OS 边界，所以不能靠改授权来冒充完成。**
