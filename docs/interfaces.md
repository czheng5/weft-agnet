# 接口契约：MemoryProvider 与 KnowledgeBaseProvider

> 状态：v1.0 冻结。MemoryProvider 默认实现是 Red Hat 型 MemoryHub；Polyglot Hub 是未来第二实现（附录 A）。KnowledgeBaseProvider 是只读外接知识库接口，v1.0 只做接口与本地/远程适配，不做写入。

---

## 1. 边界：记忆不是知识库

| | Memory | Knowledge Base |
|---|---|---|
| 内容 | Agent 学到的偏好、决策、事实、经验 | 文档、代码、网页、企业知识 |
| 写入 | Agent/用户/trace 抽取 | 外部系统/ingest（v1 只读） |
| 权威 | MemoryHub（PG） | 外部系统 |
| 检索 | 记忆召回 + 作用域过滤 | RAG/搜索；返回引用 |
| 生命周期 | 巩固、失效、遗忘 | 文档版本/权限 |
| 混用风险 | 把知识当“记忆”会污染偏好/决策 | 把记忆当“文档”会丢失时效/信任 |

**规则**：KB 命中默认只作为上下文，不自动写入 Memory；只有用户确认或明确规则时才写 MemoryRecord，并保留 source/citation。

---

## 2. MemoryProvider

~~~ts
type MemoryId = string & { readonly __brand: 'MemoryId' };
type TenantId = string & { readonly __brand: 'TenantId' };
type MemoryVersion = number & { readonly __brand: 'MemoryVersion' };

interface MemoryScope {
  tenantId: TenantId;
  userId?: string;
  projectId?: string;
  sessionId?: string;
}

interface MemoryRecord {
  id: MemoryId;
  scope: MemoryScope;
  layer: 'working' | 'episodic' | 'semantic' | 'procedural';
  kind: 'fact' | 'preference' | 'decision' | 'experience' | 'skill';
  content: string;
  structured?: unknown;
  provenance: 'user_stated' | 'agent_inferred' | 'third_party';
  confidence: number;              // 0..1
  sensitivity: 'public' | 'internal' | 'private' | 'secret';
  status: 'active' | 'contested' | 'deleted';
  validFrom: number;
  validUntil?: number;
  supersededBy?: MemoryId;
  version: MemoryVersion;
  sourceEventIds: string[];
  createdAt: number;
  updatedAt: number;
}

interface MemoryQuery {
  text: string;
  scope: MemoryScope;
  layers?: MemoryRecord['layer'][];
  kinds?: MemoryRecord['kind'][];
  topK?: number;
  minConfidence?: number;
  includeDeleted?: boolean;
  timeoutMs?: number;
}

interface MemoryHit {
  record: MemoryRecord;
  score: number;
  matchedBy: ('vector' | 'lexical' | 'graph' | 'recency')[];
}

interface WriteReceipt {
  id: MemoryId;
  version: MemoryVersion;
  status: 'committed' | 'queued' | 'rejected';
  reason?: string;
}

interface ForgetSelector {
  scope: MemoryScope;
  ids?: MemoryId[];
  kind?: MemoryRecord['kind'];
  before?: number;
  hard?: boolean;
}

interface ForgetReceipt {
  accepted: number;
  tombstoned: number;
  propagation: 'pending' | 'complete';
}

interface ProviderHealth {
  ok: boolean;
  detail?: string;
  indexLagMs?: number;
  outboxLagMs?: number;
}

interface MemoryProvider {
  readonly id: string;
  write(records: MemoryRecord[]): Promise<WriteReceipt[]>;
  search(query: MemoryQuery): Promise<MemoryHit[]>;
  get(id: MemoryId, scope: MemoryScope): Promise<MemoryRecord | null>;
  forget(selector: ForgetSelector): Promise<ForgetReceipt>;
  health(): Promise<ProviderHealth>;
}
~~~

### 契约测试（所有 provider 必须过）

