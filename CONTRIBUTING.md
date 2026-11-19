# Contributing

Use Node 24 LTS and the pinned pnpm. Install with the frozen lockfile, then run the quality gates in README. Contributions need a focused behavioral test when they affect evidence semantics, protocol acceptance or recovery safety. Do not add tests that merely mirror implementation details.

Protocol changes need links to current primary specifications, pinned fixture provenance and explicit unsupported behavior. Preserve the distinction between signature validity, RPC observations, deterministic checks and subjective quality. No private keys, automatic payments, paid runtime dependency or hosted storage may enter the default path.

Add scenarios with explicit preconditions, vulnerable/honest branches, fixed seeds and evidence gaps. Synthetic transaction references must be labeled SIMULATED. To contribute a real trace, obtain consent, redact at capture and explain what chain data actually establishes. No manufactured traffic or wash transactions.

Submit a pull request with the concrete behavior change and validation. MIT contributions only; retain upstream notices and do not copy incompatible identity SDK implementation code.
