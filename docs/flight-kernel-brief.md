# WFK-1 Flight Kernel Brief

Target: `validation/flight-kernel/` in this repository.

## Objective

Implement a deterministic, bounded, fail-closed command/telemetry kernel that demonstrates long-horizon engineering discipline.

## State machine

States: `BOOT`, `SAFE`, `ARMED`, `RUNNING`, `FAULT`.

Commands: `arm`, `disarm`, `start`, `stop`, `reset`, `inject-fault`.

Rules:

- Only listed transitions are legal.
- Every rejection has a stable reason code.
- `inject-fault` from any non-fault state enters `FAULT`.
- `reset` leaves `FAULT` only when the fault input is clear.
- Watchdog expiry enters `FAULT` within a fixed tick bound.
- Deduplicate commands by monotonically increasing sequence number.
- All queues/histories are bounded; overflow is observable and fail-closed.
- Use integer ticks only; no floating point in safety decisions.
- Emit immutable events for every accepted/rejected command and transition.

## Required files

```text
SPEC.md
src/state-machine.ts
src/command-queue.ts
src/watchdog.ts
src/event-log.ts
src/replay.ts
tests/state-machine.test.ts
tests/fault-injection.test.ts
tests/determinism.test.ts
tests/bounds.test.ts
evidence/acceptance.json
README.md
```

## Acceptance

1. Project test command exits 0 with 0 failures.
2. `SPEC.md` has a requirement-to-test matrix, every requirement covered.
3. 100 seeds × 10,000 random commands:
   - no invalid transition accepted;
   - identical seed produces byte-identical trace;
   - every rejection has a reason code.
4. 10,000 queued commands: all buffers bounded; overflow recorded and fail-closed.
5. Watchdog fault injection reaches `FAULT` within the documented tick bound.
6. `evidence/acceptance.json` contains commit, command, test counts, seed set, failure count.
7. A separate verifier can reproduce acceptance from a clean checkout.

## Rules for the agent

- Create a Work Graph task per deliverable.
- Checkpoint after each task.
- Do not mark complete without command output evidence.
- Fail closed on ambiguity.
- No secrets in logs or evidence.
- Final report: requirement → test → evidence.
