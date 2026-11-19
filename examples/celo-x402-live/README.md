# Genuine Celo Sepolia x402 integration

Node 24 or 26, pnpm 10.34.9, MetaMask and a funded **Celo Sepolia** USDC wallet are required. This example uses the official Celo seller/buyer application shape at [celo-org/x402-celo-example](https://github.com/celo-org/x402-celo-example/tree/f3a128b339e770c5cd19627c6290bdd518470600), Hono and the official x402 SDK 2.31.0. It instruments the real hosted facilitator; there is no simulated settlement fallback.

From the repository root:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm build:packages
```

Privately configure the root ignored `.env`, or set these variables in the server environment:

```dotenv
X402_API_KEY=<your-private-facilitator-key>
X402_NETWORK=testnet
X402_FACILITATOR_URL=https://api.x402.sepolia.celo.org
BUYER_ADDRESS=<your-public-funded-testnet-wallet>
SELLER_PAY_TO=<the-reviewed-public-seller-wallet>
```

Never put wallet private keys or signatures in this file. The buyer uses MetaMask. The facilitator API key remains server-side and is never included in the browser build or evidence.

```sh
corepack pnpm --filter @echoframe/example-celo-x402-live prepare-purchase
corepack pnpm --filter @echoframe/example-celo-x402-live start
```

Open **http://127.0.0.1:4390** in a browser with MetaMask. The server makes read-only preflight checks and an unpaid challenge request. Starting it never buys anything. Review buyer, seller, token, network and amount. Connect the reviewed wallet; prepare the unsigned message; review its complete EIP-712 authorization, including nonce and expiry; explicitly request the MetaMask signature. Submission requires separate consent and a separate button. There is no automatic wallet signing or payment retry.

The only supported payment is `exact` x402 v2, EIP-3009, chain **11142220**, token **0x01C5C0122039549AD1493B8220cABEdD739BC44E**, **10000** atomic units at six decimals. The hosted account must have a free settlement credit. Prepaid spending and top-ups are not authorized. Public account balances and key ownership correspondence are inspected without exporting the key. No mainnet endpoint is allowed. The example is a local developer tool; do not expose this signing server publicly.

The browser and server validate the quote and typed message independently. A durable SQLite gate permits one explicitly approved submission and one settlement call, including after restart or transport failure. ECHOFRAME itself never signs or submits wallet transactions; the existing official merchant workflow invokes the hosted facilitator only after the separate submission approval. The network guard refuses a second settlement fetch, even if the first one timed out.

## Evidence, policy and recovery

PaymentRecorder captures metadata, quote commitments and an explicitly allowlisted, non-sensitive `data` result. Its configured deterministic policy checks HTTP 200, presence, a strict JSON schema and exact content equality. The response is the official example's `{"data":"this response cost $0.01"}`. This policy verifies that declared example result; it cannot establish subjective service quality or external source truth.

Private journals and complete evidence live in ignored `local-evidence/celo-x402-live/`. Successful finalization selects exactly one Transfer matching all approved expectations, checks the canonical receipt block and token decimals using official read-only Sepolia RPC, and emits:

- `complete-redacted.echoframe.json`
- `payment-match.json`
- `outcome-proof.json`
- `verification-report.json`
- `purchase.regression.test.ts`

Never submit again when the page reports uncertainty. A malformed/unsupported payment response header remains a recorded failure. The genuine hosted SDK transaction reference is separately persisted. If that reference exists, finalization can reconcile it read-only without pretending the header parsed successfully. After a crash, explicitly run:

```sh
corepack pnpm --filter @echoframe/example-celo-x402-live recover
```

Recovery blocks all facilitator payment endpoints. It requires the persisted successful SDK reference, observed request authorization, original retained HTTP 200 outcome input, exact merchant content commitment, a unique matching onchain Transfer, and independently reproducible proof. It records its source and does not assert a separately persisted browser acknowledgement. It never reconstructs payment credentials, retries payment or generates a replacement merchant response. If any evidence is absent, preserve the directory and review the existing transaction manually.

```sh
node packages/cli/dist/index.js verify local-evidence/celo-x402-live/complete-redacted.echoframe.json --json
node packages/cli/dist/index.js verify local-evidence/celo-x402-live/outcome-proof.json --json
```

Import the complete bundle using the existing web application's evidence import. Offline verification reproduces the proof and checks integrity. Imported financial observations remain untrusted until independently re-fetched with trusted expectations and a selected log. An unsigned evidence root proves internal consistency, not merchant authenticity. No authority signature is retained or independently verified. RPC receipt observations are not light-client consensus or finality proofs.

The generated regression imports Vitest, `@echoframe/core` and `@echoframe/celo`; run it in an installed consumer project or with a Vitest configuration resolving those package exports. It performs no network calls or economic actions. It checks the fixed bundle root, actual recorded receipt and selected log, exact payment attribution, retained content hash and reproduced outcome. Keep complete evidence and regressions private unless you intentionally choose to publish their public wallet and request metadata.

Tests for the signing boundary are in `test/celo-live-approval.test.ts`; they never request a real signature or invoke a real facilitator settlement. The real testnet purchase is a separate user-approved operation, not an automated test-suite step. Hosted service availability, wallet funding and free credits remain external prerequisites.
