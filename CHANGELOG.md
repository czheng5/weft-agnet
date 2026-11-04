# Changelog

All notable changes are documented here. Format follows Keep a Changelog; versions use SemVer.

## [Unreleased]

### Added

- sandboxed approval profile: docker/wsl backends auto-allow routine workspace exec; dangerous commands still deny.
- bwrap native Linux backend: namespace isolation, read-only host, workspace bind, network disable.
- M4 runtime schema/contract: Thread, WorkerLease, RuntimeEvent, Mandate, CapabilityManifest, Outbox; runtime-store interface; migration 002.
- SQLite RuntimeStore adapter: threads, append-only events, leases, mandates, capabilities, outbox.
- Postgres RuntimeStore adapter (pg-mem contract).
- Thread ↔ WorkGraph binding: one graph per thread, persisted threadId, mismatch fail-closed.
- 92 tests.

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
