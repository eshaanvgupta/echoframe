# Production upgrade — reconnaissance and engineering checklist

Baseline: `bace29e826f07bb9866679bea426251665e832f7`, initially clean working tree. Re-executed the existing complete release workflow before source changes on 2026-11-19: all ten gates passed, 298 tests, 42 browser tests, six deliberate desktop-only repeats skipped. Existing architecture, all nine packages, ten routes, journal, proofs and 16 scenarios are retained.

Read the README, architecture, proof semantics, threat model, completion report, acceptance matrix and protocol matrix; inspected every package and route, integration examples, test suites, packed-consumer harness and CI. The existing successful CI is the baseline, not evidence of external adoption.

## Prioritized gaps confirmed in code

1. **P0 financial attribution:** `reconcile` treats absent asset/sender/recipient/amount as successful checks and automatically chooses a sole Transfer. A selected Transfer can become SETTLED without trusted purchase expectations. Separate execution/log observation from explicit, complete intended-payment attribution; require trusted chain/transaction/parties/asset/units/log context and configured token semantics. Keep missing/contradictory evidence unresolved.
2. **P0 source authenticity:** offline reports reproduce imported `financial.observation.status` directly. Retain recorded statements separately from current attribution; never promote imported trust labels. Public-minimal exports preserve event names despite withholding payloads; withheld delivery inputs must not become delivery conclusions.
3. **P0 usable recording:** existing Express middleware records isolated exchanges; Hono helper records only method/status. Neither correlates challenge/authorization/settlement/result across durable attempts. Add a configured, non-signing recorder with persistent correlation, bounded response commitments, explicit optional capture/policy, protocol response parsing, read-only reconciliation, restart recovery and safe export.
4. **P0 integrity review:** reject duplicate JSON member names and sparse/accessor JavaScript inputs; validate safe-schema definitions on absent branches; bind schema/numeric checks to selected file JSON when file bytes are used. Each fix needs a regression.
5. **P1 actual trace diagnosis:** the lab link always selects empty-body and the MCP explanation accepts only a scenario. Add typed, deterministic findings with event/hash references, missing evidence, safe actions and trace-derived regressions. Preserve all simulations and clearly distinguish them from observed incidents.
6. **P1 developer experience:** replace incomplete snippets with executable examples for installed artifacts, actual Express/Hono middleware, policy opt-in, journal recovery and independent verification. Expand the clean installed-consumer self-test beyond export/import checks.
7. **P1 UI:** expose separate observed/recorded/reproduced evidence axes, actionable diagnoses and a complete expectation form with explicit log/trust choices. Preserve identity, themes, responsive navigation, offline storage and accessibility.
8. **P1 distribution and evidence:** version packages coherently, prepare reproducible artifacts, verify the full fresh quality gate and Linux CI, capture actual screenshots and record factual results. npm/site publishing and consenting mainnet use remain external prerequisites unless actually authorized and observed.

## Current official interface review

- [Celo network overview](https://docs.celo.org/learn/network/overview): mainnet 42220 and Sepolia 11142220; public Forno is a best-effort dependency. Check chain identity at runtime; do not infer purchase context from logs.
- [x402 v2 core](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md), [HTTP transport](https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md), [exact EVM](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md): canonical payment headers, complete selected requirements, supported EIP-3009 profile and ambiguous pending settlement. The recorder observes the developer's payment stack; it never calls a real settle transport.
- [MPP protocol](https://mpp.dev/protocol), [EVM charge](https://mpp.dev/payment-methods/evm), [challenges](https://mpp.dev/protocol/challenges), [credentials](https://mpp.dev/protocol/credentials), [receipts](https://mpp.dev/protocol/receipts): separate Payment authentication, optional receipt, echoed challenge and flat EVM authorization payload. Preserve explicit unsupported intent/method/profile handling.
- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004): identity/reputation/validation are distinct from payment and service delivery. Metadata remains declarative.
- [ERC-8183](https://eips.ethereum.org/EIPS/eip-8183): draft six-state job/evaluator model; retain the existing declared reference ABI profile and code pin, with no invented Celo deployment.
- [Prezenti Season 3](https://forum.celo.org/t/prezenti-season-3-is-open-frontier-anchor-and-boost-grants-for-celo/13714): deployment, associated mainnet activity, activation/distribution evidence and identity commitments are distinct from public RPC inspection. No external demand or grant eligibility can be manufactured by the software.

Progress and final executed evidence will be recorded in the completion report; this checklist does not claim work is finished.

Final software verification: all ten fresh gates passed, 391 tests, 54 browser checks plus six documented skips, nine independently installed packages and 17 installed regressions. See completion-report.md for exact results, internal security fixes and remaining genuine merchant/publication/grant prerequisites.
