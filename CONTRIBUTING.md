# Contributing to Weft

Thanks for helping. Weft values **correctness, auditability, and fail-closed behavior** over feature count.

## Before you start

- Read PRD.md, ROADMAP.md, and docs/interfaces.md.
- For a new capability, open an issue first with the acceptance criteria.
- Security-sensitive changes need a threat model and tests.

## Setup

~~~powershell
git clone https://github.com/czheng5/weft-agnet.git
cd weft-agnet
npm install
Copy-Item .env.example .env
npm test
~~~

Node.js >= 24 is required.

## Rules

1. One canonical implementation per capability; alternatives go through provider + contract tests.
2. No silent fallback from a stricter sandbox to a weaker one.
3. Every new tool needs: permission mapping, deny path, workspace-escape test.
4. Every new memory/provider path needs: write/search/delete/scope/conflict tests.
5. No secrets in code, tests, fixtures, screenshots, or logs.
6. Public API changes need docs and a changelog entry.

## Tests

~~~powershell
npm test
npm run demo
npm run demo:v1
npm run acceptance:long
~~~

Docker/WSL conformance is optional locally and not required for every PR; security-related PRs should state what was run.

## Pull requests

- Keep changes focused.
- Describe behavior change and evidence.
- Include commands run and results.
- Link the issue and update docs/CHANGELOG.md.
- By contributing, you agree your contribution is licensed under MIT.

## Commit style

Use a short imperative subject, e.g.:

- feat: add provider contract test
- fix: reject workspace escape on symlink
- docs: record v1.0.2 acceptance

## Code of conduct

Be direct, technical, and respectful. Harassment or disclosure of private data is not acceptable.
