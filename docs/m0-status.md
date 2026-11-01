# M0 Status · Foundation

> 日期：2026-11-01  
> 范围：[ROADMAP.md](../ROADMAP.md) 的 M0（0–4 周）。  
> 结论：**M0 可运行骨架已落地**；真实 Windows OS 沙箱、PG MemoryHub、Guardian、CUA 治理属于 M1/M3，未在 M0 冒充完成。M1-A 的 Guardian shadow/CUA 策略/usage 指标已追加，见 [PROJECT_LOG.md](../PROJECT_LOG.md)。

---

## 1. 已实现

| 模块 | 文件 | 说明 |
|---|---|---|
| 事件日志 | src/core/events.ts | JSONL append-only；seq/session；重启可恢复 |
| Session / 消息投影 | src/core/session.ts | turn/step、user/assistant/tool 投影 |
| 请求四区 | src/core/request.ts | Z0 稳定 system+tools、Z1 历史、Z2 runtime、Z3 instruction；canonical JSON + SHA-256；deepFreeze |
| 权限阶梯 | src/core/permissions.ts | read/write/exec/memory/kb；read-only/workspace-write/danger；untrusted/on-request/never；危险命令拒绝；会话审批缓存 |
| 工作区守卫 | src/core/sandbox.ts | 路径逃逸拒绝；读写/list；shell 执行；明确 osBoundary=false |
| Shell 沙箱 | src/core/sandbox.ts | cwd 固定 workspace；timeout；输出捕获；策略门；M0 不是 OS 边界 |
| MemoryProvider | src/core/memory.ts | 接口 + SQLite 开发实现；唯一权威、版本、tombstone、scope、contract |
| KnowledgeBaseProvider | src/core/kb.ts | local-docs 只读；citation/snippet；root 限制 |
| 工具层 | src/core/tools.ts | read/write/edit/list/run_shell/memory_write/memory_search/kb_search；统一 tool/call/result 事件 |
| 模型适配 | src/core/model.ts | ScriptedModel（demo）+ OpenAI-compatible（有 key 时） |
| Agent 循环 | src/core/agent.ts | 请求冻结、缓存前缀稳定性、工具循环、turn/step 事件 |
| TUI | src/core/tui.ts | Weft banner、/status、/plan、/events、/memory、/kb、/demo、审批提示 |
| CLI | src/cli.ts | --demo、--yes、--workspace、--mode、--approval |
| 测试 | tests/ | 77 个测试：request/permissions/memory/memory-http/memory-postgres/pgvector-probe/pgvector-index/memory-consolidation/memory-injection/memory-governance/memory-hub/memoryhub-server/memoryhub-mcp/vector-index/kb/kb-http/kb-web/kb-mcp/metrics/model-usage/model-http/agent-http/guardian-model/actors/scheduler/event-bus/capabilities/context-projection/goal/checkpoint/eventlog/agent/guardian/cua/sandbox/workgraph |

---

## 2. 运行

~~~powershell
# demo（无需 API key）
node --experimental-strip-types src/cli.ts --demo

# 或
.\weft.cmd --demo

# 测试
node --test --test-isolation=none --experimental-strip-types tests/all.test.ts

# 或
.\test.cmd
~~~

有模型时：

~~~powershell
$env:WEFT_MODEL_API_KEY = "..."
$env:WEFT_MODEL_BASE_URL = "https://api.deepseek.com/v1"
$env:WEFT_MODEL = "deepseek-chat"
node --experimental-strip-types src/cli.ts
~~~

---

## 3. Demo 结果

脚本化任务：写 demo/weft-m0.txt → 读回 → 跑 node -e 验证 → memory_write → memory_search → kb_search → 汇总。

预期输出：

~~~text
Weft M0 complete: file written, shell verified, memory stored and recalled, knowledge base searched.
steps=7 toolCalls=6 cacheStable=6
events=56 [...]
request cachePrefixStable=true ...
~~~

---

## 4. M0 exit criteria 对照

