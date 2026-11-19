# Security policy

Never attach secrets, private credentials, seed phrases, passport documents or unredacted payment signatures to a public issue. Use a private GitHub vulnerability report if enabled, or contact the repository owner through their GitHub profile to arrange a private channel. No dedicated response SLA or external audit is claimed.

ECHOFRAME has no custody, signing, broadcast or refund tooling. Runtime RPC methods are explicitly read-only. MCP cannot accept arbitrary URLs or file paths. HTTP examples bind only to loopback and use deliberately synthetic verification and settlement; they are unsuitable as payment processors.

The principal trust boundaries, mitigations and regression references are in [docs/threat-model.md](docs/threat-model.md). Hash consistency is not authenticity. A compromised browser, malicious extension, altered local database, dishonest RPC quorum or trusted signer's false statement are outside what an offline verifier can eliminate.

Dependency versions and the lockfile are pinned. Run `pnpm audit` and `pnpm audit:licenses` before releases. Public RPC availability and upstream draft compatibility can change. Never weaken unknown/ambiguous states into fresh-payment instructions.
