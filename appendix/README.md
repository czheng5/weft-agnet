# Appendix

本目录存放**不进入 v1.0 默认栈**的未来备选设计。当前 PRD 见 [../PRD.md](../PRD.md)，roadmap 见 [../ROADMAP.md](../ROADMAP.md)。

| 附录 | 内容 | 状态 |
|---|---|---|
| [A · Polyglot Hub](polyglot-hub.md) | PG 唯一真相 + Vector 派生索引 + Redis 缓存；outbox/幂等/删除传播；未来作为 MemoryProvider 第二实现 | 未来备选，v2.0 评估 |
| [B · 外部知识库接口](../docs/interfaces.md) | KnowledgeBaseProvider 接口与边界（只读、引用、注入防护） | v1.0 预留接口 |

> 规则：附录方案不得进入 v1.0 默认组合；只有通过 MemoryProvider 契约测试、且真实规模指标证明默认方案不够时，才允许在 v2.0 模块化替换。
