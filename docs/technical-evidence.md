# ECHOFRAME 1.1.0 technical evidence

This release separates three evidence classes: deterministic local simulations, a genuine user-authorized Celo Sepolia purchase, and public read-only mainnet observations. None is counted as independent adoption or production economic usage.

## Reproduce the release

Node 24 LTS, pnpm 10.34.9 and a clean checkout are required. The default checks need no wallet, API key, AI service or paid infrastructure.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm release:check
node scripts/report.mjs
corepack pnpm build
corepack pnpm --filter @echoframe/web build:pages
corepack pnpm test:pages
corepack pnpm audit:secrets
corepack pnpm release:assets
node scripts/secret-scan.mjs --verify-only
```

The ten-gate runner executes frozen installation, typecheck, lint, unit/integration/property tests, license audit, build, independent installed consumer, browser tests, Lighthouse performance and moderate-level dependency audit. Failures stop execution; no retry hides a failed assertion. The pinned CI runs the same gate runner on fresh Ubuntu/Node 24 checkouts, installs Chromium and prepares the versioned archives. A version tag publishes only after that run passes. Main-branch Pages deployment also depends on its completed quality job.

Exact results and platform are machine-generated in [release-verification.json](release-verification.json). Full logs, test JSON, consumer results, Lighthouse, bundle budget, dependency/license audits, Pages checks and secret scanning ship in the evidence archive. [Workflow history](https://github.com/eshaanvgupta/echoframe/actions/workflows/ci.yml) and the final [publication record](publication.json) identify actual remote runs. CI reports identify their source commit and explicitly record that publication was still pending at report generation.

## Independent package consumer

`pnpm test:consumer` creates nine real tarballs, installs all of them in a temporary project outside the workspace, imports every installed ESM package, exercises HTTP/Hono instrumentation and SQLite recovery, invokes the installed CLI, and runs 18 regressions: 16 scenarios, one generated local trace and the genuine captured Sepolia evidence regression. It never signs or pays. The install uses public registry dependencies and no registry publication is inferred.

`node scripts/install-release.mjs <new-directory>` repeats installation using the actual public release archives and verifies their checksums. The release handoff additionally tests those downloaded packages outside the monorepo. Checksums establish matching bytes against the release manifest; the release origin must still be trusted.

## Genuine Sepolia purchase

[Complete evidence and provenance](evidence/celo-sepolia-2026-11-19/) records the owner's explicit publication consent. The four JSON files are unchanged from the supplied Downloads files. The generated regression only received strict TypeScript annotations; its captured evidence and checks are unchanged. Original download SHA-256 values are retained in provenance.json.

Transaction `0x2054f2592088b6aca722c555e0472267eab9b3a24091a743ff38c6b711930d32` succeeded on chain 11142220. Exactly 10000 atomic USDC units at contract `0x01C5C0122039549AD1493B8220cABEdD739BC44E` moved from buyer `0x342807b11b9270fef1986Ea09610d3cb45e2eA0a` to seller `0x50AfA8675b50962a499eb08411D33C63461061fC`, selected log index 1. The token has six observed decimals. The facilitator's free credits fell from 1000 to 999 and its prepaid balance remained 20000000 micro units.

The paid merchant response was HTTP 200 with exact retained JSON `{"data":"this response cost $0.01"}`. Its SHA-256 is `0x1698e13ab0bb9a0de7f280446f26152aa70b39bdca16bf633068498a214fc25c`. The standalone proof reproduces presence, schema and exact-value checks. Bundle root: `0xa0c34231b6d91208e725ce50c27ee13bccfab3220983bad531be5ec1a1bdb3ba`.

The original PAYMENT-RESPONSE header failed the strict recorder profile. Raw header/error contents were deliberately not retained, so the exact rejected field cannot be reconstructed. The actual facilitator SDK transaction reference had separately persisted before response finalization. Read-only recovery checked it against complete approved expectations, selected the unique exact Transfer, reproduced the original retained outcome input and preserved the unsupported-header event. No synthetic response or second settlement was introduced. Recovery does not assert a separately persisted browser acknowledgement.

```sh
node packages/cli/dist/index.js verify docs/evidence/celo-sepolia-2026-11-19/complete-redacted.echoframe.json --json
node packages/cli/dist/index.js verify docs/evidence/celo-sepolia-2026-11-19/outcome-proof.json --json
node packages/cli/dist/index.js inspect-tx 0x2054f2592088b6aca722c555e0472267eab9b3a24091a743ff38c6b711930d32 --chain 11142220 --asset 0x01C5C0122039549AD1493B8220cABEdD739BC44E --sender 0x342807b11b9270fef1986Ea09610d3cb45e2eA0a --recipient 0x50AfA8675b50962a499eb08411D33C63461061fC --amount 10000 --log 1 --trust-expectations --standard-erc20 --json
```

The first two commands operate offline. The third makes read-only RPC calls and depends on endpoint availability. Imported verification correctly reports financial status UNKNOWN, recorded financial status SETTLED, authority NOT_PROVIDED and outcome TESTED_PASS. A fresh read with user-confirmed exact expectations produced MATCHED/SETTLED. This is RPC-observed evidence with configured token semantics, not a light-client consensus/finality proof or cryptographic purchase-purpose proof.

## Browser, accessibility and privacy

The complete application is tested in Chromium at 1440, 768, 390 and 360 pixels. Root-hosting tests cover imports, tampering, encrypted exports, crypto reproduction, journal/vault persistence, all scenarios, keyboard focus and reduced motion. Automated axe checks cover both themes across ten routes; planned desktop-only loops are reported as skipped in other width projects. Physical iOS, Android and MiniPay certification are not claimed.

Additional Pages checks use a static subpath server without SPA fallback, test 36 route/width combinations, compare all five public evidence downloads byte-for-byte, import the genuine trace, reproduce its outcome, and exercise offline IndexedDB recovery. The same script runs against the actual public URL after deployment. CSP is enforced with a meta policy on Pages; Cloudflare additionally supports the stricter response headers. GitHub Pages does not support custom response headers such as frame-ancestors.

Default recording retains metadata and commitments. Only the deliberately configured `data` projection is retained for this example. No raw wallet signature, cookie, Authorization header, facilitator key or private key is exported. Secret scanning checks Git-visible files, both static builds and trusted packed archive bytes against known private environment values and high-confidence credential patterns. It is an internal release check, not an external audit or universal secret-detection guarantee.

See [architecture](architecture.md), [proof semantics](proof-semantics.md), [threat model](threat-model.md), [security review](security-review-1.1.md) and [protocol profiles](protocol-matrix.md) for exact boundaries.
