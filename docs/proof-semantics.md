# What ECHOFRAME establishes

The verifier never trusts a bundle's own evidence-quality labels. Imported claims are `APP_REPORTED`; cryptographic signatures and reproduced tests are separately added only after actual verification. The UI displays financial, delivery and authority axes separately.

| Evidence | Establishes | Does not establish |
| --- | --- | --- |
| Bundle/event hash chain | Internal consistency against a known root | Authentic origin; truth; unchanged history if an attacker rewrites every unsigned hash |
| Inline SHA-256 manifest | Exact bytes/size match the commitment | Valid work; harmless file; meaningful output |
| EIP-712 signature | A key signed the selected root on a declared chain | Real identity, mandate authorization, honest signer or subjective quality |
| Personal-sign source signature | A declared key signed raw content SHA-256 bytes | Independently evaluated work |
| Successful receipt and selected Transfer | RPC-observed execution/logs matching explicit expectations | Token economic meaning, purchase context, normal payment behavior or delivery |
| Two RPCs agree | Two endpoints supplied matching observations | Consensus light-client verification or independent operators |
| ERC-8183 Completed | Configured evaluator finalized a job in the supported profile | Independently verified delivery, universal arbitration or trustworthy evaluator |
| TEST_REPRODUCED | Declared checks rerun on the supplied input and clock | All possible quality properties or truthful real-world data |
| MPP/x402 response | The service reported a protocol result | Independently settled chain payment or returned work |

The complete status enums are defined in `packages/core/src/types.ts`. `SIGNED_VERIFIED` mandate authority is reserved; a signed bundle does not verify a mandate. Imported revocation/expiry details are declared data. Expiry is evaluated at recorded observation time for reproducibility, not silently at a changing clock. Re-fetch current evidence for a current decision.

RPC inspection is explicitly labeled `RPC_OBSERVED` with endpoint and time. Exporting it does not magically give a later offline verifier an independent chain connection. `CHAIN_PROVEN` is reserved and never granted simply from a self-labeled claim or multi-RPC comparison. This implementation is not a cryptographic light client.

Canonical JSON uses the RFC 8785-compatible finite I-JSON subset: JSON string escaping, ECMAScript number serialization and UTF-16 sorted object keys. It rejects lone surrogates, undefined, non-finite numbers, unsafe object keys and excessive nesting. The hash input is UTF-8 of `ECHOFRAME`, a NUL byte, the domain string, another NUL and canonical JSON. Examples of domains are `event-v1`, `bundle-v1`, `validator-manifest-v1`, `outcome-proof-v1` and `attempt-journal-v1`. Artifact SHA-256 hashes exact decoded bytes. The declared `KECCAK-256` artifact-content profile commits a canonical byte-value array using `artifact-content-v1`; it is not a raw-file keccak digest.

EIP-712 domain is `{name:"ECHOFRAME",version:"1",chainId}`, type `Evidence(bytes32 rootHash)`. Bundle signatures bind the bundle root; optional verifier proof signatures bind the proof hash. No signing UI or keys are needed. Verify signer trust externally.

`UNKNOWN`, `PENDING` and `NOT_MACHINE_VERIFIABLE` are honest answers. A failed policy is an objective failure of the declared conditions; it is never automatically labeled fraud. No timeout creates a recommendation to sign a fresh payment.
