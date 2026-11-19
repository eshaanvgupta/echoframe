# Independent reproducibility and privacy

1. Capture only allowlisted metadata before it crosses a storage boundary. Never store raw HTTP Authorization, cookies, replayable payment credentials, wallet keys or merchant paths.
2. Record domain-separated event commitments and explicit timestamp provenance. Use an external trusted root/signature if authenticity matters.
3. Keep imported financial observations and seller claims visibly app-reported. Re-fetch chain receipts, block inclusion and selected logs when network access is available. Match exact token, payer, recipient and integer amount; absent expectations remain null.
4. Define outcome checks as a bounded versioned manifest with an explicit evaluation clock. Bind the result to the trace event and selected exact byte commitment. Reproduce independently in browser or CLI.
5. Model failure with a seeded virtual clock, deterministic policy and strict preconditions. Re-run the same seed with an explicit patch; export a regression test. A simulated failure is not an assertion of exploitable upstream production behavior.
6. Export either a complete private manifest for reproducibility or public-minimal commitments with withheld inputs explicitly identified. Public minimal exports preserve the source root but cannot reproduce withheld checks. Saving complete evidence is an explicit local action.

The UI and CLI import the same pure verifier version. Tests compare their JSON reports and exercise the actual browser module through the static product. Generated regression tests depend only on Vitest and @echoframe/core. Clean consumer installation verifies tarball exports independently of workspace aliases.

The safe schema interpreter supports type, properties, required, boolean additionalProperties, items, minimum, maximum, string/item length bounds, enum and const. Unsupported keywords fail rather than fetching remote schemas. Mathematical assertions are bounded folds over numeric fields; no expression language executes. Regex accepts only anchored literal strings or one bounded alphanumeric character class. Freshness uses manifest.now. Cross-check input is supplied locally; its real independence is not assumed.

No telemetry or adoption counter is collected automatically. Missing metrics use `not_yet_observed`. Outreach sessions and consenting mainnet traces can be added only with attributable evidence and privacy review. Public blockchain reads alone are not a participant's activation or endorsement.

The default app may send an `eth_chainId` health request to official Celo Sepolia on opening. Explicit transaction/identity inspection sends only the requested public identifiers to configured public RPCs. Imported receipts, attachments and policy bodies are never uploaded. Offline tools remain available if RPC is unavailable.
