# Weft v1.0 开发台账（按顺序）

> 目标：完成 PRD 中 v1.0 IN 的 M0–M3 功能，并通过非 OS 验证；OS/Windows/WSL conformance 统一留到最后。
> 规则：一次只推进一个 feature；先写测试再更新 PROJECT_LOG；不把未验证项标成完成。

## 状态

| 里程碑 | 状态 | 说明 |
|---|---|---|
| M0 | ✅ | 事件日志/请求四区/权限/审批/沙箱守卫/TUI/接口 |
| M1 | ◐ | Docker Linux OS 边界 PASS；Memory/KB/Guardian/CUA/metrics 未收口 |
| M2 | ◐ | Work Graph 地基；Actor/Scheduler/EventBus/Capability/压缩未做 |
| M3 | ⏳ | MemoryHub 完整/v1.0 gate 未开始 |

## M1 剩余（按顺序）

| 顺序 | F-ID | 功能 | 状态 | 验收 |
|---|---|---|---|---|
| 1 | F-MF-002 | 记忆写入/巩固/冲突消解 | ✅ duplicate/new-wins/manual | 冲突可解释，旧记录 superseded |
| 2 | F-MF-003 | 记忆检索/注入 | ✅ search + Agent 自动注入 | 作用域内召回并进入上下文 |
| 3 | F-MF-004 | 治理 scope/RBAC/审计/删除 | ✅ RBAC + scope/audit/tombstone | 越权拒绝，删除可传播 |
| 4 | F-KB-002 | local/web/MCP KB 适配器 | ✅ local/http/web/mcp | 四个适配器可切换 |
| 5 | F-OB-001 | 指标/评测 | ✅ TUI /metrics；审批/工具/cache/延迟 | cache/打断/延迟可见 |
| 6 | F-CX-003 | 缓存命中观测 | ◐ usage 事件已有；真实 provider 待接 | cacheReadTokens > 0 |
| 7 | F-PS-003 | Guardian | ◐ 规则 shadow 已有；模型 reviewer 未做 | shadow 对比记录 |
| 8 | F-PS-001 | OS 沙箱 | ◐ Docker Linux PASS；Windows/WSL 最后统一验证 | 至少一个 OS 后端 |

## M2（M1 收口后）

| 顺序 | F-ID | 功能 | 状态 |
|---|---|---|---|
| 1 | F-WG-001 | Goal 契约 + evaluator | ◐ Goal 有；evaluator 未做 |
| 2 | F-WG-002 | Plan 工件（落盘/审阅/重注入） | ◐ JSON 有；独立 Plan/审阅未做 |
| 3 | F-WG-003 | Work Graph 节点/边/证据 | ◐ Task DAG 有；Evidence/Checkpoint 未做 |
| 4 | F-AR-001 | Actor Runtime | ⏳ |
| 5 | F-SC-001 | Scheduler cron/wakeup/monitor | ⏳ |
| 6 | F-EB-001 | Event Bus + Hooks | ◐ 日志有；订阅/hook 未做 |
| 7 | F-CP-001 | Capability Package registry | ⏳ |
| 8 | F-CX-002 | 压缩/投影/retention | ⏳ |

## M3（v1.0 gate）

- F-MF-001/002/003/004 完整：PG+pgvector+graph、outbox、混合召回、治理。
- F-MF-005 默认 provider 契约测试。
- F-KB-002 三适配器集成。
- F-OB-001 指标/评测。
- F-PS-003 Guardian 可选 enforce。
- v1.0 文档/演示/发布。

## 固定规则

1. 不跳过 M2 直接做 M3。
2. OS conformance 最后统一做；开发期用 unit/contract/mock 验证。
3. 每个 feature 完成：测试 + PROJECT_LOG 一行 + commit。
4. 未通过验证的能力只能标 ◐，不能标 ✅。
