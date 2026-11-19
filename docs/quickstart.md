# Five-minute zero-key quickstart

Prerequisites: Node 24 LTS, Corepack and git. No CELO, wallet, AI API or faucet is needed.

```sh
git clone https://github.com/eshaanvgupta/echoframe.git
cd echoframe
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm cli doctor --json
pnpm cli init local-evidence
pnpm cli verify local-evidence/sample.echoframe.json --json
pnpm dev
```

Open http://127.0.0.1:5173. Click **Open paid-but-not-delivered case**. The active trace says SIMULATED, money SETTLED, work TESTED_FAIL and authority NOT_PROVIDED. Download its manifest and verify it using the CLI above. Edit a title or event without resealing; importing the edited file must reject its integrity.

Open **Failure Lab**, choose **Settled, but the response was lost**, and click **Fix & Re-run**. Before requests another simulated authorization; after retains one and reconciles the original. The seed stays 42220. Download the runnable Vitest regression. It imports `runScenario` and `fixAndRerun` from @echoframe/core; install that packed package and Vitest in your project, or place the file in this repository's `scenarios/` and run `pnpm test`.

Open **Outcome Studio**. Market-rate checks pass the supplied synthetic structured fixture. Enter a negative rate and compile again: numeric/schema checks fail even when bytes have a valid hash. Weather includes a subjective question and correctly stays NOT_MACHINE_VERIFIABLE. Export the complete proof and verify it with `pnpm cli verify outcome-proof.json --json`.

Open **Payment Journal** and create a simulated pending attempt. Reload: the recommendation remains RECONCILE_FIRST. `pnpm cli integration-test --json` independently runs installed recorder workflows, outcome checks and SQLite close/reopen recovery.

Real Node transport examples:

```sh
pnpm --filter @echoframe/example-express-x402 start
pnpm --filter @echoframe/example-hono-mpp start
pnpm --filter @echoframe/example-erc8183-local start
```

The Express example starts an actual loopback HTTP server, uses the official HTTPFacilitatorClient against its synthetic local facilitator, records two correlated exchange snapshots and shuts down. Evidence is written under that example's local-evidence directory. Hono uses actual Hono Request/Response dispatch with mppx codecs; it does not open a public server. ERC-8183 decodes an exact synthetic completion event. None of these examples can send chain transactions.

For a real transaction, paste a hash into Trace Explorer, select Celo Sepolia or mainnet, enter complete trusted expectations for intended-payment attribution, and inspect. Every attributed Transfer requires explicit selection, including a single log. Confirm the chain/transaction and configured token semantics; missing expectations remain missing evidence. No wallet connects; no delivery claim is inferred. Public RPC availability, historical decimals and rate limits remain external dependencies.

Use **Vault** to choose complete private retention or the public-minimal default. Encrypted export needs a 12+ character passphrase; authenticated decryption rejects changed bytes. Offline HTML reports contain escaped evidence and an embedded manifest download. Opening the PWA once under HTTPS/localhost primes its offline shell; public RPC features continue to require network.

For independently installed package artifacts, drop-in middleware, intentional complete export and genuine merchant opt-in, follow [the full integration guide](integration.md).
