# Platform and Web UI Plan

Status: planning note for the next iteration. This file records gaps, not commitments.

## Platform matrix

| Area | Linux | macOS | Windows |
|---|---|---|---|
| TUI | supported | supported by Node TTY | supported by Node TTY; raw mode smoke-tested |
| default shell boundary | `workspace-guard` | `workspace-guard` | `workspace-guard` |
| OS sandbox | `bwrap` (when installed) | no native backend yet | `wsl` / `docker`; native backend not implemented |
| container | `docker` | `docker` | `docker` |
| install | `install.sh` | `install.sh` | `install.ps1` |
| zsh | runner-independent; no completion | runner-independent; no completion | n/a |

### Gaps

- **macOS**: no native seatbelt / `sandbox-exec` backend. `workspace-guard` is a policy boundary, not an OS isolation boundary. Docker is the only current OS-level option.
- **Windows**: `windows-restricted-token` is declared in the backend type but not implemented; it fails closed. Native job-object / restricted-token isolation remains a gap.
- **zsh**: the command runner uses the platform shell and does not install zsh completion or startup integration. Linux/macOS terminal work should add completion and a `weft` wrapper, without changing the shell used for policy-controlled command execution.
- **CI**: the current matrix must be checked for macOS and Windows TTY/raw-mode behavior, not only unit tests.

## P0: Linux/macOS terminal polish

1. Add zsh completion for `weft`, slash commands, and keymap help.
2. Add a shell wrapper that preserves the user's zsh environment but keeps command execution deterministic.
3. Add macOS seatbelt backend as a fail-closed candidate; verify availability before advertising it.
4. Add a platform doctor command: report TTY, raw mode, shell, sandbox backend, and unavailable capabilities.
5. Add CI jobs for Linux, macOS, and Windows; include a PTY smoke test for `?`, `Ctrl+K`, and approval keys.

## P1: Windows native boundary

Implement `windows-restricted-token` using a restricted token and job object, with a probe that fails closed. Keep WSL and Docker as explicit alternatives.

## Web UI / GUI roadmap

The gateway, SSE, RuntimeStore, Workboard, PWA shell, and Marketplace routes already exist; there is no general chat/dashboard UI yet.

### Phase 1: read-only dashboard

- Threads list, event timeline, Workboard, metrics, sandbox/approval status.
- SSE-driven; no mutation.
- React + Vite + TypeScript; reuse event types from `src/core` rather than a new schema.

### Phase 2: interactive control plane

- Create thread, send message, approve/deny, cancel.
- Approval UI mirrors TUI key semantics: `Y` once, `S` session, `N` deny.
- Token auth, localhost bind by default, Origin checks, CSRF protection.

### Phase 3: PWA / mobile

- Reuse the existing PWA manifest and service worker.
- Offline event cache and cursor-based sync; no blind write replay.

### Phase 4: desktop GUI

- Prefer Tauri (Rust shell + TypeScript UI) over a second Node runtime.
- Reuse the same web UI and gateway; desktop is a shell, not a second backend.

### Design constraints

- One event contract, three surfaces: TUI, Web, Desktop.
- No UI-only state that contradicts RuntimeStore.
- Approvals and denials must show a structured reason.
- Never expose secrets in URLs, logs, or browser storage.
