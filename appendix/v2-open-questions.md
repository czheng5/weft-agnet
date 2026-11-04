# Appendix：v2 未决问题备忘录

> 状态：备忘录，不是冻结设计。  
> 用途：记录当前仍模糊、需要后续验证/决策的问题。  
> 原则：有则改之，无则加勉；未决定的不写成已实现。

## A. 存储与状态

- 默认 SQLite 是一个 weft.db，还是 control/project 两个 DB？
- SQLite WAL、busy_timeout、备份/恢复的具体参数？
- tenant/project/workspace 三级 scope 的索引和隔离方式？
- Thread/Event/Outbox/Lease 是单库多表，还是按 tenant 分库？
- SQLite 到 Postgres 的迁移是否要求零停机？
- 事件保留周期、压缩/归档策略？
- 文件 Artifact 与数据库引用的原子性如何保证？

## B. 配置与 Secret

- 配置热更新的边界：哪些可热更，哪些必须重启？
- 运行中 Assignment 固定 manifest，配置变更后旧任务如何收尾？
- Provider 删除/禁用时，运行中任务失败还是继续？
- Secret 用 OS keychain、env、Vault，还是多后端？
- 配置历史是否要暴露给 UI？是否需要审批？
- 模型配置是否允许 per-project 覆盖全局？

## C. Gateway 与 API

- HTTP/SSE 的 API 版本策略？
- Webhook 幂等键、重放保护、签名校验？
- Thread/Message/Event 的分页和 cursor 语义？
- 是否支持 WebSocket，还是 SSE 足够？
- 多入口（CLI/HTTP/GitHub）的 thread 合并规则？
- 认证先做本地 token，还是一开始就 OIDC？

## D. Router / Eval / Worker

- Router 是每 tenant 一个，还是每 workspace 一个？
- Router 批处理窗口、最大等待时间、背压策略？
- Gatekeeper 规则和 Secretary 模型判断的边界？
- Eval 的 accept/stop/ignore/unavailable 状态是否照搬？
- Worker 最大并发、lease 时长、心跳间隔、fencing 策略？
- Worker 崩溃后是重启、换 Worker，还是等人？
- Worker 是否允许再创建 Subagent？深度/预算限制？

## E. 权限与沙箱

- Capability Lease 的意图组如何定义？
- 授权是按 thread、ticket、workspace，还是时间窗口？
- 网络权限按域名、方法、路径，还是代理策略？
- 外部只读的敏感路径清单如何维护？
- bwrap 在无 user namespace 的机器上如何 fail-closed？
- Docker/WSL/bwrap 的选择链和回退规则？
- 沙箱失败后的“一次性升级”如何审计和过期？

## F. BYOM / 远程执行

- BYOM daemon 的协议：WebSocket、gRPC、HTTP？
- 机器身份、配对、证书/密钥轮换？
- 断线、离线、重连后的任务归属？
- 远程 Worker 能否访问本地文件/网络？边界如何声明？
- 是否支持多台机器、GPU/CPU 标签调度？
- 远程执行的日志/证据如何回收？

## G. Watchdog

- 进展信号是什么：WorkGraph 节点、Evidence、工具结果、token 预算？
- 多久没进展算卡住？
- 重启、换 Worker、降级、上报的决策树？
- Watchdog 自己卡住怎么办？
- 如何避免 Watchdog 产生额外大量 token？

## H. 投机执行（已决定不采用）

- 保留“只读预取/草稿”是否需要独立开关？
- 预取结果过期、失效、污染的清理策略？
- 如何保证预取不产生外部副作用？
- 是否只允许沙箱内、无网络、无凭据的预取？

## I. 多租户与市场

- v2.0 是否只做单用户 + tenant 字段，完整 SaaS 后置？
- 配额按 token、并发、存储还是任务数？
- RBAC 角色最小集合？
- Capability 市场的信任模型：签名、权限、eval、版本兼容、撤销？
- 市场是否允许第三方代码？沙箱如何声明需求？
- 插件收益/评分是否引入？如何防止刷分？

## J. Surface 与产品

- Web/Desktop 技术栈？是否共用同一 Gateway/Event cursor？
- TUI/CLI 是否继续作为一等公民？
- 通知/attention budget 如何度量？
- 面板默认只显示“需要人”的事，具体分类？
- 多语言/本地化优先级？

## K. 知识与验证

- Kn 的 Knowledge/Model Factory 以 Provider 还是 Sidecar 接入？
- solver/verifier 作为 Capability 还是独立服务？
- AlphaForge 角色/SOP 作为 Capability Pack 的边界？
- 哪些输出必须过 Reviewer Gate？哪些只记录？
- 知识/记忆的 candidate→review→publish 是否与 Weft Memory 合并？

## L. 发布与运维

- 每个版本 push 前的最小 gate？
- README/CHANGELOG/PROJECT_LOG 的更新责任？
- 远程历史与本地历史不一致时如何修复？
- tag/版本号规则：v1.5/v1.6/v2.0 是否严格对应 M4/M5/M6？
- CI 是否覆盖 bwrap/Arch/Docker/WSL/Windows？
- 敏感日志/密钥扫描是否作为 release 必过项？

## M. 未定命名

- Thread Store / Runtime Store / State Store
- Capability Lease / Task Mandate
- Router / Intake / Dispatcher
- Worker Pool / Execution Fabric
- Watchdog / Supervisor
