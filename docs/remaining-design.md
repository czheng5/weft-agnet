# 完整设计与剩余工作

> 结论：PRD v1.0 IN 范围已完成。按 M0–M5 全路线，v1.5/v2.0 仍有设计未实现；当前重点是“硬化 + 验证”，不是继续堆概念。

## 当前产品优势（优先级排序）

1. **权限/沙箱是一等公民**：审批阶梯、会话缓存、Guardian、Docker/WSL OS 后端，失败 fail-closed。
2. **缓存优先请求结构**：Z0–Z3 + canonical hash；真实 DeepSeek cacheReadTokens=2304。
3. **记忆有唯一权威**：Postgres + pgvector + graph + outbox；巩固/冲突/注入/RBAC。
4. **长任务可追溯**：Work Graph + Plan + Checkpoint + Evidence + GoalEvaluator；50 步验收通过。
5. **Surface/模型不锁死**：TUI/CLI/HTTP/MCP；OpenAI-compatible + 本地模型。

## 完成度

| 范围 | 完成度 | 说明 |
|---|---|---|
| PRD v1.0 IN（M0–M3） | 100% | 代码、单测、真实模型、PG/pgvector、Docker/WSL |
| M4/v1.5 | 0% | 原生 Windows、CUA driver、多租户、Web/Desktop、技能演化 |
| M5/v2.0 | 0% | 协议、Bench、插件生态、Polyglot 默认化 |
| 生产硬化 | 20% | 有验收脚本和 gate；缺压测/故障注入/CI/打包/安全评审 |

## 剩余设计（按优先级）

| 优先级 | 工作 | 为什么需要 | 验收 |
|---|---|---|---|
| P0 | 长任务真实模型验收 | 50 步 harness 是编排验收，不是模型长任务 | 100 步、逐步 confidence、可恢复 |
| P0 | 故障恢复/幂等 | 进程崩、工具半成功、重复执行 | kill/resume、无重复写 |
| P0 | 多 provider 验收 | 只验了 DeepSeek | DeepSeek/OpenAI/本地同场景 |
| P1 | 原生 Windows RestrictedToken/MXC | 当前 Docker/WSL 不是原生进程沙箱 | canary suite |
| P1 | CUA driver | 只有策略，不能真正操作 GUI | app allowlist + 锁屏 |
| P1 | WSL 网络隔离 | network 检查 SKIP | bwrap/unshare 或防火墙 |
| P1 | 多租户/RBAC/配额 | v1.0 单用户假设 | 隔离/越权/配额测试 |
| P1 | 生产可观测性 | 有 metrics，无 tracing/SLO/告警 | dashboard + SLO |
| P2 | Web/Desktop surface | 只有 TUI/CLI | 同 core 多 surface |
| P2 | 技能演化 | Capability 只有安装/卸载 | held-out/canary/rollback |
| P2 | Polyglot provider | 附录设计未实现 | 同 MemoryProvider 契约 |

## 建议顺序

1. 用真实模型跑 100 步长任务，补失败注入与恢复。
2. 多 provider 矩阵（DeepSeek/OpenAI/本地）。
3. 原生 Windows backend + CUA driver。
4. 多租户/可观测性/打包发布。
5. 再进 M5 协议与生态。

## 一句话

**v1.0 立住的是“可运行、可验证的 Agent Harness”；完整设计还差“生产硬化 + 原生 Windows/CUA + 多租户/多 surface”。**
