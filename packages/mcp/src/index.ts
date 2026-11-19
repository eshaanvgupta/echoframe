#!/usr/bin/env node
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {importBundle,verifyBundle,runScenario,generateRegression,parseJson} from '@echoframe/core';
import {ReadonlyRpc,reconcile} from '@echoframe/celo';

const annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
export const toolNames=['inspect_bundle','verify_bundle','explain_failure','replay_scenario','inspect_celo_tx','generate_repro_test'] as const;
export function createMcpServer():McpServer{
  const server=new McpServer({name:'echoframe-read-only',version:'1.0.0'});
  const text=(value:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(value,null,2)}]});
  server.registerTool('inspect_bundle',{description:'Inspect a bounded evidence JSON string. Does not read paths or fetch URLs.',inputSchema:{bundle:z.string().max(8_000_000)},annotations},async({bundle})=>{const b=await importBundle(bundle);return text({bundleId:b.bundleId,title:b.title,events:b.events,report:await verifyBundle(b)});});
  server.registerTool('verify_bundle',{description:'Independently verify commitments, signatures and deterministic outcome evidence.',inputSchema:{bundle:z.string().max(8_000_000)},annotations},async({bundle})=>text(await verifyBundle(parseJson(bundle))));
  server.registerTool('explain_failure',{description:'Return deterministic failure explanations and evidence gaps.',inputSchema:{scenario:z.string().max(100),seed:z.number().int().min(0).max(0xffffffff).default(42220)},annotations},async({scenario,seed})=>{const run=runScenario(scenario,seed);return text({invariants:run.invariants,missingEvidence:run.missingEvidence,safeNextAction:run.safeNextAction});});
  server.registerTool('replay_scenario',{description:'Run an offline deterministic simulation. No real payments.',inputSchema:{scenario:z.string().max(100),seed:z.number().int().min(0).max(0xffffffff).default(42220),safe:z.boolean().default(true)},annotations},async({scenario,seed,safe})=>text(runScenario(scenario,seed,safe?'honest':'vulnerable')));
  server.registerTool('inspect_celo_tx',{description:'Read official public Celo RPC. No custom URLs, signing or spending.',inputSchema:{hash:z.string().regex(/^0x[0-9a-f]{64}$/),chainId:z.union([z.literal(42220),z.literal(11142220)]).default(11142220)},annotations:{...annotations,openWorldHint:true}},async({hash,chainId})=>text(await reconcile(new ReadonlyRpc({chainId,retries:1,timeoutMs:5000}),hash)));
  server.registerTool('generate_repro_test',{description:'Generate text of a deterministic Vitest regression; never executes the returned code.',inputSchema:{scenario:z.string().max(100),seed:z.number().int().min(0).max(0xffffffff).default(42220)},annotations},async({scenario,seed})=>text({filename:`${scenario}.test.ts`,code:generateRegression(runScenario(scenario,seed))}));
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await createMcpServer().connect(new StdioServerTransport());
