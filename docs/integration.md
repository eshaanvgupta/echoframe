# Instrument an existing merchant

Node 24 or newer is required (tested with Node 24.16.0). ECHOFRAME is ESM. No wallet, hosted database, RPC key, AI key or subscription is needed. Supported protocol profiles are x402 v2 HTTP `exact` EVM EIP-3009 (`@x402/core` 2.31.0) and MPP `evm` one-shot `charge`, flat authorization (`mppx` 0.21.0). See [exact exclusions](protocol-matrix.md).

## Install the release without npm publication

Registry publication is not claimed. From a checkout, `pnpm install --frozen-lockfile && pnpm build && pnpm test:consumer` creates all nine independently installable tarballs under `artifacts/` and tests them in a temporary project outside the monorepo. Copy those files into an empty application directory. On PowerShell:

```powershell
npm.cmd init -y
$packages = Get-ChildItem ./echoframe-*-1.1.1.tgz | ForEach-Object { $_.FullName }
npm.cmd install --ignore-scripts $packages express@5.3.0 hono@4.13.19
node --input-type=module -e "import {runRecorderSelfTest} from '@echoframe/node'; console.log(await runRecorderSelfTest());"
```

On POSIX shells: `npm init -y && npm install --ignore-scripts ./echoframe-*-1.1.1.tgz express@5.3.0 hono@4.13.19`, followed by the same Node self-test. The test runs real loopback HTTP, official SDK codecs and a synthetic facilitator, Hono dispatch, SQLite close/reopen, complete export/import, and independent outcome checks. It never contacts a chain or signs anything. Package artifacts contain their own `dist`, declarations, MIT license and README.

## Executable local merchant

Save as `merchant.mjs` in that installed project:

```js
import {startLocalMerchantSimulation, syntheticLocalCredential} from '@echoframe/node';
const merchant = await startLocalMerchantSimulation('./evidence', {project:true});
try {
  const headers = {'X-Echoframe-Request-Id':'demo-synthetic-001'};
  const challenge = await fetch(merchant.url+'/resource', {headers});
  await challenge.text();
  await merchant.recorder.drain();
  const response = await fetch(merchant.url+'/resource', {headers:{
    ...headers, 'PAYMENT-SIGNATURE':syntheticLocalCredential()
  }});
  console.log(response.status, await response.json());
  await merchant.recorder.drain();
  const {contextKey} = merchant.recorder.list()[0];
  // This explicit option intentionally includes the allowlisted outcome input.
  await merchant.recorder.exportEvidence(contextKey, './complete.echoframe.json', {mode:'complete'});
} finally {
  await merchant.close();
}
```

Run `node merchant.mjs` once in a fresh directory. Export uses exclusive creation, so it refuses to overwrite existing evidence. Repeated runs retain the original pending attempt; use a different export filename rather than deleting the journal. The local facilitator returns a **synthetic pending** reference. Outcome checks can pass while payment remains unresolved. `project:true` explicitly captures only `rate` and `pair`; omitted/default configuration retains metadata and commitments only.

```sh
node node_modules/@echoframe/cli/dist/index.js verify complete.echoframe.json --json
node node_modules/@echoframe/cli/dist/index.js diagnose complete.echoframe.json --json
node node_modules/@echoframe/cli/dist/index.js diagnose complete.echoframe.json --test trace-regression.test.ts --complete
npm install --save-dev vitest@5.1.1
npx --no-install vitest run trace-regression.test.ts
```

Open `complete.echoframe.json` in Trace Explorer. No network request is needed to reproduce its declared checks. A generated trace regression embeds complete evidence with explicit consent, verifies integrity and reproduces the diagnosis; it does not execute scripts found in the imported evidence or prove a production exploit.

## Express and Hono middleware

The repository examples are complete, executable framework applications:

```sh
pnpm --filter @echoframe/example-express-x402 start
pnpm --filter @echoframe/example-hono-mpp start
```

Both persist correlated metadata under their own `local-evidence/`. Express uses an actual HTTP server and official HTTPFacilitatorClient against loopback simulation. Hono uses actual Request/Response dispatch with official Challenge/Credential/Receipt codecs. These example processors accept synthetic credentials and must not be exposed as genuine payment gateways.

For your existing merchant, initialize a recorder once per configured payment profile:

```js
import {PaymentRecorder, SqliteAttemptJournal} from '@echoframe/node';
const journal = new SqliteAttemptJournal('./attempts.sqlite');
const recorder = new PaymentRecorder({
  protocol:'x402', // use 'mpp' for the supported EVM charge profile
  chainId:11142220,
  payment:{
    token:'0x0000000000000000000000000000000000000003',
    recipient:'0x0000000000000000000000000000000000000002',
    sender:'0x0000000000000000000000000000000000000001',
    amount:'1000' // exact atomic units; configure your own real expectations
  },
  journal, storagePath:'./recordings.sqlite',
  onError:error=>console.error(error.code) // sanitized local capture failure only
});
console.log(await recorder.recover());
```

