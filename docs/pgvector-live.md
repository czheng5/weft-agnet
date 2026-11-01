# pgvector Live Validation

> 日期：2026-11-01  
> 环境：Docker Desktop / postgres:16-alpine + 源码编译 pgvector v0.8.0  
> 结果：**PASS**

## 构建

在运行中的 weft-pg 容器内：

~~~sh
apk add --no-cache build-base git postgresql16-dev
git clone --branch v0.8.0 --depth 1 https://github.com/pgvector/pgvector.git /tmp/pgvector
cd /tmp/pgvector
make with_llvm=no
make install with_llvm=no
~~~

安装结果包含：

- /usr/lib/postgresql16/lib/vector.so
- /usr/share/postgresql16/extension/vector.control

## 启用

~~~sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS memories_embedding_idx
  ON memories USING hnsw (embedding vector_cosine_ops);
~~~

结果：CREATE EXTENSION / ALTER TABLE / CREATE INDEX 全部成功。

## 查询验证

~~~sql
CREATE TEMP TABLE vec_test (id text, embedding vector(3));
INSERT INTO vec_test VALUES ('a','[1,0,0]'),('b','[0,1,0]');
SELECT id, embedding <=> '[1,0,0]' AS distance
FROM vec_test ORDER BY embedding <=> '[1,0,0]' LIMIT 1;
~~~

结果：

~~~text
 id | distance
----+----------
 a  |        0
(1 row)
~~~

## 结论

- PostgreSQL + pgvector 扩展真实可用。
- memories 表已有 vector(1536) 与 HNSW cosine 索引。
- 仍需把 PgVectorIndex 接入 MemoryHub 的向量检索路径；当前代码默认使用 InMemoryVectorIndex。
- 真实 key/50 动作/OS conformance 仍未完成。
