# Internal CDC Specification (offline)

- All asynchronous single-bit inputs must pass through a two-flop synchronizer.
- The first flop is the metastability capture stage; the second flop is the stable stage.
- The synchronized output must come from the second flop.
- No external synchronizer IP and no network access.

Review the RTL against this specification.
