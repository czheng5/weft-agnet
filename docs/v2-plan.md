# Weft v2 开发路线（Checkpoint v2-plan-01）

> 状态：已确认的路线 checkpoint  
> 日期：2026-11-04  
> 适用范围：M4 / M5 / M6；v1.0 已完成  
> 说明：这是开发路线，不是 v2.0 已实现声明。

## 版本与阶段

| 阶段 | 主题 | 版本 | 目标 |
|---|---|---|---|
| M0–M3 | 单会话 Agent Harness | v1.0 | 已发布 |
| M4 | Consolidation | v1.5 | 统一 schema/契约，不做完整 Gateway |
| M5 | Agent Gateway / Super-agent | v1.6 | 一个对外负责人 + 多个沙箱 Worker |
| M6 | Own Shape | v2.0 | 协议、生态、Surface、BYOM、多租户 |

## M4 范围（v1.5）

只做收口：

- Thread / Worker / Event / Mandate / Capability schema
- tenantId / projectId / workspaceId
- Durable Store 接口与迁移
- EventLog / Outbox 契约
- Capability manifest 契约
- v1.0 数据只读兼容
- contract tests

不做：

- 完整 Router/Worker 运行时
- Web/Desktop
- CUA driver
- 插件市场
- 完整多租户/计费

## M5 范围（v1.6）

第一个可用的 Super-agent 形态：

1. Durable Thread Store + EventLog + Outbox
2. Agent Gateway：HTTP/SSE、Webhook、CLI
3. Router + Eval + Policy + Mandate
4. Source/Trigger（先 HTTP/GitHub）
5. Worker Pool + lease + bwrap/Docker/WSL
6. Watchdog（进度导向）
7. CLI/TUI 接入
8. Capability Registry 基础版

不做：

- 完整 Web/Desktop
- 飞书/邮件全渠道
- 插件市场 UI
- BYOM
- 多租户计费/复杂 RBAC

## M6 范围（v2.0）

- Web/Desktop Surface
- Capability Registry + Marketplace
- BYOM daemon
- 多租户/RBAC/配额
- Polyglot / Knowledge / Model Provider
- Weft Protocol + Weft Bench
- 领域包（AlphaForge 等）

## 架构模块

~~~text
Weft v2.0
├─ Control Plane
│  ├─ Agent Gateway
│  ├─ Router / Intake
│  ├─ Thread Store
│  └─ Policy / Mandate / Tenant
├─ Runtime
│  ├─ Work Graph / Checkpoint
│  ├─ Worker Pool / Lease
│  ├─ EventLog / Outbox
│  └─ Watchdog
├─ Execution
│  ├─ bwrap / Docker / WSL
│  ├─ Capability Lease
│  └─ Model Router
├─ Memory & Knowledge
│  ├─ MemoryHub
│  ├─ Context Projection
│  └─ Knowledge / Verification Providers
├─ Ecosystem
│  ├─ Capability Registry
│  ├─ Marketplace
│  └─ Domain Packs
└─ Surfaces
   ├─ CLI / TUI
   ├─ HTTP / SSE
   └─ Web / Desktop
~~~

## 原则

1. 一个概念一个 owner/schema/contract。
2. Thread 持久化是默认，Actor 可丢。
3. Worker 无状态，配置/状态不放在 Worker。
4. 配置版本化；运行中任务固定 manifest，不静默换模型。
5. 权限按 Task Mandate + Capability Lease，不逐命令问。
6. 投机执行不采用；只允许只读预取/草稿。
7. 最终交付/高风险动作才走 Reviewer Gate。
8. 沙箱默认 fail-closed；bwrap 是 Linux 真实边界。
9. 发布必须过测试、README、CHANGELOG、release 检查。

## 未决问题

见 [appendix/v2-open-questions.md](../appendix/v2-open-questions.md)。  
未决问题不阻塞 M4 的 schema/契约工作；涉及具体实现的，按问题清单逐项决定。
