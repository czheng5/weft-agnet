# Real PostgreSQL Runtime Contract

> 日期：2026-11-04  
> 环境：postgres:16-alpine，host 127.0.0.1:55432/weft  
> 结果：**PASS**

## 命令

~~~powershell
$env:WEFT_PG_URL = "postgres://postgres:weft@127.0.0.1:55432/weft"
node --experimental-strip-types scripts/runtime-pg-live.ts
~~~

## 结果

~~~text
RUNTIME PG CONTRACT PASS
  thread=thread-74f5c8a6-d60a-411d-bd53-120ed1ec8800
  eventSeq=1 idempotent=true
  leases=1 mandates=1 capabilities=1 outbox=1
~~~

## 覆盖

- Thread create/get/list
- RuntimeEvent seq + idempotency
- WorkerLease acquire/heartbeat
- Mandate
- Capability id/instructions 持久化
- Outbox enqueue/claim/complete
- tenant scope 列表隔离

## 说明

这是 RuntimeStore 的真实 PostgreSQL 契约，不是 pg-mem 模拟。  
测试使用唯一 tenant，结束后清理；没有写入真实用户数据。
