# Changelog

All notable changes are documented here. Format follows Keep a Changelog; versions use SemVer.

## [2.4.0] - 2026-11-04

### Added

- Tianxi-inspired Workboard projection and thread priority/owner/due/labels metadata.
- GET /workboard and Surface workboard view.
- Automatic EDA/PDK environment discovery (PATH/env/common roots), no hard-coded tool block.
- 133 tests.

## [2.3.0] - 2026-11-04

### Added

- ObjectiveAnchor anti-drift guard integrated into AgentLoop.
- Fail-closed EDA bench gate; current environment BLOCKED, no fake hardware PASS.
- 130 tests.

## [2.2.0] - 2026-11-04

### Added

- Signed marketplace bundles with Ed25519 publisher verification and key revocation.
- OIDC JWT verification, JWKS, dynamic jti revocation and Gateway revoke endpoint.
- FairWorkerPool with tenant round-robin and concurrency.
- Storage/compute separation orchestration baseline: DeploymentSpec, LocalArtifactStore CAS, WorkerFleet, DeploymentOrchestrator.
- 127 tests.

## [2.1.0] - 2026-11-04

### Added

- Closed-world reasoning/hardware scenarios: FIFO, CDC, timing; offline evidence checks.
- 117 tests.

## [2.0.0] - 2026-11-04

### Added

- M6-A self-contained Web Surface served by Gateway.
- M6 Capability Registry API and BYOM ModelRegistry.
- M6 RBAC principals, tenant scope isolation and thread/message quotas.
- M6 Weft Protocol weft/1 envelope and Weft Bench percentiles.
- M6 Capability Marketplace checksum bundles.
- 114 tests.

## [1.6.0] - 2026-11-04

### Added

- M5 Agent Gateway: HTTP threads/messages/events, bearer auth, idempotency, outbox enqueue.
- M5 WorkerPool, Router/Mandate, SSE, Watchdog, AgentLoop seam, Eval gate, HTTP Source, CLI serve.
- M5 WorkerPool: outbox claim, worker lease, heartbeat, complete/fail/backoff.
- M5 Router: admission, mandate capability/expiry, idempotent Outbox routing.
- M5 SSE events stream and independent Watchdog expired-lease alerts.
- M5 AgentLoop seam + Eval gate.
- 105 tests.

## [1.5.0] - 2026-11-04

### Added

- sandboxed approval profile: docker/wsl backends auto-allow routine workspace exec; dangerous commands still deny.
- bwrap native Linux backend: namespace isolation, read-only host, workspace bind, network disable.
- M4 runtime schema/contract: Thread, WorkerLease, RuntimeEvent, Mandate, CapabilityManifest, Outbox; runtime-store interface; migration 002.
- SQLite RuntimeStore adapter: threads, append-only events, leases, mandates, capabilities, outbox.
- Postgres RuntimeStore adapter (pg-mem contract).
- Thread ↔ WorkGraph binding: one graph per thread, persisted threadId, mismatch fail-closed.
- CapabilityRegistry unified on runtime CapabilityManifest; v1 legacy manifests migrate on read/write.
- v1.0 read-only migration: workgraph/capabilities into runtime store without mutating legacy files.
- Real PostgreSQL RuntimeStore contract PASS; tenant scope isolation.
- 95 tests.

## [1.0.2] - 2026-11-02

### Added

- README rewrite with pain points, architecture, install, configuration, acceptance evidence.
- Acceptance matrix for 12 hardening tracks.
- 50-step long-task acceptance harness and report.
- .env auto-loading, .env.example, install.ps1, install.sh.
- One-line installers: curl -fsSL .../install.sh | sh and irm .../install.ps1 | iex.
- Open-source repository configuration: MIT license, CI, Dependabot, security policy, contributing guide.

### Changed

- Test count: 78 pass.

## [1.0.1] - 2026-11-02

### Added

- Real DeepSeek acceptance: 6 tool calls, cacheReadTokens=2304, cacheStable=3.
- Real-model Guardian 50: 50 actions, 0 mismatch.
- DeepSeek prompt_cache_hit_tokens mapping.

## [1.0.0] - 2026-11-01

### Added

- M0–M3: event log, request zones, policy/approval, sandbox, memory, KB, Work Graph, Actor, Scheduler, Event Bus, Capability, Context Projection, TUI.
- Real PostgreSQL + pgvector + HNSW + PgVectorIndex.
- Docker Linux and WSL non-root conformance.
