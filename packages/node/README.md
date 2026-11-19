# @echoframe/node

ECHOFRAME 1.1.0. MIT. Explicit ESM exports and TypeScript declarations.

Read the API and exact trust boundaries: https://github.com/eshaanvgupta/echoframe/blob/main/docs/api.md#node

This package does not sign, send or force refunds. Node packages require Node 24 LTS. Browser-compatible packages are bundled by the static web application. Protocol support is explicitly limited; see docs/protocol-matrix.md in the source repository.


`PaymentRecorder` provides durable, drop-in `.express()` and `.hono()` middleware for the explicitly supported x402/MPP profiles. Configure exact application payment expectations, `SqliteAttemptJournal` and a local `storagePath`. Default response recording is metadata and bounded commitments; optional allowlisted JSON projection capture and an outcome policy require explicit configuration. Raw payment credentials and headers are never stored. This observer does not replace your payment processor or validate its signatures.

Installed smoke test (no keys, network payment or funds):

```sh
node --input-type=module -e "import {runRecorderSelfTest} from '@echoframe/node'; console.log(await runRecorderSelfTest());"
```

After a response, `await recorder.drain()`. On restart, `await recorder.recover()` retains unresolved attempts and recommends read-only reconciliation. `recorder.exportEvidence(key,path)` is public-minimal by default; `{mode:'complete'}` intentionally includes retained inputs. Stop your server before `.close()` and close the journal separately. Exports refuse overwrites. Databases remain plaintext local files; secure the directory with OS permissions.

Complete executable examples, installation, Celo opt-in, trust boundaries and troubleshooting: https://github.com/eshaanvgupta/echoframe/blob/main/docs/integration.md
