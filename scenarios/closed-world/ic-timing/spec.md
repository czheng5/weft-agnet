# Internal Timing Closure Note (offline)

- Target clock: 100 MHz (10.0 ns period).
- The failing path has -0.35 ns slack after place-and-route.
- The path is a single-cycle multiply-accumulate feeding a register.
- Acceptable fixes: pipeline the multiply, retime the adder, or split the operation across two cycles.
- Do not change the external protocol; no network access.

Produce a closure recommendation grounded in the supplied report.
