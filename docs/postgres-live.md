# Postgres Live Contract

> 日期：2026-11-01  
> 环境：Docker Desktop / postgres:16-alpine / host port 55432  
> 结果：**PASS**

## 容器

~~~powershell
docker rm -f weft-pg
docker run -d --name weft-pg -e POSTGRES_PASSWORD=weft -e POSTGRES_DB=weft -p 55432:5432 postgres:16-alpine
~~~

## 命令

~~~powershell
$env:WEFT_PG_URL = "postgres://postgres:weft@127.0.0.1:55432/weft"
node --experimental-strip-types scripts/pg-live.ts
~~~

## 结果

~~~text
POSTGRES LIVE CONTRACT PASS
  write=committed get=ok search=1 forget=complete health=true
~~~

## 覆盖

- 真实 PostgreSQL 连接（pg Pool/tcp）
- 建表（memories/memory_versions/memory_audit）
- write / get / search / forget / health
- scope 隔离由 provider 查询条件保证

## 未覆盖

- **pgvector 未安装**：postgres:16-alpine 不含 vector 扩展，migrations/001_memoryhub.sql 的 CREATE EXTENSION vector 未执行。
- 需要 pgvector/pgvector:pg16 或自建扩展镜像后，再跑 vector/HNSW 验证。
- 远端 TLS/连接池压测未做。