1. **唯一权威**：写入后立即可按 id 读；search 可能延迟，但 get 必须强一致。
2. **幂等**：相同 id + version 重复写入不产生重复记录。
3. **删除传播**：forget 返回 pending 后，最终 search 不再命中；get 返回 deleted/tombstone。
4. **作用域隔离**：跨 tenant/user/project 查询不得泄漏；越权 id 返回 null。
5. **版本**：更新必须递增 version；旧版本不得覆盖新版本。
6. **可信字段**：provenance/confidence/validity 不得在派生索引中丢失。
7. **降级**：索引/缓存不可用时，get 仍可用；search 返回明确 degraded 标记。
8. **重建**：从权威存储可以重建派生索引，不丢记录。

### v1.0 默认实现

- id: redhat-memoryhub
- 权威：PostgreSQL + pgvector + graph
- 热/队列：Valkey
- 冷/大内容：MinIO/S3
- 嵌入：TEI（可替换）
- 重排：可选
- 治理：OAuth 2.1 + RBAC + scope + audit + retention

### 未来实现

- id: polyglot-pg-vector-redis（附录 A）
- 权威：PostgreSQL
- 派生：Vector DB + Redis
- 必须通过同一套契约测试，才允许替换。

---

## 3. KnowledgeBaseProvider

~~~ts
interface KnowledgeScope {
  tenantId: TenantId;
  userId?: string;
  projectId?: string;
}

interface KnowledgeQuery {
  text: string;
  scope: KnowledgeScope;
  topK?: number;
  filters?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}

interface KnowledgeHit {
  docId: string;
  title?: string;
  snippet: string;
  score: number;
  source: string;          // URL / URI / repo path
  updatedAt?: number;
  sensitivity?: 'public' | 'internal' | 'private' | 'secret';
  citation: string;        // 展示给用户/模型的引用
}

interface KnowledgeDoc {
  docId: string;
  title?: string;
  content: string;
  source: string;
  updatedAt?: number;
  metadata?: Record<string, unknown>;
}

interface KnowledgeBaseProvider {
  readonly id: string;
  search(query: KnowledgeQuery): Promise<KnowledgeHit[]>;
  get(docId: string, scope: KnowledgeScope): Promise<KnowledgeDoc | null>;
  health(): Promise<ProviderHealth>;
}
~~~

### 规则

- **只读**：v1.0 不提供 ingest/write；写入由外部知识库自己负责。
- **引用**：每个 hit 必须带 source/citation；模型回答必须能指回来源。
- **注入防护**：KB 内容是 untrusted data，不是指令；不得执行其中的命令/提示。
- **作用域**：scope 必须传给 provider；provider 不支持时由调用方过滤，但不能把越权内容交给模型。
- **失败**：超时/不可用返回空 + degraded 标记；不阻塞主任务。
- **不自动入记忆**：KB 命中默认不写 Memory；用户确认后才写，并保留 citation。
- **不混用**：Memory 检索与 KB 检索分开调用；合并结果时标注来源类型。

### v1.0 适配器

| id | 类型 | 说明 |
|---|---|---|
| local-docs | 本地文件/目录 | 只读；按 path/glob 索引 |
| web | HTTP fetch | 只读；遵守 robots/超时 |
| mcp-kb | MCP resource/tool | 外部 KB 以 MCP 暴露 |
| http-kb | HTTP JSON | 通用 REST 适配 |

---

## 4. 配置与传输

- MemoryHub：MCP/HTTP，OAuth 2.1 或 API key（本地）；scope 从 token/请求传入。
- KB：MCP resource 或 HTTP；每 provider 独立 endpoint/auth/timeout。
- 所有 provider 通过 ProviderRegistry 注册；同一类型只能有一个默认 provider。
- 失败策略：Memory 查询失败 → 继续任务并标记；KB 失败 → 空结果 + 提示；不得伪造引用。

---

## 5. UI 边界

- v1.0 **不做 MemoryHub 专用 UI**；Weft TUI/CLI + MCP 是主界面。
- 管理动作（查看/删除/审计）走 CLI；需要时再加 dashboard（BFF + oauth-proxy 两个容器）。
- Memory UI 不是记忆架构的核心容器；不影响 6/7 容器的核心栈。