Use `app.use(recorder.express())` **before** the existing Express payment middleware and result handler. In Hono use `app.use('*', recorder.hono())` before the existing payment routes. These methods use real framework interfaces. ECHOFRAME observes your payment stack; it does not replace or cryptographically authenticate its processor. Mount a recorder on the intended paid route, after compression middleware initialization if you want the recorder wrapper to see uncompressed application writes before passing them to compression. Commitments describe bytes at the observation layer; they do not certify wire encoding or receipt by the client. Configured constraints can differ per route by using separate recorder instances and storage paths. Dynamic prices require selecting/configuring the correct application profile before capture; this release does not invent a dynamic quote policy.

For a full runnable Express usage see [the example](../examples/express-x402/index.ts); [Hono example](../examples/hono-mpp/index.ts). The installed consumer self-test exercises both middleware interfaces, persistence and exports; the repository tests additionally use real Express.

MPP credential header selection follows the original challenge: `Authorization` by default or explicitly advertised `Payment-Authorization`. Conflicting payment credentials in both headers are rejected without retaining either. Ordinary HTTP Bearer authentication can coexist with the advertised alternate payment header and is ignored by the recorder.

Clients must reuse an opaque `X-Echoframe-Request-Id` on discovery and the subsequent credential request. The response returns `ECHOFRAME-REQUEST-ID`. IDs contain 8–128 letters/digits/underscores/hyphens; do not place customer details or secrets in them. Server-assigned IDs must be copied from the challenge response. Method, route commitment, protocol, chain and ID commitment bind the recording context. Raw IDs, paths, query strings, headers, cookies and credentials are not retained.

Every challenge alternative is validated. One offer must match application-configured chain/token/recipient/amount; if more than one matches, provide `selectOffer(offers)` returning its index. The original selected commitment is pinned. Changed quotes, unsupported profiles, missing discovery or invalid credential windows are recorded conservatively; the recorder does not tell a merchant to accept or reject economic payment. Authorization inspection checks metadata consistency and time windows, **not EIP-3009 signature validity or mandate authority**. An authorization fingerprint commits chain/token/payer/nonce, preventing its reuse from creating a second local request attempt without storing replayable material. It is not a global onchain replay oracle.

## Optional checks and deliberate capture

Metadata and a bounded SHA-256 response commitment are the default. Configure both fields below to reproduce outcome checks:

```js
// Additional PaymentRecorder configuration:
const outcomeOptions = {
  capture:{mode:'json-allowlist', paths:['rate','pair'], maxBytes:65536},
  outcomePolicy:{version:'1.0.0', name:'Quoted rate bounds',
    now:'2026-11-19T00:00:00.000Z',
    rules:[{kind:'presence'},{kind:'range',path:'rate',min:0,max:100}]
  }
};
```

The policy and evaluation clock must be explicitly configured. These are checks of the retained **allowlist projection**, not hidden original bytes. The outcome event binds its content hash, original response commitment and projection configuration commitment. An independent verifier reproduces that projection's checks; it cannot verify that a dishonest recorder projected hidden bytes correctly. Sensitive field names and known secret patterns are redacted, but an allowlist is not universal personal-data detection. Choose non-sensitive application fields. Raw complete response bodies are never stored by this recorder. Complete imported third-party bundles may contain arbitrary supplied bodies, so review before saving or exporting them.

Responses are bounded (2MB maximum, optional capture defaults to 64KB) and observation has a configurable deadline (10 seconds by default, at most 60). Incomplete/oversized responses retain counts and an unavailable commitment, never a partial digest labeled complete. Response observation refers to application bytes and does not prove receipt by the end client. Streaming/SSE beyond those bounds is not a complete deliverable observation. A 402 challenge body is not a purchased result.

## Persistence, recovery and export

Call `await recorder.drain()` after observed responses, before inspecting bundles or exporting. Errors reach `onError` as sanitized codes and reject `drain`; they never become automatic retries or raw credential logs. Stop the application server and allow responses to finish before `await recorder.close(); journal.close()`. Calls made while active responses remain refuse closure. SQLite records append-only attempt transitions with transactions and unique settlement identities. Recorder and journal use separate local transactions: a crash can leave a partial capture. `await recorder.recover()` reconnects stored request and journal identities, emits recovery evidence and returns `RECONCILE_FIRST`; it never creates a fresh authorization or initiates network access.

