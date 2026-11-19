# ECHOFRAME package API

All packages are ESM 1.0.0, Node >=24 where Node is needed, with explicit `exports` and TypeScript declarations. Package tarballs are built under `artifacts/` by `pnpm test:consumer`. Nothing is automatically published to npm. Install all desired tarballs together so workspace dependencies resolve to their local packed versions. Browser packages are bundled by Vite; Node SQLite, CLI and MCP are not in the frontend dependency graph.

## core

`createBundle(options)`, `appendEvent(bundle,type,data,options?)`, `sealBundle(bundle)`, `verifyBundle(value,{expectedChainId?,now?})`, `importBundle(text,expectedChainId?)`, `publicBundle(bundle)`, `htmlReport(bundle,report)`, `createArtifact(id,mime,bytes)`. `verifyBundle` returns independent integrity, errors, warnings, authority/financial/delivery axes, reproduced evidence and check counts. It does not trust imported labels. `sealBundle` strips stale signatures; verify or re-sign externally after mutation.

`canonicalize(value)`, `commitment(domain,value)`, `sha256(bytes)`, `parseJson(text,maxBytes?)`, `bundleTypedData(chainId,rootHash)` define byte semantics. `redact`, `safeHttpMetadata`, `deterministicDiff`, `encryptFile` and `decryptFile` provide bounded privacy tooling. Public-minimal redaction is stronger than arbitrary field-name heuristics: it removes payloads entirely.

`runOutcome(manifest,input)`, `createOutcomeProof(eventId,chainId,manifest,input)`, `verifyOutcomeProof(proof)` interpret the safe DSL. Input is `{body,status,file?:{mime,bytesBase64},crossCheck?,sourceSignature?}`. Manifest has version 1.0.0, name, recorded UTC clock and built-in rule list. Use `outcomeExamples` for rates/weather/jobs/content. Add an event with the selected contentHash before adding a proof to a bundle.

`attemptKey(identity)`, `initialAttempt`, `appendJournal`, `validateJournal` and `shouldRetry(state)` implement the state machine. `runScenario(id,seed?,variant?,overrides?)`, `fixAndRerun(run)`, `generateRegression(run)` and async `scenarioBundle(id,seed)` provide deterministic simulations. Variants are honest/vulnerable. Simulations do not call any network or wallet.

## x402

`parseX402Challenge(header)` validates the complete supported v2 profile; malformed alternatives reject the whole challenge. `normalizeX402Offer(requirements)` preserves exact units and absent decimals. `quoteCommitment` pins the selected requirements. `inspectX402Signature(header,selected,{nowSeconds?,expectedPayer?,expectedResourceUrl?})` consumes credentials transiently, checks structural/quote/window consistency, and never returns a raw signature or nonce. It explicitly does not assert cryptographic validity. `parseX402Settlement` preserves pending/unknown and demands reconciliation. `instrumentFetch(fetcher,onObservation)` observes requests without generating credentials or performing an automatic retry. Do not pass arbitrary response bodies to a persistent observer.

## mpp

`parseMppChallenge(header,now?)`, `normalizeMppOffer(challenge)`, `inspectMppCredential(header,expected)`, `parseMppReceipt(header,expected)` use official mppx codecs. Only explicit evm charge metadata with supported chain, decimals and authorization credential profile is accepted. Credential signature validity and server HMAC authenticity are not independently established. This is a limited read-only adapter, not a payment transport. `Challenge` and `Receipt` are re-exported for examples.

## erc8183

`PROFILE`, `jobAbi`, `jobStates`, `inspectJob(rpc,config,jobId,signal?)`, `decodeJobLogs(receipt,config,jobId)`, `jobLogFilter(config,jobId,fromBlock,toBlock)`. Configuration must specify matching chainId, address, expectedCodeHash and the exact reference profile. Job state completion never sets delivery verified. `jobLogFilter` is bounded to 10,000 blocks; its returned filter can be passed to the configured read-only RPC by an informed caller.

## celo

```ts
import {ReadonlyRpc,reconcile} from '@echoframe/celo';
const rpc = new ReadonlyRpc({chainId:11142220});
const observation = await reconcile(rpc,transactionHash,{
  expected:{asset:tokenAddress,recipient:payee,amount:'1000'},
  selectedLogIndex:2,
  signal:abortController.signal
});
```

Optional expected asset, recipient, sender, atomic amount and decimals are explicit. Configure `endpoints` (one to three) and an explicit `trustedOrigins` HTTPS allowlist for nondefault endpoints. MCP never accepts user-supplied endpoints. Browser CSP must be updated manually if deploying a trusted additional RPC origin. `crossCheck:true` needs a distinct second endpoint; disagreement/unavailability remains UNKNOWN. Retries are bounded (at most three additional attempts), cancellation is honored, and responses are capped at 4MB. `decodeTransfers` and `formatUnitsExact` never guess token decimals. `inspectIdentity` offers minimal read-only Self/ERC-8004 observations and never fetches metadata URLs.

## node

`new SqliteAttemptJournal(path)` exposes async `create`, `append`, `get`, `list`, plus synchronous `close`. Appends are atomic and terminal financial observations require an evidence commitment. A repeated state is idempotent. SQLite uniqueness prevents one settlement evidence hash being attributed to two attempts. The application is responsible for supplying a meaningful verified receipt+selected-log commitment; a hash alone cannot certify a receipt.

`recorderMiddleware(onBundle,onError?)` is Express-compatible, boundary-redacts request metadata, observes response status/challenges and never signs. `recordHonoExchange(request,response)` records bounded safe metadata. Examples demonstrate actual framework integration. Databases and traces should remain in user-controlled storage.

## cli

`echoframe doctor [--live]`, `inspect-tx`, `verify`, `replay`, `export`, `init`, `check-config`, `integration-test`; run `pnpm cli help` for exact flags. File outputs use exclusive creation and never overwrite existing evidence. `export` defaults to public-minimal; add `--complete` for private full evidence and `--html` for contained reports. Verification exit 0 means integrity valid, not subjective work quality. Invalid data exits 1; stale network inspection exits 2. An injected failure replay exits 0 because it successfully ran the requested experiment and reports assertion failures in its structured result.

## mcp

Start `node /absolute/path/packages/mcp/dist/index.js`. Tools: inspect_bundle, verify_bundle, explain_failure, replay_scenario, inspect_celo_tx, generate_repro_test. Bundle tools accept bounded JSON strings, never paths or remote URLs. Only inspect_celo_tx can access configured official public RPCs. Tools declare readOnlyHint and expose no wallet actions. Reproduction output is returned as text, never executed.

## react

`StatusBadge({status,label?})`, `VerdictAxes({report})` and `EvidenceTimeline({events,selectedId?,onSelect?})`. Statuses use symbols plus text, never color alone. Timeline buttons are keyboard accessible. Components are intentionally style-class based so hosts can apply accessible tokens from the web stylesheet.
