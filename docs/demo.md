# Reproducible product demonstration

Allow five minutes for the interactive demonstration after installing dependencies. All failure injection is deterministic **SIMULATION**. The genuine Sepolia trace is a separate previously captured purchase; opening it never pays again.

1. Start `corepack pnpm dev`, or open the verified public URL from publication.json. Choose **Open paid-but-not-delivered case**.
2. Trace Explorer shows the captured quote, authorization context, transaction observation and event commitments. The sample environment is SIMULATED. Inspect separate financial, delivery and authority verdicts; settlement does not pass the empty delivery policy.
3. In **Trace diagnostics**, inspect DELIVERY_MISSING, supporting event references, missing evidence and the safe next action. Follow the related simulation.
4. In Failure Lab select **Response lost**, seed **42220**. The deliberately vulnerable branch illustrates duplicate authorization after a timeout. This does not establish a production exploit.
5. Choose **Fix & Re-run**. The documented policy is to reconcile the existing attempt before considering a new authorization. The seed stays 42220, the duplicate authorization disappears and fixed-branch invariants pass.
6. Move the timeline scrubber to inspect each stage. Download the regression and evidence. The exported regression runs the same before/after assertions without a wallet or network call.
7. Outcome Studio compiles the declared deterministic policy, independently verifies it, and shows a failed result after editing the input outside its bounds. Subjective checks remain NOT_MACHINE_VERIFIABLE.
8. Save a trace in Evidence Vault; create a simulated pending attempt in Payment Journal; reload and switch offline. The journal retains its RECONCILE FIRST recommendation and the vault remains usable.
9. Open **Grant evidence → Open genuine Sepolia evidence**. This imports the actual owner-approved 0.01 test-USDC trace. The offline verifier reproduces the outcome while keeping payment observations untrusted and authority separate. Inspect the preserved unsupported-header failure and explicit read-only recovery source.
10. Download the bundle and run the independent CLI commands in technical-evidence.md. The live inspection command only reads the existing transaction. It never signs, submits or retries a purchase.

For the local merchant demonstration, run `corepack pnpm --filter @echoframe/example-express-x402 start` or `corepack pnpm --filter @echoframe/example-hono-mpp start`. These execute actual framework requests with explicitly synthetic facilitator/credential fixtures. They demonstrate capture and persistence without test tokens. For a separately approved genuine purchase, use the isolated [MetaMask Sepolia example](https://github.com/eshaanvgupta/echoframe/tree/main/examples/celo-x402-live); do not rerun an already consumed session.

Automated counterparts are in test/e2e/product.spec.ts, scripts/pages-smoke.mjs, the 16 scenario regressions and docs/evidence/celo-sepolia-2026-11-19/purchase.regression.test.ts. The complete release gate runs these independently of this narrative.
