# Weft 2.5.0 Release Validation

Status: pre-release audit. This is not a release signoff until every gate below is evidenced.

## 1. Automated gates

| Gate | Command | Result |
|---|---|---|
| Unit/integration suite | `npm test` | **153 pass, 0 fail** |
| Long-task acceptance | `npm run acceptance:long` | **PASS** |
| CLI demo | `node bin/weft.mjs --demo` | **PASS** |
| TUI non-TTY state smoke | `/help /keys /model /settings /sessions /board /actors /caps /clear /quit` | exit 0, no `undefined/NaN/[object Object]` |
| TUI render stability | `tests/tui-render.test.ts` | repeated render at widths 40/60/72/100/120 stable |

Long-task report:

```text
LONG TASK ACCEPTANCE PASS
steps=50 checkpoints=5 evidence=50 replay=50
goalDone=true resumeTasks=50 minConfidence=0.9 avgConfidence=0.945
report=.weft/acceptance/long-task.json
```

This validates the harness mechanics (event log, checkpoints, evidence, replay, resume, goal completion). It is a scripted acceptance, not a live-model reasoning benchmark.

## 2. TUI state audit

| State | Enter | Return | Status |
|---|---|---|---|
| startup | alternate screen, top bar, tabs, welcome, footer | prompt | PASS (rendered screenshot) |
| `?` key help | full-screen panel | Esc returns to same panel | render stable |
| `Ctrl+K` command deck | filter/list | Esc/Enter returns | render stable |
| `F2` model picker | saved profiles or empty state | Esc/Enter returns | render stable |
| `F3` settings | cwd/model/sandbox/approvals | Esc returns | render stable |
| `Shift+Tab` panels | CHAT/BOARD/EVENTS/SESSIONS/ACTORS/CAPS | each redraw | smoke tested |
| `/clear` | clears transcript | chat redraw | smoke tested |
| approval | Y/S/N/Esc | resumes agent | unit/agent paths tested |
| alt-screen exit | `/quit`/`Ctrl+D`/double Ctrl+C | restores terminal | smoke tested |

Known gaps:

- Windows native `weft` shim is not installed on this machine; documented WSL path is recommended.
- macOS was not physically run in this environment; the POSIX `install.sh` path is syntax-reviewed but not mac-host tested.
- Live-model planning is not validated because no model key is configured in this environment.
- ACTORS/CAPS panels currently expose session events and explicitly say TUI runtime attachment is next; they are not fake live actor/capability inventories.

## 3. Reliability risks before aerospace/IC use

1. **No live-model long-horizon benchmark yet.** Scripted 50-step acceptance is necessary but not sufficient.
2. **Windows native isolation incomplete.** `windows-restricted-token` is declared but not implemented; fail closed.
3. **macOS native sandbox missing.** `workspace-guard` is policy, not OS isolation; Docker is the only current OS-level option.
4. **TUI is text-only.** No mouse, no transcript virtualization for huge logs, no theme system yet.
5. **No external independent verifier in CI.** The harness can record evidence; a separate verifier must validate it.

Release rule: do not claim "aerospace-grade" until these are closed and independently verified.

## 4. Acceptance project: WFK-1 Flight Kernel

A substantial, self-contained project designed to test long-horizon planning, checkpoints, evidence, and independent verification without external hardware.

### Goal

Build `validation/flight-kernel/`: a deterministic, bounded, fail-closed command/telemetry kernel for a high-assurance system.

Required behavior:

- 5-state machine: `BOOT`, `SAFE`, `ARMED`, `RUNNING`, `FAULT`.
- Commands: `arm`, `disarm`, `start`, `stop`, `reset`, `inject-fault`.
- Only valid transitions are accepted; every rejection has a stable reason code.
- Redundant command inputs are deduplicated by sequence number.
- All queues and histories are bounded; overflow is observable and fail-closed.
- Watchdog triggers `FAULT`; `reset` requires safe conditions.
- Deterministic replay: same seed and command stream produce identical trace.
- Every state transition emits an immutable event with sequence, reason, and evidence id.
- No floating point in safety decisions; use integer ticks.

### Deliverables

```text
validation/flight-kernel/
  SPEC.md                 requirements + traceability matrix
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

### Acceptance (simple and checkable)

1. `npm test` in the project: 0 failures.
2. Every requirement in `SPEC.md` maps to at least one named test.
3. 10,000 random command streams across 100 seeds:
   - no invalid transition accepted;
   - same seed produces byte-identical trace;
   - every rejection has a reason code.
4. 10,000 queued commands: memory/history bounded; overflow is recorded and fails closed.
5. Watchdog fault injection in every non-fault state reaches `FAULT` within the specified tick bound.
6. `evidence/acceptance.json` records commit, command, test counts, seed set, and failure count.
7. A separate verifier can rerun the acceptance command from a clean checkout.

### Long-horizon workflow for Weft

1. `/goal Build WFK-1 ...`
2. Break into tasks: spec, FSM, queue, watchdog, replay, tests, evidence, review.
3. Checkpoint after each task; attach evidence to task completion.
4. Run tests and fault injection; never mark a task done without command output.
5. Use independent verifier step; reject missing/truncated evidence.
6. Final report must list requirement → test → evidence, not just “passed”.

### Ready-to-paste task prompt

```text
Build validation/flight-kernel as specified in docs/flight-kernel-brief.md.

Hard rules:
- create a Work Graph with one task per deliverable;
- checkpoint after each task;
- every completion must cite command output as evidence;
- fail closed on ambiguity;
- do not claim pass without rerunning acceptance from the workspace;
- keep all queues/histories bounded;
- use integer ticks only;
- finish with a requirement-to-test-to-evidence matrix.
```

## 5. Verdict

2.5.0 is mechanically green for the tested harness paths: 153 tests, 50-step scripted long acceptance, stable TUI renderers, and clean state-transition smoke.

It is not yet a live-model reliability signoff, and not yet aerospace/IC-grade. The WFK-1 project is the next gate: it must be run with a live model, independently verified, and its evidence reviewed before claiming large-project reliability.
