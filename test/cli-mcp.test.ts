import {describe,it,expect} from 'vitest';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {resolve} from 'node:path';
import {runCli} from '../packages/cli/src/index.js';
import {createMcpServer,toolNames} from '../packages/mcp/src/index.js';
import {scenarioBundle,verifyBundle} from '../packages/core/src/index.js';

describe('installed CLI command semantics',()=>{
  it('doctor works offline with no keys',async()=>{const output:string[]=[];expect(await runCli(['doctor','--json'],v=>output.push(v))).toBe(0);expect(JSON.parse(output[0]!).offlineReady).toBe(true);});
  it('CLI and independent browser-compatible module produce identical reports',async()=>{const dir=await mkdtemp(join(tmpdir(),'echoframe-cli-'));try{const bundle=await scenarioBundle();const path=join(dir,'test.echoframe.json');await writeFile(path,JSON.stringify(bundle));const output:string[]=[];expect(await runCli(['verify',path,'--json'],v=>output.push(v))).toBe(0);expect(JSON.parse(output[0]!)).toEqual(await verifyBundle(bundle));}finally{await rm(dir,{recursive:true,force:true});}});
  it('init, check-config and verify form a zero-key quickstart',async()=>{const dir=await mkdtemp(join(tmpdir(),'echoframe-cli-'));try{expect(await runCli(['init',dir],()=>{})).toBe(0);expect(await runCli(['check-config',join(dir,'echoframe.config.json')],()=>{})).toBe(0);expect(await runCli(['verify',join(dir,'sample.echoframe.json')],()=>{})).toBe(0);expect(await runCli(['init',dir],()=>{})).toBe(1);}finally{await rm(dir,{recursive:true,force:true});}});
  it('exports public minimal and offline contained HTML',async()=>{const dir=await mkdtemp(join(tmpdir(),'echoframe-cli-'));try{const input=join(dir,'input.json');await writeFile(input,JSON.stringify(await scenarioBundle()));const output=join(dir,'report.html');expect(await runCli(['export',input,'--out',output,'--html'],()=>{})).toBe(0);expect(await readFile(output,'utf8')).toContain('Public evidence manifest');}finally{await rm(dir,{recursive:true,force:true});}});
  it('executes crash/restart integration check',async()=>expect(await runCli(['integration-test','--json'],()=>{})).toBe(0));
  it.each([{args:['send-payment']},{args:['verify']},{args:['inspect-tx','bad-hash']},{args:['doctor','--unknown','yes']},{args:['replay','absent']}])('rejects invalid command %#',async({args})=>expect(await runCli(args,()=>{})).toBe(1));
});
describe('official MCP read-only integration',()=>{
  it('serves a real stdio MCP client from the built entrypoint',async()=>{
    const client=new Client({name:'stdio-independent-client',version:'1.0.0'});const transport=new StdioClientTransport({command:process.execPath,args:[resolve('packages/mcp/dist/index.js')],stderr:'pipe'});await client.connect(transport);
    try{const tools=await client.listTools();expect(tools.tools).toHaveLength(6);const result=await client.callTool({name:'replay_scenario',arguments:{scenario:'ambiguous-failure',safe:true}});expect(result.isError).not.toBe(true);expect(JSON.parse((result.content as Array<{text:string}>)[0]!.text).financialStatus).toBe('UNKNOWN');}finally{await client.close();}
  });
  it('lists exactly six tools without wallet or write capability',async()=>{
    const server=createMcpServer(),client=new Client({name:'independent-client',version:'1.0.0'});const [a,b]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(a),client.connect(b)]);
    try{const list=await client.listTools();expect(list.tools.map(t=>t.name).sort()).toEqual([...toolNames].sort());for(const tool of list.tools){expect(tool.annotations?.readOnlyHint).toBe(true);expect(tool.name).not.toMatch(/sign|pay|send|refund|register/);}}
    finally{await client.close();await server.close();}
  });
  it('inspects and replays through an actual MCP client',async()=>{
    const server=createMcpServer(),client=new Client({name:'independent-client',version:'1.0.0'});const [a,b]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(a),client.connect(b)]);
    try{const inspect=await client.callTool({name:'inspect_bundle',arguments:{bundle:JSON.stringify(await scenarioBundle())}});expect(inspect.isError).not.toBe(true);expect(JSON.stringify(inspect)).toContain('TESTED_FAIL');const replay=await client.callTool({name:'replay_scenario',arguments:{scenario:'response-lost',seed:42220,safe:true}});expect(JSON.parse((replay.content as Array<{text:string}>)[0]!.text).authorizations).toBe(1);}
    finally{await client.close();await server.close();}
  });
  it('does not interpret an external URL or path as a bundle',async()=>{
    const server=createMcpServer(),client=new Client({name:'independent-client',version:'1.0.0'});const [a,b]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(a),client.connect(b)]);
    try{const result=await client.callTool({name:'inspect_bundle',arguments:{bundle:'https://169.254.169.254/secret'}});expect(result.isError).toBe(true);}finally{await client.close();await server.close();}
  });
});
