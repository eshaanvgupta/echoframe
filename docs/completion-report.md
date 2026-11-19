# ECHOFRAME delivery report

Verified on **2026-11-19**, Windows, Node **24.16.0**, pnpm **10.34.9**. The binding specification was read completely; official protocol research is retained with source URLs and exact supported profiles. The implementation is in this repository, not a hosted prototype. There is no paid runtime API, hosted database, mandatory AI key or money-moving default path.

## Implemented and working

- Nine strict TypeScript ESM packages: core, celo, x402, mpp, erc8183, node, cli, mcp and react. Packed tarballs and installed-consumer checks verify package exports outside workspace aliases.
- Independent versioned bundle verification: canonical domain-separated keccak256 event chain and root, exact SHA-256 artifact manifests, bounded input parsing, EIP-712 bundle/proof signature verification, reproducible outcome policies and explicit provenance downgrading of imported claims.
- Read-only Celo reconciliation: official network identity checks, bounded retries/backoff and 429 Retry-After handling, cancellation, fallback configuration, receipt/block inclusion, strict ERC-20 logs, explicit multiple-log selection, exact units/expectations, historical decimals and optional RPC agreement.
- Narrow, honest protocol adapters: official x402 v2 codec and local HTTPFacilitatorClient path; official mppx evm one-shot charge codecs; pinned ERC-8183 reference job views and receipt event decoding. Unsupported profiles fail explicitly.
- SQLite and IndexedDB attempt journals: atomic idempotent create, append-only transitions, persistent unknown recovery, unique settlement attribution and conservative retry guidance. No tool signs, sends or forces refunds.
- Six read-only MCP tools, tested with actual stdio and in-memory official MCP clients. Eight CLI commands, including installed `echoframe verify`, return the same offline verification report as the browser-compatible module.
- Responsive static PWA: overview and state-driven SVG circuit, Trace Explorer, Failure Lab, Outcome Studio, Payment Journal, Developer Console, Evidence Vault, Grant Evidence, Methodology and portable story view. Four viewport sizes, themes, keyboard operation, reduced motion, local persistence and offline operation are exercised.
- All 16 runnable adversarial simulations, actual state transitions, virtual seeded timing, vulnerable/honest comparison, explicit policy toggles, invariant counts, missing evidence and generated executable Vitest regressions. They are labeled SIMULATED and do not claim real-world exploitability.
- Visual policy builder and safe JSON DSL: presence, status, required/type/value constraints, bounded numeric/schema checks, recorded-clock freshness, declared MIME/size, exact SHA-256, source signatures, supplied cross-checks, deterministic numeric folds, narrow bounded regex and subjective `NOT_MACHINE_VERIFIABLE` checks.
- Private/public bundle exports, encrypted AES-GCM files, independently verifiable proofs, deterministic redacted diffs, downloadable manifests and escaped self-contained HTML reports. Public-minimal mode removes bodies, artifacts, identities and signatures; complete local retention is explicit.
- Actual screenshots, source research, threat model, API/quickstart/deployment documentation, grant dossier, factual metric ledger, dependency notices and a pinned-action CI workflow.

## Commands actually executed

| Gate | Observed final result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed across all 14 workspace projects |
| `pnpm typecheck` | Passed: nine packages, frontend, tests and examples |
| `pnpm lint` | Passed with zero errors |
| `pnpm test` | **298 passed**, 23 files, zero failures |
| `pnpm audit:licenses` | **360 installed package manifests** reviewed by the license scanner; no undeclared or incompatible licenses flagged |
| `pnpm build` | Passed: package declarations/ESM and production static frontend |
| `pnpm test:consumer` | All nine tarballs installed in a clean temporary consumer; installed CLI VALID; **16 generated regressions passed** |
| `pnpm test:e2e` | **42 passed, 6 intentionally skipped**, zero failures; 1440, 768, 390 and 360px |
| `pnpm test:performance` | Mobile simulated Lighthouse: **100 performance, 100 accessibility, 100 best practices, 100 SEO** |
| `pnpm audit --json` | **No known advisories**, all severity counts zero at check time |

