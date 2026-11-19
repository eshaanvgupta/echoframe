/** Executable commands and complete zero-key examples; package tarballs are used until registry publication. */
export const developerSnippets=[
  ['Fresh checkout / Node 24+',`corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm cli doctor --json
pnpm cli integration-test --json
pnpm dev`],
  ['Real Express and Hono examples',`# From the repository, after pnpm build:
pnpm --filter @echoframe/example-express-x402 start
pnpm --filter @echoframe/example-hono-mpp start
# Both persist correlated synthetic requests in local-evidence/.
# No wallet, keys, funds or external processor required.`],
  ['Independent installed SDK / PowerShell',`# Build and pack in the repository:
pnpm test:consumer
# Copy artifacts/echoframe-*-1.1.0.tgz into a NEW directory.
npm.cmd init -y
$packages = Get-ChildItem ./echoframe-*-1.1.0.tgz | ForEach-Object { $_.FullName }
npm.cmd install --ignore-scripts $packages
node --input-type=module -e "import {runRecorderSelfTest} from '@echoframe/node'; console.log(await runRecorderSelfTest());"`],
  ['Installed local merchant / merchant.mjs',`import {startLocalMerchantSimulation, syntheticLocalCredential} from '@echoframe/node';
const merchant = await startLocalMerchantSimulation('./evidence', {project:true});
try {
  const headers = {'X-Echoframe-Request-Id':'console-synthetic-001'};
  await (await fetch(merchant.url+'/resource', {headers})).text();
  await merchant.recorder.drain();
  const response = await fetch(merchant.url+'/resource', {headers:{
    ...headers, 'PAYMENT-SIGNATURE':syntheticLocalCredential()
  }});
  console.log(response.status, await response.json());
  await merchant.recorder.drain();
  const {contextKey} = merchant.recorder.list()[0];
  await merchant.recorder.exportEvidence(contextKey, './complete.echoframe.json', {mode:'complete'});
} finally { await merchant.close(); }
// Run: node merchant.mjs (fresh directory; exports never overwrite).
// project:true explicitly retains ONLY rate/pair for outcome checks.
// Omit project for metadata + commitments only. All payments SIMULATED.`],
  ['Verify and reproduce / installed CLI',`node node_modules/@echoframe/cli/dist/index.js verify complete.echoframe.json --json
node node_modules/@echoframe/cli/dist/index.js diagnose complete.echoframe.json --json
node node_modules/@echoframe/cli/dist/index.js diagnose complete.echoframe.json --test trace-regression.test.ts --complete
npm install --save-dev vitest@5.1.1
npx --no-install vitest run trace-regression.test.ts`],
  ['Read-only MCP / installed package',`{
  "mcpServers": {
    "echoframe": {
      "command": "node",
      "args": ["/absolute/path/node_modules/@echoframe/mcp/dist/index.js"]
    }
  }
}
// explain_failure: {bundle:"<complete JSON text>"}
// generate_repro_test: {bundle:"<complete JSON text>",includeCompleteEvidence:true}
// Tools return bounded evidence or test text; never sign or run imported code.`]
] as const;
