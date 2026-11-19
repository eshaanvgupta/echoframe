# Threat model and review

Assets: user privacy, evidence integrity, attribution of one payment attempt, exact atomic amounts, correct uncertainty labels and reproducibility. Attackers may control merchants, imported files, HTTP headers, result bodies, one or more RPCs, facilitator reports and arbitrary receipt fields. The original recorder can be malicious. The verifier does not assume the merchant is trusted.

| Attack | Mitigation | Regression coverage |
| --- | --- | --- |
| Changed recipient, price, chain or offer fallback | Strict supported-profile parsing; pin exact selected quote; reject malformed alternatives | adapters.test.ts; recipient-switch/price-drift/chain-mismatch scenarios |
| Timeout/pay-again and process crash | Durable identity, atomic append, UNKNOWN→reconcile first, settlement uniqueness | journal-replay.test.ts; response-lost/ambiguous-failure/crash-recovery |
| Forged imported `CHAIN_PROVEN` or delivery badge | Imported claims downgraded; deterministic outcomes rerun; separate axes | core.test.ts; forged-delivery/evaluator-only |
| Forged Transfer data or unrelated logs | Exact emitter/address/ABI width, successful receipt, context, explicit log selection, exact expectations | celo.test.ts; multi-transfer |
| Malicious file, XSS or injection text | Strict schema, depth/byte limits, escaped React text and contained HTML; no eval/code DSL; no decompression | core/outcomes tests; Playwright hostile filename/title |
| SSRF through MCP or RPC | MCP accepts bounded bundle JSON, no paths/URLs; RPC HTTPS origin allowlist; explicit trusted configuration; no redirects; fixed read methods | celo/cli-mcp tests |
| Replayed settlement attribution | Atomic uniqueness in Node/browser journal | journal-replay tests |
| Leaked cookies, API keys or signatures | Instrumentation allowlist before persistence, transient credential inspection, public-minimal export, redacted diff | privacy and HTTP transport tests |
| Catastrophic regex/schema behavior | No arbitrary regex syntax; anchored literal or single bounded class only; safe schema interpreter and input bounds | outcomes tests |
| Corrupt encrypted file | Random salt/IV, PBKDF2-SHA256, 310k rounds, AES-256-GCM with fixed additional data | encrypted export tests |

Security invariants: ambiguity never authorizes a fresh payment; successful transaction execution alone does not establish a payment; settlement never establishes delivery; an imported label cannot promote itself; terminal journal states require evidence commitments; one settlement attribution cannot belong to multiple identities; no SDK/MCP recorder signs, sends or forces refunds.

Known boundaries: an attacker can rewrite an unsigned bundle and recompute hashes; retain a trusted root/signature elsewhere. An RPC can lie consistently. Two endpoints may share an operator. A contract may emit ERC-20-looking logs without conventional token semantics. A user-chosen code hash is not an audit, and proxy code pins do not freeze implementations. Source signatures may be from untrusted signers. Browser XSS/extensions/device compromise can read IndexedDB and in-memory plaintext. JavaScript strings cannot reliably be zeroized; derived key input byte arrays are cleared where practical. User deletion removes local retry protection. MIME checks compare declarations and byte counts; they do not execute, render or certify attachments.

The bundled Express facilitator and Hono credential acceptance are explicitly synthetic and restricted examples, not production payment processing. They must never be exposed as a real payment gateway. No contracts or custody systems are introduced. No external penetration audit or formal verification of the implementation is claimed.