The automated two-theme axe audit covers 10 routes (20 route/theme combinations). Full scenario clicking and the automated two-theme audit run on desktop; those six repeated checks are deliberately skipped on other viewports. Every viewport still runs essential interactions, import/tamper, proof compilation, replay controls/downloads, encrypted file import/export, offline persistence, RPC failure, focus/reduced motion and overflow checks.

Fixed-seed fast-check executes **2,500 action sequences of 8–40 actions** with seed 42220 and **2,000 identity cases** with seed 8183. Illegal transitions, history mutation, false terminal settlement without evidence and unsafe ambiguity recommendations are checked. SQLite is actually closed/reopened. The official x402 client performs real loopback HTTP verify/settle calls only against a deliberately synthetic local facilitator. Nothing reaches an actual payment signer or settlement contract.

Machine records: [release-verification.json](release-verification.json), `artifacts/gate-results.json`, unit/E2E JSON reports, consumer results, license/advisory audit and Lighthouse report. The final gate sweep corrected a local Lighthouse launcher harness error and resumed only the failed performance/audit suffix; unchanged successful application gates were retained. A later standalone lint pass covered the corrected scripts. This report records final observed results, not a claim that intermediate attempts never failed.

Production assets total about **903KB before compression**, including local licensed fonts. All JavaScript chunks total about **220KB gzip**, CSS about **8KB gzip**, within declared 350KB/40KB budgets. Exact byte counts are in the release record. No remote font, image, analytics or AI request is required.

## Real network evidence and its limits

Both official Forno endpoints returned the expected chain IDs. The live smoke test inspected real public mainnet and Sepolia transactions without signing or submitting anything. The mainnet observation decoded a multiple-Transfer transaction and explicitly selected one log only to exercise the decoder. The Sepolia transaction had no supported Transfer and correctly remained payment UNKNOWN. Both retained delivery UNKNOWN. Details and genuine transaction references are in [live-rpc-observations.json](live-rpc-observations.json).

These are public read-only observations. They are **not ECHOFRAME customer activity, consenting purchases, payment integrations or adoption**. Identity research read official configured registry bytecode; no real agent identity was enrolled or verified. No ERC-8183 deployment was supplied or independently vetted.

## Remaining limitations and external prerequisites

- RPC observations rely on the provider and block data, not a cryptographic light client. Two endpoints can agree and still be wrong. Transfer-looking logs do not certify normal token economics or offchain purchase context.
- x402/MPP adapters inspect supported syntax and structural consistency. They do not claim production payment-signature validity, server HMAC authenticity or operational settlement transport. Broader flows, sessions, subscriptions, alternate EVM methods and unknown draft interfaces are unsupported.
- ERC-8183 remains a draft with conflicting prose/reference interfaces. The supported reference profile needs an explicitly configured address and matching code pin. A pin is not an audit, particularly for proxies. Live job coverage awaits a vetted deployment.
- An unsigned bundle can be rewritten and fully rehashed; retain a trusted root or signer separately. A signature authenticates a key's statement, not universal truth, identity or work quality. Safe schema coverage is a deliberately bounded subset, not unrestricted JSON Schema execution.
- Chromium emulation was tested; no physical MiniPay, iOS or Android device certification, external penetration audit or universal WCAG conformance claim is made. Automated checks and manual visual review cannot replace all human accessibility testing.
- No three external feedback sessions, independent developer activations, consenting ECHOFRAME mainnet trace, sponsored-payment eligibility or grant award was observed. The dossier supplies an opt-in plan and preserves `not_yet_observed` metrics.
- Website hosting and npm package publication were not performed. The deployable directory is **apps/web/dist**; [deployment.md](deployment.md) gives exact Cloudflare Pages Free commands. No Worker/Functions or keys are needed. The requested GitHub source publication is separate from website deployment and is verified by the remote commit at handoff.

The source, local package artifacts, static build and reproducible checks are delivered. Mainnet activity, external feedback and publication-dependent prerequisites remain explicitly separate from software correctness.
