# Static deployment

The build is a Vite React SPA. **Output: `apps/web/dist`**. No Worker, Functions, D1, API secret, hosted database or paid account is needed for the software. A website is not claimed to be published unless a hosting provider actually returns a successful deployment.

Build from a clean checkout:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The build includes the PWA manifest, SVG icon, hashed asset cache, downloadable documentation, public example and grant/release records. `index.html` and `_redirects` provide SPA fallback. `_headers` supplies a restrictive CSP, no-referrer policy and browser permissions. No `functions/`, `_worker.js` or server output is produced.

## Cloudflare Pages direct upload

After signing into your own free Cloudflare account and authorizing the CLI:

```sh
pnpm dlx wrangler@4.165.0 login
pnpm dlx wrangler@4.165.0 pages project create echoframe --production-branch main
pnpm dlx wrangler@4.165.0 pages deploy apps/web/dist --project-name echoframe --branch main
```

These commands are exact publication instructions, not evidence they were executed. Account authorization is required. Version 4.165.0 was checked in the npm registry during implementation; refresh/review before future releases. The static directory has no bindings or secrets. On a pre-existing project, omit project creation.

## Pages Git integration

Connect the GitHub repository using your Cloudflare account. Root directory: repository root. Build command: `corepack pnpm install --frozen-lockfile && corepack pnpm build`. Output directory: `apps/web/dist`. The committed `.node-version` pins Node 24.16.0. If overriding the Pages build image, set the build variable `NODE_VERSION=24.16.0`; it is configuration, not a secret. No runtime variables or credentials are required. Preserve `_redirects` and `_headers`.

Free-plan limits include 500 builds/month, 20,000 files/site, 25MiB/file and 20-minute build timeouts. Static asset requests are free/unlimited under current documentation; invoking Functions changes the pricing boundary. Public RPC service availability and fair-use quotas remain separate dependencies. Sources: [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [static pricing](https://developers.cloudflare.com/pages/functions/pricing/).

Deploy at the domain root under HTTPS. PWA offline storage is origin-scoped. Changing the origin does not migrate IndexedDB; export evidence before moving. The app is read-only in MiniPay and ordinary mobile browsers, and no wallet is required. If adding trusted RPC endpoints, review the origin allowlist and CSP connect-src together; never expose arbitrary user-supplied RPC URLs through MCP/server code.

Manual smoke check after publication: open a nested route, import the paid-but-not-delivered example, export and independently verify it, create/reload a pending journal, switch offline and reopen the vault, then test a real transaction hash. Record the actual URL and provider deployment ID only after a successful result.

`pnpm release:assets` also prepares `artifacts/echoframe-web-1.1.0.zip` with SHA-256 checksums. Upload its contents at the domain root. The ZIP does not add a server or hosting account.

## GitHub project Pages

The public repository uses GitHub Actions Pages deployment at `/echoframe/`. Build with `corepack pnpm --filter @echoframe/web build:pages`; output is `apps/web/dist-pages`. The application basename, asset/download URLs, manifest and service worker all use that prefix. Supported routes have physical index documents, so deep links return HTTP 200 without a rewrite service. A meta CSP applies on Pages; custom response headers in `_headers` apply only on Cloudflare. Service-worker caches are scoped to the application base.

The CI workflow deploys only after its complete release quality job passes. Pages was enabled using the authorized repository account; actual deployment success and smoke-test results are recorded in publication.json after the live URL is checked. Reproduce local subpath checks with `corepack pnpm test:pages`; set `ECHOFRAME_SITE_URL=https://eshaanvgupta.github.io/echoframe/` to run the same read-only checks against the public site. This uses a fresh browser context and only writes test records to that context?s IndexedDB. It never signs or pays.

GitHub project Pages under one user share a browser origin. A path prefix isolates this app?s cache namespace but is not a confidentiality boundary between same-origin projects. IndexedDB remains origin-scoped; use a dedicated Cloudflare Pages origin or local deployment when separate-origin storage isolation is required. The app itself does not upload stored evidence.
