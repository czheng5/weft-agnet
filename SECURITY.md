# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | Yes |
| < 1.0 | No |

## Reporting a vulnerability

Please use GitHub Security Advisories:

https://github.com/czheng5/weft-agnet/security/advisories/new

Do not open a public issue for an unfixed vulnerability. Include:

- affected version/commit
- reproduction steps
- impact (sandbox escape, credential exposure, approval bypass, memory leak, etc.)
- suggested fix, if known

We aim to acknowledge within 72 hours and provide a remediation plan within 7 days.

## Secrets

- Never commit API keys, tokens, private keys, or .env files.
- Use environment variables or a secret manager.
- If a key is exposed, rotate it immediately; deleting the file is not enough because git history keeps it.

## Scope

High priority:

- sandbox escape / workspace escape
- approval bypass or silent allow
- cross-tenant memory/KB leak
- credential or prompt exfiltration
- arbitrary command execution outside policy
- supply-chain compromise of dependencies

Out of scope:

- denial of service from intentionally unbounded prompts
- issues requiring a compromised host/account
- model hallucination without a security boundary bypass
