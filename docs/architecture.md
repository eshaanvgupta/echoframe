# Architecture and data model

```mermaid
flowchart LR
  HTTP[HTTP recorder allowlist] --> Bundle[EvidenceBundle v1]
  Import[Bounded file import] --> Verify[Independent core verifier]
  Bundle --> Verify
  Verify --> Web[Static React PWA / IndexedDB]
  Verify --> CLI[Node CLI]
  Verify --> MCP[Read-only MCP tools]
  RPC[Configured public Celo RPC] --> Celo[Strict receipt / block / Transfer adapter]
  Celo --> Bundle
  Policy[Bounded outcome DSL] --> Proof[Reproducible OutcomeProof]
  Proof --> Bundle
  Replay[Seeded virtual state machine] --> Regression[Vitest / fixture export]
  Journal[SQLite / IndexedDB attempt journal] --> Recovery[Reconcile first]
```

`packages/core/src/types.ts` is the exact runtime Zod schema and TypeScript model. Bundles are strict version 1.0.0 documents with separate environment, protocol, actors, claims, offers, event chain, transaction references, RPC observations, artifacts, outcomes, redaction profile, mandate, recovery state, policy and algorithm version. Unknown fields and schema versions fail closed.

Every event has a stable ID, sequence index, ISO time, timestamp provenance, prior-event hash and domain-separated content hash. All event commitments, manifest bytes and outcomes feed the bundle root. Bundle signatures are external to the root. Artifact bytes are inline base64, at most 2MB each, and checked against Web Crypto SHA-256, exact size and manifest ID. Complete imports are capped at 8MB, 5000 events, depth 48, 100 artifacts and bounded headers. No decompression is accepted.

`OutcomeProof` embeds the exact policy and input, event ID, chain, content SHA-256, manifest keccak256, input commitment, per-check results and proof commitment. Verification reruns the policy and checks the trace event's selected content commitment. A source signature checks the declared signer over raw SHA-256 bytes using personal-sign. Optional proof/bundle signatures use the documented EIP-712 commitment envelope. These are distinct statements.

Attempt identity is `{chainId,protocol,requestId,payer,payee,token,amount,quoteHash}` with lowercased addresses before hashing. SQLite uses `BEGIN IMMEDIATE`, primary keys, immutable identity and append-only triggers. A partial unique settlement evidence index prevents reusing one settlement attribution on multiple attempts. Browser IndexedDB uses read/write transactions and checks uniqueness inside the same transaction. User-controlled deletion explicitly removes that local protection.

Node SQLite is synchronous inside atomic transactions and requires Node >=24. It is a local process store, not a multi-host database. Browser modules contain no Node driver. Packages have explicit ESM exports and declaration files; a clean temporary consumer installs packed tarballs and imports every package.

The app serves static HTML, CSS, JavaScript, licensed local fonts and SVG. Its service worker caches only build-listed same-origin assets and the app shell. It never caches RPC requests or imported evidence. There is no server, paid backend, analytics endpoint, external font request or AI dependency.
