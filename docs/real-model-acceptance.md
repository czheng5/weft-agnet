# Real Model Acceptance（DeepSeek）

> 日期：2026-11-02  
> Provider：DeepSeek（deepseek-chat）  
> 结果：**PASS**  
> 安全：API key 只在运行时从用户提供的 .env 读入环境变量，未写入仓库、未打印。

## 1. Agent 真实任务

命令：

~~~powershell
node --experimental-strip-types scripts/real-acceptance.ts
~~~

任务：读 README → 写 result.txt → 跑 shell 验证 → 写 memory → 回答。

结果：

~~~text
REAL MODEL ACCEPTANCE
  model=deepseek-chat
  steps=4 toolCalls=6 cacheReadTokens=2304 cacheStable=3
  result.txt="Weft Acceptance is a project that verifies a real model-driven agent with tools, memory, and sandboxing."
  tools=read_file:ok,list_dir:ok,write_file:ok,run_shell:ok,memory_write:ok,read_file:ok
  answer=All four steps completed successfully. ...
~~~

证据：

- 真实模型调用成功
- 6 次工具调用全部 ok
- cacheReadTokens=2304（DeepSeek prompt_cache_hit_tokens）
- 文件写入/读回/ shell / memory 均执行
- cacheStable=3（后续请求前缀稳定）

## 2. Guardian 50 动作（真实模型）

~~~text
GUARDIAN 50 ACTION SHADOW PASS
  actions=50 allow=40 deny=10 mismatches=0
  note=real model
~~~

## 3. 结论

真实模型路径已验证：计划→工具→文件→shell→memory→回答。  
外部 key 不再是验证阻塞项；但 key 未持久化，部署时仍需注入。
