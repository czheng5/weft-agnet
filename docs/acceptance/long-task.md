# A1 长任务验收（当前 50 步）

> 目标：长任务不是“跑完就算”，而是每一步可追溯、可检查置信、可恢复。  
> 当前结果：**50 步 PASS**；100 步真实模型版待跑。

## 运行

~~~powershell
node --experimental-strip-types scripts/long-task-acceptance.ts
~~~

## 结果

~~~text
LONG TASK ACCEPTANCE PASS
  steps=50 checkpoints=5 evidence=50 replay=50
  goalDone=true resumeTasks=50 minConfidence=0.9 avgConfidence=0.945
  report=D:\dsh_env\workspaces\codex_claude_dsh_comb_mod\.weft\acceptance\long-task.json
~~~

## 每步记录

report JSON 中每条记录包含：

- index
- taskId
- confidence
- evidenceId
- checkpoint（每 10 步）

## Pass 条件

- 50/50 task done
- 50 evidence
- 5 checkpoint
- 50 event replay
- GoalEvaluator done
- resumeTasks > 0
- min confidence >= 0.8

## 下一步（100 步真实模型）

1. 用真实模型执行 100 步（不是脚本直接 complete）。
2. 每步写 evidence + confidence，失败步骤标记 failed 而非跳过。
3. 第 30/60 步 kill 进程，从 checkpoint 恢复。
4. 最终 evaluator + 3 次 resume 记录。
5. 通过标准见 docs/acceptance-matrix.md 的 A1/A2。
