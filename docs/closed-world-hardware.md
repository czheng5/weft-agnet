# Closed-World Reasoning & Hardware Scenarios

> 状态：离线情景框架与 3 个参考情景已实现；reference PASS 不是硬件 signoff。  
> 目标：验证“断网 + 纯推理 + 内部文件”能否产出可审计的工程结论，而不是只做聊天。

## 1. 运行方式

~~~powershell
node --experimental-strip-types scripts/closed-world-bench.ts
~~~

输出：

~~~text
REFERENCE-ONLY OK  cdc-two-flop  score=1.00
REFERENCE-ONLY OK  ic-fifo-full  score=1.00
REFERENCE-ONLY OK  ic-timing-negative-slack  score=1.00
CLOSED-WORLD REFERENCE CHECK PASS
  scenarios=3 offline=true
  NOT a hardware signoff; use scripts/eda-bench.ts
~~~

## 2. 框架

- src/core/closed-world.ts
  - 只读内部文件；拒绝绝对路径、URL、.. 路径穿越
  - 加载 manifest/files/reference
  - 评估 submission：
    - finding id 唯一
    - claim 关键词
    - evidence path + line 合法
    - patch 关键词
    - forbidden 网络字符串
- scenarios/closed-world/<scenario>/
  - manifest.json
  - spec/报告/RTL
  - reference.json（证据化参考答案）

## 3. 情景

### IC FIFO full off-by-one

- 内部 spec：DEPTH=8，full 在 count==DEPTH 时有效
- RTL：count == DEPTH - 1
- 要求：定位、引用行、最小 patch

### CDC two-flop synchronizer

- 内部 spec：异步单 bit 必须两级同步
- RTL：只有 meta 一级，sync_out 直接来自 meta
- 要求：指出缺少第二级并补 sync_q

### 100 MHz MAC timing

- 内部 timing report：slack -0.35 ns
- 要求：解释 setup violation，并给 pipeline/retime 方案

## 4. 测试覆盖

- 3 个 reference 全部 PASS
- 错误 patch 失败
- 错误 citation 失败
- manifest 路径穿越失败
- 117 tests pass

## 5. 限制

- 这是确定性的证据/结构检查，不是真实 LLM 自动评分
- 没有跑 RTL 仿真/综合/STA 工具
- 参考情景规模小，用于回归与接口约束
- 下一步可接 Verilator/Yosys/OpenSTA 做工具证据
