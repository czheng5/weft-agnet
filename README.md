# Weft（纬）

> **Weft is a policy-governed, cache-first, long-horizon, memory-growing agent harness.**
>
> 三线成纬，一机成章。Codex 之手 + Claude 之脑 + DSH 之脊 + Hermes / MemoryHub 之记忆。

## 当前状态

- **PRD v1.0：FROZEN**（2026-11-01）
- **Roadmap v1.0：FROZEN**（2026-11-01）
- 默认 Memory：**Red Hat 型 MemoryHub**（PG + pgvector + 图 / Valkey / MinIO / MCP / Auth）
- 未来 Polyglot：**附录 A**，不进入 v1.0
- v1.0 不做 MemoryHub 专用 UI；Weft TUI/CLI 是主界面

## 开发文档

| 文档 | 内容 |
|---|---|
| [PRD.md](PRD.md) | 8 概念、F-ID、MemoryHub 默认、KB 接口、NFR、验收、变更控制 |
| [ROADMAP.md](ROADMAP.md) | M0–M5、exit criteria、依赖、回滚、Feature → Milestone |
| [docs/interfaces.md](docs/interfaces.md) | MemoryProvider / KnowledgeBaseProvider 契约 |
| [docs/m0-status.md](docs/m0-status.md) | M0 实现状态、运行命令、限制、M1 下一步 |
| [PROJECT_LOG.md](PROJECT_LOG.md) | 项目管理台账：模块/问题/效果、时间线、缺口、下一步 |
| [docs/sandbox-boundaries.md](docs/sandbox-boundaries.md) | 外层 DSH 沙箱 vs 内层 Weft 沙箱；为什么不需改授权 |
| [docs/sandbox-verification.md](docs/sandbox-verification.md) | OS 边界完整验证：VM/容器/Windows Sandbox/CI/红队方法与矩阵 |
| [docs/docker-conformance.md](docs/docker-conformance.md) | Docker Linux backend conformance 结果（6 项 PASS） |
| [appendix/polyglot-hub.md](appendix/polyglot-hub.md) | 附录 A：未来 Polyglot 记忆 provider |
| [report/README.md](report/README.md) | 四家源码研究、融合架构、推导审计、集合审计、Memory 研究 |
| [brand/README.md](brand/README.md) | Weft 品牌、Weft Cyan、TUI 模板 |

## 八个概念

Work Graph · Actor Runtime · Scheduler · Event Bus · Capability Package · Memory Fabric · Context Projection · Surface Renderer。

## 规则

1. 同一能力只保留一个 canonical 实现；第二实现必须走 provider + 契约测试。
2. PG 是 Memory 唯一权威；Vector/Redis 是可重建派生。
3. 不三路双写；写权威 + outbox。
4. 记忆不是知识库；KB 只读、带引用、注入防护。
5. 先安全执行，再长程规划，再记忆成长。
6. v1.0 缝合、v1.5 收口、v2.0 自有形状。

## M0 + M1-A + M2 地基

- 事件日志/消息投影/请求四区/冻结请求
- 权限阶梯 + 会话审批缓存 + workspace 守卫
- SQLite MemoryProvider + local-docs KBProvider
- 工具层 + ScriptedModel/OpenAI-compatible + Weft TUI
- Guardian shadow + CUA 策略 + model usage/cacheReadTokens（M1-A）
- WSL sandbox backend（M1-B）：probe/命令构造/fail-closed；`--sandbox wsl` 在 DSH 内显式失败，不静默降级
- Docker Linux container backend：`--network none`、`--read-only`、`--cap-drop ALL`、非 root、资源限制；`--sandbox docker`；conformance 6 项 PASS
- HTTP KB 适配器：`--kb-url` / `WEFT_KB_URL`，Bearer + scope headers + timeout；只读、不自动入 Memory
- HTTP MemoryHub 适配器：`--memory-url` / `WEFT_MEMORY_URL`，远程 MemoryProvider；默认仍是 SQLite dev
- Postgres MemoryProvider：`--pg-url` / `WEFT_PG_URL`，pg Pool + 契约实现；pg-mem 测试通过
- `conformance.cmd`：workspace-guard / docker 的边界 canary 脚本
- M2 Work Graph 地基：Goal/Task DAG/依赖/ready/todo 投影；TUI `/goal` `/task` `/tasks` `/start` `/done`
- 60 个测试通过；`node --experimental-strip-types src/cli.ts --demo`

细节与限制见 [docs/m0-status.md](docs/m0-status.md)。

## 下一步

按 [ROADMAP.md](ROADMAP.md) 进入 M1：Windows OS 沙箱、Guardian shadow、CUA 治理、真实缓存观测、PG MemoryHub 骨架。

