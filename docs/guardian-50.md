# Guardian 50-action Shadow Harness

> 日期：2026-11-01  
> 结果：**PASS（harness）**  
> 注意：模型是确定性 fake model，不是真实 LLM；只验证影子对比管线，不替代真实 50 动作验收。

## 运行

~~~powershell
node --experimental-strip-types scripts/guardian-50.ts
~~~

## 结果

~~~text
GUARDIAN 50 ACTION SHADOW PASS
  actions=50 allow=40 deny=10 mismatches=0
  note=fake model mirrors rule; real model/key still required
~~~

## 覆盖

- 10 read
- 10 write inside
- 5 write outside
- 5 safe exec
- 5 dangerous exec
- 5 unknown exec
- 5 memory
- 5 kb

共 50 个动作；GuardianShadow 同时跑规则和模型，记录 mismatch，返回规则决策。

## 未覆盖

- 真实 LLM 的 50 动作对比（当前无 WEFT_MODEL_API_KEY/DEEPSEEK_API_KEY/OPENAI_API_KEY）。
- 模型超时/限流/误判统计。
- Guardian enforce 模式的真实拦截。
