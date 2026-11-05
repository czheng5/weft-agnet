# EDA-Gated Hardware Bench

> 状态：gate 已实现；当前环境工具缺失，结果 **BLOCKED**，不宣称 PASS。  
> 通过标准：功能仿真 + coverage + 综合网表 + PERC 全部有证据。  
> 工具/PDK 是自动发现项，不是产品硬限制：PATH、WEFT_EDA_BIN、OSS_CAD_SUITE、PDK_ROOT、OPENLANE_ROOT 等都会被扫描。

## 为什么需要它

之前的 3 个 reference 只证明“推理/证据检查框架”工作，不证明 RTL 正确。
本 bench 把“参考文字”升级为工具门：

1. lint
2. functional simulation
3. coverage threshold
4. synthesis netlist
5. PERC/electrical rule check

任何一项缺失或未验证，整体不得为 PASS。

## 当前命令

~~~powershell
node --experimental-strip-types scripts/eda-bench.ts
~~~

当前结果：

~~~text
EDA BLOCKED  ic-fifo-full
  blocked    toolchain: missing: verilator, yosys, iverilog, verilator_coverage
  blocked    functional: simulation not run
  blocked    coverage: coverage not run
  blocked    synthesis: synthesis not run
  unverified perc: PERC/electrical rule deck is not bundled
EDA BENCH NOT PASS
~~~

## 新增硬件资产

- scenarios/closed-world/ic-fifo/rtl/sync_fifo_fixed.v
- scenarios/closed-world/ic-fifo/tb/sync_fifo_tb.sv
- scenarios/closed-world/ic-fifo/eda.json

testbench 覆盖：

- reset flags
- fill to DEPTH
- full at exactly DEPTH
- over-capacity write ignored
- drain all entries
- empty after drain

## 明确限制

- 本机没有 verilator/yosys/iverilog
- 即使装了工具，coverage 百分比解析和 PERC rule deck 仍未配置
- 因此状态保持 BLOCKED，不会把“reference 答对”冒充“电路通过”
- 需要安装开源 EDA 工具，并提供 PERC 规则/商业工具，才能签核

## 不接受的替代标准

- reference.json 全 PASS
- 只有 lint
- 只有仿真，没有综合
- 有网表，但 coverage/PERC 未验证
