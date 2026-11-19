import {defineConfig} from 'vitest/config';
import {resolve} from 'node:path';
export default defineConfig({resolve:{alias:Object.fromEntries(['core','celo','x402','mpp','erc8183','node','cli','mcp','react'].map(name=>[`@echoframe/${name}`,resolve(`packages/${name}/src/index.${name==='react'?'tsx':'ts'}`)]))},test:{include:['test/**/*.test.ts','scenarios/**/*.test.ts'],exclude:['test/e2e/**'],testTimeout:15000,reporters:['default','json'],outputFile:{json:'artifacts/unit-results.json'},pool:'forks',maxWorkers:4}});