| 条件 | 状态 | 说明 |
|---|---|---|
| 一个真实任务读/写/跑测试 | ✅ | demo 任务；真实模型可接 OpenAI-compatible |
| 重启恢复 | ✅ | EventLog 重开同 session 继续 seq |
| 请求分区可见 | ✅ | request/frozen 记录 prefixHash/systemToolsHash |
| 前缀稳定 | ✅ | cachePrefixStable 在后续 step 为 true；provider 实际命中待 M1 接真实模型 |
| 沙箱拒绝越界写 | ✅ | WorkspaceGuard 路径守卫；OS 边界未实现 |
| 审批缓存 | ✅ | ApprovalStore；同类 action 第二次走 cache |
| MemoryProvider 契约 | ✅ | SQLite 实现过 write/get/search/forget/scope/version |
| KB 只读接口 | ✅ | local-docs，citation，root 限制 |
| TUI 启动/审批/状态 | ✅ | /status /plan /events /demo；交互审批 y/s/n |
| 文档/接口 | ✅ | PRD/ROADMAP/docs/interfaces/appendix |

---

## 5. 已知限制（不掩盖）

1. **Sandbox 不是 OS 边界**：M0 是 workspace-guard + 命令策略；shell 仍以当前用户执行。Windows RestrictedToken/MXC 属 M1。**这不是要求改外层 DSH 授权**；两个沙箱的边界见 [sandbox-boundaries.md](sandbox-boundaries.md)。
2. **Memory 是 SQLite 开发实现**：PRD 默认 Red Hat 型 PG+pgvector+graph；M0 只验证 MemoryProvider 契约与单权威语义。PG provider 属 M3。
3. **Guardian 未实现**：M0 只有审批阶梯；Guardian shadow 属 M1。
4. **CUA 未实现**：只有策略位置；治理/驱动属 M1/M4。
5. **模型**：默认 ScriptedModel；真实模型需 env key；没有 key 时 TUI 会提示。
6. **测试 runner**：Node 24 的 node --test 在此环境会 spawn EPERM，使用 --test-isolation=none 跑同进程。
7. **Shell 输出捕获**：DSH 内 Node child_process pipe 会 EPERM；ShellSandbox 已改为临时文件重定向，demo 的 shell 才是真正执行成功。
8. **Docker/WSL conformance**：Docker Linux backend 6 项 PASS；WSL root/default 基础 PASS（非 root SKIP，见 [wsl-conformance.md](wsl-conformance.md)）；Windows 原生 backend 未做。Docker/WSL 不覆盖 Windows GUI/CUA。
9. **Postgres/pgvector**：真实 postgres:16-alpine 契约 PASS；pgvector v0.8.0 源码编译，vector(1536)+HNSW+cosine PASS；PgVectorIndex 已接入 MemoryHub，真实 vector search PASS。

---

## 6. 下一步（M1）

1. Windows OS 沙箱后端（RestrictedToken 或 Docker/Windows Sandbox provider；先 fail-closed）。
2. Guardian shadow（风险/授权/超时/熔断；不直接拦截）。
3. CUA 治理策略（app allowlist/锁屏/日志；driver 只接 MCP）。
4. 缓存真实观测（provider cacheReadTokens；首 miss 归因）。
5. PG MemoryHub 骨架（PG+pgvector；SQLite provider 保留为 dev）。
6. KB 适配器：web/mcp-kb/http-kb；注入防护样本。
7. 指标仪表：审批次数/缓存/记忆/KB 延迟。

---

## 7. 代码地图

~~~text
src/
  cli.ts
  core/
    agent.ts        # loop, request freeze, cache stability
    events.ts       # JSONL event log
    session.ts      # messages projection
    request.ts      # zones + canonical hash + freeze
    permissions.ts  # policy + approval cache
    sandbox.ts      # workspace guard + shell runner
    memory.ts       # MemoryProvider + SQLite dev
    kb.ts           # KnowledgeBaseProvider + local-docs
    tools.ts        # tool registry/executor
    model.ts        # scripted + OpenAI-compatible
    tui.ts          # Weft TUI
tests/
  all.test.ts
  request.test.ts
  permissions.test.ts
  memory.test.ts
  kb.test.ts
  eventlog.test.ts
  agent.test.ts
~~~
