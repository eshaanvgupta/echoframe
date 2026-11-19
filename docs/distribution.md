# Reproducible distribution — 1.1.0

No npm registry or public website publication is claimed. The GitHub source repository is https://github.com/eshaanvgupta/echoframe. Use Node 24+ and the pinned pnpm 10.34.9.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm release:check
node scripts/report.mjs
corepack pnpm build
corepack pnpm test:consumer
node scripts/package-release.mjs
```

`release:check` runs all ten required gates from scratch, including audit at moderate severity. `report.mjs` refuses failed/missing gates. The final build copies the actual release report and documentation into the static offline shell. `test:consumer` packs all nine packages, installs tarballs in an independent temporary npm project outside the workspace, runs installed ESM exports, durable HTTP/Hono recording, independent CLI verification and 17 runnable generated regressions (16 scenarios plus one actual trace). Temporary directories are removed after verification; artifacts remain.

Artifacts under `artifacts/`:

- `echoframe-{core,celo,x402,mpp,erc8183,node,react,cli,mcp}-1.1.0.tgz`: real package tarballs with ESM, declarations, README and license.
- `echoframe-web-1.1.0.zip`: complete static `apps/web/dist` contents, including SPA routing, restrictive headers, offline shell and locally bundled licensed fonts.
- `release-1.1.0.json` and `SHA256SUMS-1.1.0.txt`: asset names, lengths and SHA-256 checksums.
- Executed gate logs, unit/browser/consumer results, dependency and license reports, performance and bundle budgets.

Package generation is reproducible from source. Tarballs may contain npm pack timestamps/metadata; no bit-for-bit reproducibility claim is made across tool versions. The static ZIP uses deterministic stored entries and timestamps for the same build bytes. Checksums describe the actual artifacts, not source authenticity; retain a trusted release/checksum origin separately.

Install all nine tarballs together to resolve their exact local interdependencies. See [integration](integration.md) for executable PowerShell/POSIX commands and SDK examples. The software does not depend on a registry namespace existing. For a future authorized npm release, establish ownership of the `@echoframe` scope, authenticate a permitted npm account and satisfy its MFA/provenance requirements. Review all tarball contents, then publish in dependency order:

```sh
npm publish artifacts/echoframe-core-1.1.0.tgz --access public
npm publish artifacts/echoframe-celo-1.1.0.tgz --access public
npm publish artifacts/echoframe-x402-1.1.0.tgz --access public
npm publish artifacts/echoframe-mpp-1.1.0.tgz --access public
npm publish artifacts/echoframe-erc8183-1.1.0.tgz --access public
npm publish artifacts/echoframe-node-1.1.0.tgz --access public
npm publish artifacts/echoframe-react-1.1.0.tgz --access public
npm publish artifacts/echoframe-cli-1.1.0.tgz --access public
npm publish artifacts/echoframe-mcp-1.1.0.tgz --access public
```

Those publication commands have not been executed. Namespace availability, ownership and credentials remain external requirements. Do not change evidence schema/proof version merely to match a package release: 1.1.0 packages preserve compatible 1.0.0 evidence/proof formats and explicitly version the expanded verifier report as 1.1.0.

For Cloudflare Pages Free, deploy **`apps/web/dist`**, root directory `/`, Node 24, build command `corepack pnpm install --frozen-lockfile && corepack pnpm build`. No runtime variables, Worker, Functions or hosted database are required. Direct upload and exact opt-in commands are in [deployment](deployment.md). A source push or local preview is not a deployed URL. Record and open the actual URL before reporting publication. Offline storage is origin-scoped; export evidence before changing domains.
