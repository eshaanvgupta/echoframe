# Acceptance coverage

The binding build prompt remains at the repository root. This matrix maps its journeys to reviewable implementation and tests. Exact executed results are in release-verification.json; this file does not substitute for those results.

| Criterion | Implementation / review path | Verification |
| --- | --- | --- |
| Fresh no-key local start | Root pnpm workspace, Node 24, Vite static app | Frozen install, typecheck, package/frontend build, Playwright |
| Paid-but-undelivered sample and deterministic fix | fixtures/empty-body.echoframe.json; /explorer; /lab | Module outcome tests; every scenario regression; browser sample/fix/download |
| Real Celo tx or honest failure | celo reconciliation, /explorer | Live read-only records; strict receipt tests; browser failure/unknown test |
| Tamper detection and portable export | core event/bundle/artifact hashes, signatures, import/export, /story | Corruption tests, encrypted files, browser manifest/story download |
| Visual bounded policy builder | /studio, core outcomes interpreter | All built-in validators, schema compatibility, subjective limit, browser compile/verify |
| Actual Node HTTP and durable crash recovery | Express x402 local facilitator; Hono MPP; SQLite/IndexedDB journals | Official SDK local HTTP integration, actual SQLite reopen, browser offline/reload |
| Independent installed CLI | nine npm tarballs, cli verify | Temporary consumer install, matching reports, installed CLI verification |
| MCP inspect and replay | official SDK, six read-only tools | Real stdio and in-memory MCP clients; no wallet actions |
| 360px mobile essential workflows | responsive CSS, bottom nav, drawer, touch targets | 1440/768/390/360 browser projects, overflow assertions, keyboard/reduced motion |
| Free static deployment | apps/web/dist, Pages headers and SPA fallback | Production build, asset budget, offline cache; exact account-authorized deployment instructions |
| Complete local quality gates | CI workflow and audit scripts | Unit/integration/property tests, generated regressions, E2E, automated accessibility, Lighthouse, consumer install and dependency/license audit |
| Real outreach/mainnet use only if observed | grant dossier and factual ledger | Not yet observed; explicit opt-in outreach and sponsored integration plan |

Local, synthetic and Sepolia data are explicitly separated. No real payment or registration is necessary to run the software. No website or npm publication is claimed. The GitHub repository is the requested source publication target; confirm its actual remote commit independently.
