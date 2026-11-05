# Objective Anchor / Anti-Drift Guard

> 针对“修一个小问题 → 研究 → 继续修 → 整个目标跑偏”的 harness 级约束。

## 核心

ObjectiveAnchor 是一份不可漂移的执行合同：

- id
- objective
- acceptance
- allowedPaths
- offline
- maxSteps
- maxToolCalls
- maxFailedAttempts
- allowDependencyInstall

AgentLoop 在每个工具调用前检查，调用后记录结果。

## 会直接停下的情况

- 写/读目标范围外路径：scope-drift
- 断网合同内发起网络：offline-boundary
- 未批准安装依赖：unplanned-dependency
- 同一失败动作重复达到阈值：rabbit-hole
- step/tool-call 预算耗尽：budget

停止时：

- 不继续“再研究一下”
- 写 anchor/blocked 事件
- 返回停止原因
- 保持原目标与验收标准

## 用法

~~~ts
const anchor = new ObjectiveAnchor({
  id: 'fix-fifo',
  objective: 'Fix FIFO full flag and prove it',
  acceptance: ['functional testbench passes', 'synthesis succeeds'],
  allowedPaths: ['src/core/', 'tests/', 'scenarios/'],
  offline: true,
  maxSteps: 20,
  maxFailedAttempts: 2
});
const agent = new AgentLoop({ model, session, toolContext, anchor });
~~~

## 测试

- 范围外写入拒绝
- 网络/网络命令拒绝
- 依赖安装拒绝
- 同一失败重复两次后 rabbit-hole
- step budget 耗尽拒绝

## 限制

- 这是确定性 guard，不理解语义上的“跑偏”
- 主要依赖路径/动作/失败签名/预算
- 对合法探索需要显式放宽 allowedPaths 或预算
- 不应该用“再试一次”绕过 blocked；需要修改合同或由人重新授权
