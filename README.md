# ECHOFRAME // 42220

**Money moved. Did the work happen? Prove what you can; label what you cannot.**

ECHOFRAME is an open-source, local-first payment flight recorder, independent evidence verifier and deterministic failure laboratory for Celo agent commerce. It ties a request, authorization, quote, settlement observation, returned bytes and reproducible checks into a portable evidence bundle. Financial status, delivery status, mandate authority and evidence strength stay separate.

The product does not move money. It requires no wallet, API key, database service, AI model or paid infrastructure. Imported evidence, checks, replay and export work offline after the static application has loaded. Public RPC inspection requires internet access and can fail honestly.

![Actual desktop application](docs/screenshots/desktop.png)

## Run locally

Use **Node 24 LTS** (tested with 24.16.0) and Corepack. A native Node SQLite API is used; Node 20 is unsupported. On Windows PowerShell with restricted script execution, use `corepack.cmd` or `pnpm.cmd`.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:5173`. Nothing is published or signed. If another global pnpm version overrides Corepack, invoke `corepack pnpm` in place of `pnpm`; the workspace pins 10.34.9.

## Five-minute independent verification

```sh
pnpm build
pnpm cli init local-evidence
pnpm cli verify local-evidence/sample.echoframe.json --json
pnpm cli replay response-lost --safe --seed 42220
pnpm cli integration-test --json
pnpm --filter @echoframe/example-express-x402 start
pnpm --filter @echoframe/example-hono-mpp start
```

The examples perform real local HTTP request handling and official SDK serialization against a **synthetic local facilitator**, never a chain or payment signer. Their credentials and references are deliberately synthetic. The Express example uses the official `HTTPFacilitatorClient` over loopback. Captured metadata is allowlisted before persistence. The drop-in `PaymentRecorder` has real Express and Hono middleware, durable correlation, metadata-only defaults, opt-in outcome projections, intentional export and restart recovery. See [full developer integration](docs/integration.md), [quickstart](docs/quickstart.md), [API reference](docs/api.md), [protocol matrix](docs/protocol-matrix.md).

## Product workflow

- **Trace Explorer:** file/drag-drop imports, protocol challenges, strict integrity checks, event links, provenance, real Celo transaction inspection and explicit selection of every attributed Transfer log and trace-aware diagnostic findings.
- **Failure Lab:** trace-derived diagnoses and regressions, 16 seeded scenarios, vulnerable/safe policies, virtual timeline scrubbing, explicit policy controls, before/after invariants and runnable regression exports.
- **Outcome Studio:** visual policy builder and bounded JSON DSL; schema subset, presence, HTTP status, exact hashes, numeric/math bounds, freshness, supplied cross-checks and source signatures. Subjective checks remain `NOT_MACHINE_VERIFIABLE`.
- **Journal and Vault:** SQLite SDK and IndexedDB browser journals; idempotency, restart recovery, conservative retry recommendations, local deletion, private/public export, authenticated encrypted files and contained HTML reports.
- **Developer Console:** nine packages, read-only MCP, live endpoint checks, challenge parser and optional read-only Self/ERC-8004 registry views.
- **Grant Evidence and Methodology:** downloadable factual records, source research, explicit missing adoption/mainnet prerequisites and proof boundaries.

## Compatibility

| Surface | Shipped boundary |
| --- | --- |
| x402 | v2 HTTP, `exact`, Celo EVM, EIP-3009 metadata/credential consistency; no signer, no production facilitator settlement |
| MPP | official mppx 0.21.0, `evm` one-shot `charge`; current flat authorization payload; no sessions/subscriptions |
| ERC-8183 | draft reference `a078cab5` ABI; user-configured address and code pin; strict receipt events and job views |
| Celo | mainnet 42220 and Sepolia 11142220; chain identity, receipt/block inclusion, ERC-20 event decoding, exact integer expectations and decimals |
| Identity | optional official ERC-8004 mainnet and Self mainnet/Sepolia read interfaces; no passport data or registration |

Imported RPC exports remain `APP_REPORTED`. Re-fetch with complete trusted chain, transaction, token, sender, recipient, amount and selected log expectations to observe intended-payment attribution. A successful receipt alone never establishes a purchase; unknown token semantics remain unverified. RPC agreement is a trust assumption, not a light-client proof. A bundle signature proves that a key signed a commitment; it does not prove identity or service quality. An unsigned bundle can be rewritten with new hashes: retain a trusted root externally. [Proof semantics](docs/proof-semantics.md).

## Verify the release

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:consumer
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:performance
pnpm audit:licenses
pnpm audit --audit-level moderate
```

Tests include fixed-seed fast-check sequences, all 16 generated regression files, official x402 local HTTP transport, MPP, ERC-8183, actual SQLite reopen, MCP client calls and CLI/module verdict agreement. Playwright runs desktop 1440, tablet 768, phone 390 and narrow phone 360 with offline persistence, keyboard and reduced-motion checks. Automated accessibility audits complement manual judgment; they are not accessibility certification.

Exact observed results and limits are recorded in [completion report](docs/completion-report.md) and [release-verification.json](docs/release-verification.json). Screenshots are captured from the running application, not design renders.

## Deploy static files

`pnpm build` produces **`apps/web/dist`**. Upload that directory to any HTTPS static host with SPA fallback. Cloudflare Pages requires no Worker, Functions, database or keys in the build. See [exact deployment instructions](docs/deployment.md) for Pages direct upload and Git integration. A GitHub source push is not a deployed website.

No npm package publishing, website publication, mainnet transaction, funding award, external feedback session or independent user adoption is implied by a local build. Mainnet activity and grant eligibility remain separately evidenced prerequisites.

MIT. [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Threat model](docs/threat-model.md).

Release 1.1.0 keeps evidence schema/proof version 1.0.0 while extending verifier report version 1.1.0. See [upgrade findings and fixes](docs/security-review-1.1.md) and [distribution](docs/distribution.md). No npm registry publication is claimed; `pnpm test:consumer` produces and verifies all nine installable artifacts outside the workspace.