`recorder.list()` gives context keys and bundles. `getBundle(key)` returns the current complete local bundle. `exportEvidence(key, path)` writes public-minimal evidence by default. `{mode:'complete'}` intentionally includes retained policy inputs and observations. Files use exclusive creation and restrictive mode where supported; secure the containing directory and SQLite files with local OS permissions. Databases are plaintext locally; use the browser's authenticated encrypted export for a portable encrypted file. Nothing is uploaded automatically.

## Opt-in genuine Celo inspection

Use a consenting merchant's **existing** x402/MPP processor. Supply actual expected token, payer, recipient and amount; preserve its request correlation, selected quote, protocol response and deliverable commitments. For non-economic development use Celo Sepolia (11142220) and its public Forno RPC. Mainnet (42220) is for explicitly chosen read-only inspection here. Never substitute the synthetic fixture token/credential for a genuine merchant integration.

After a genuine protocol response has provided a transaction reference, the integrator may explicitly call:

```js
import {ReadonlyRpc} from '@echoframe/celo';
// contextKey, transactionHash and chosenLogIndex come from the captured request
// and a reviewed receipt. Do not automatically choose a sole/first log.
// await recorder.reconcile(contextKey, new ReadonlyRpc({chainId:11142220}),
//   transactionHash, {selectedLogIndex:chosenLogIndex, tokenBehavior:'CONFIGURED_ERC20'});
```

This call only reads the official endpoint. It requires the transaction to be recorded in that request's protocol response. Positive attribution requires complete application-configured chain/transaction/token/sender/recipient/atomic amount, explicit log selection, successful canonical receipt inclusion at observation, and configured token semantics. Missing sender, missing expectations, removed logs, mismatched context, unsupported token behavior and RPC contradictions remain unresolved. Successful execution and observed Transfers are shown separately. RPCs can lie and finality is not proven. A later offline import retains the recorded statement; it cannot confer current payment trust on itself.

CLI read-only equivalent: `echoframe inspect-tx HASH --chain 11142220 --asset TOKEN --sender PAYER --recipient PAYEE --amount ATOMIC --log INDEX --trust-expectations --standard-erc20 --json`. Omitting confirmation/fields never produces positive purchase attribution. Use chain 42220 only when intentionally inspecting existing mainnet evidence. No tool signs, buys, deploys, transfers, registers, refunds or automatically retries.

A live merchant milestone still requires a consenting external integrator, their working supported merchant payment stack, a reproducible genuine request and deliverable, trusted expectations and evaluation criteria, and permission to retain/share redacted evidence. Any real mainnet purchase additionally needs explicit participant authorization and actual funds or sponsorship. Public chain reads, Sepolia tests, synthetic requests and real independent usage are separate evidence classes. This repository cannot manufacture adoption or grant eligibility.

## MCP and troubleshooting

Use the installed executable `node /absolute/path/node_modules/@echoframe/mcp/dist/index.js` as an MCP stdio server. All six tools remain read-only. `inspect_bundle` / `verify_bundle` accept JSON text, never file paths or URLs. `explain_failure` accepts either `bundle` or `scenario`. `generate_repro_test` accepts a trace only with `includeCompleteEvidence:true`; it returns text and never runs it. `inspect_celo_tx` uses fixed official RPC URLs; complete optional `expected`, `selectedLogIndex`, `confirmExpectations:true` and `standardErc20:true` are required for positive attribution.

- `MISSING_CHALLENGE`: reuse the challenge's opaque ID and method/route; finish/drain discovery before the credential request.
- `QUOTE_CHANGED`: compare original accepted requirements; preserve the existing unresolved attempt.
- `UNSUPPORTED_*`: consult the profile matrix. Do not guess another protocol, method, credential format, extension or token model.
- `RESPONSE_LOST` / `BODY_LIMIT`: obtain the original result separately; payment may already have happened.
- `RECORDER_WRITE`: check local disk permissions/capacity and callbacks. Preserve existing journals; no fresh signature is justified.
- `UNKNOWN` in an imported real bundle: expected. Re-fetch with independently trusted purchase context for a current observation.
- Export `EEXIST`: choose another filename. Existing evidence is never overwritten silently.
- Restart: call `recover()`, inspect partial histories and reconcile the original attempt before any economic action.

No external audit, formal verification, universal security guarantee or real merchant adoption is claimed.

Cross-origin clients must configure the existing merchant CORS policy to allow `X-Echoframe-Request-Id` and supported credential headers and expose `ECHOFRAME-REQUEST-ID` plus protocol challenge/response headers. The recorder does not weaken or replace your CORS policy.

RPC observations export the configured endpoint origin and local index, not credential-bearing paths/queries. Receipt/log objects retain only supported normalized fields; unknown provider extensions are withheld. Keep any private RPC configuration separately and never source it from an imported bundle.
