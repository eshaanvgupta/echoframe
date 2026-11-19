#!/usr/bin/env node
import {readFile,writeFile,mkdir,stat,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {importBundle,verifyBundle,verifyOutcomeProof,parseJson,scenarioBundle,runScenario,fixAndRerun,generateRegression,publicBundle,htmlReport,outcomeExamples,shouldRetry,commitment,hex32,diagnoseBundle,generateTraceRegression,EvidenceError,type Json} from '@echoframe/core';
import {ReadonlyRpc,reconcile,networks,type Expectations} from '@echoframe/celo';
import {SqliteAttemptJournal,runRecorderSelfTest} from '@echoframe/node';

const help=`ECHOFRAME 1.1.1 — independent, non-signing evidence tools\n\nCommands:\n  doctor [--live] [--json]\n  inspect-tx <0xhash> [--chain 11142220|42220] [--asset 0x..] [--recipient 0x..] [--sender 0x..] [--amount integer] [--log number] [--trust-expectations --standard-erc20] [--json]\n  verify <bundle.echoframe.json|outcome-proof.json> [--json]\n  diagnose <bundle> [--json] [--test regression.test.ts --complete]\n  replay <scenario-id> [--seed 42220] [--safe] [--out result.json] [--test regression.test.ts]\n  export <bundle> --out <file> [--html|--complete] (public minimal by default)\n  init [directory]\n  check-config <echoframe.config.json>\n  integration-test [--json]\n\nNo command signs, sends, refunds, or registers payments. Node >=24 required.`;
function flags(args:string[]):{positionals:string[];options:Record<string,string|boolean>}{
  const positionals:string[]=[],options:Record<string,string|boolean>={};
  const boolean=new Set(['json','live','safe','html','complete','help','trust-expectations','standard-erc20']);
  for(let i=0;i<args.length;i++){const a=args[i]!;if(a.startsWith('--')){const key=a.slice(2);if(Object.hasOwn(options,key))throw new EvidenceError('ARGUMENT',`Duplicate --${key}`);if(boolean.has(key))options[key]=true;else{const next=args[++i];if(!next||next.startsWith('--'))throw new EvidenceError('ARGUMENT',`Missing value for --${key}`);options[key]=next;}}else positionals.push(a);}return {positionals,options};
}
async function readJson(path:string):Promise<Json>{if((await stat(path)).size>8_000_000)throw new EvidenceError('LIMIT','File exceeds 8MB');return parseJson(await readFile(path,'utf8'));}
async function outputFile(path:string,text:string):Promise<void>{await writeFile(resolve(path),text,{flag:'wx'});}
export async function runCli(args:string[],print:(text:string)=>void=console.log):Promise<number>{
  try{
    const {positionals,options}=flags(args);const [command,input]=positionals;const json=options.json===true;
    const out=(value:unknown,text?:string)=>print(json||!text?JSON.stringify(value,null,2):text);
    if(!command||command==='help'||options.help){print(help);return 0;}
    const validOptions:Record<string,string[]>={doctor:['live','json'],'inspect-tx':['chain','asset','recipient','sender','amount','log','json','trust-expectations','standard-erc20'],verify:['json'],diagnose:['json','test','complete'],replay:['seed','safe','out','test','json'],export:['out','html','complete'],init:[],'check-config':['json'],'integration-test':['json']};
    if(!validOptions[command])throw new EvidenceError('COMMAND','Unknown command');for(const key of Object.keys(options))if(!validOptions[command]!.includes(key))throw new EvidenceError('ARGUMENT',`Unsupported --${key}`);
    switch(command){
      case 'verify':{
        if(!input)throw new EvidenceError('FILE','Provide an evidence file');const value=await readJson(input);
        if(value&&typeof value==='object'&&!Array.isArray(value)&&value.version==='1.0.0'&&'proofHash'in value){const result=await verifyOutcomeProof(value);out(result,`Outcome proof ${result.valid?'VALID':'INVALID'}\n${result.errors.join('\n')}`);return result.valid?0:1;}
        const report=await verifyBundle(value);out(report,`ECHOFRAME ${report.integrity}\nIntended payment: ${report.financialStatus}\nRecorded payment: ${report.recordedFinancialStatus}\nExecution: ${report.transactionExecution}\nTransfer logs: ${report.transferObservation}\nReproduced outcome: ${report.outcomeStatus}\nDelivery: ${report.deliveryStatus}\nAuthority: ${report.authorityStatus}\nChecks: ${report.checks.passed} passed, ${report.checks.failed} failed\n${[...report.errors,...report.warnings].join('\n')}`);return report.integrity==='VALID'?0:1;
      }
      case 'diagnose':{
        if(!input)throw new EvidenceError('FILE','Provide a complete evidence file');const bundle=await importBundle(await readFile(input,'utf8'));const diagnosis=await diagnoseBundle(bundle);
        if(typeof options.test==='string'){if(!options.complete)throw new EvidenceError('EXPORT_CONSENT','--test embeds complete evidence and requires --complete');await outputFile(options.test,await generateTraceRegression(bundle,{includeCompleteEvidence:true}));}out(diagnosis);return diagnosis.integrity==='VALID'?0:1;
      }
      case 'replay':{
        const run=runScenario(input??'response-lost',Number(options.seed??42220),options.safe?'honest':'vulnerable');
        if(typeof options.out==='string')await outputFile(options.out,JSON.stringify(run,null,2));
        if(typeof options.test==='string')await outputFile(options.test,generateRegression(run));out(run,`${run.scenarioId} / seed ${run.seed} / SIMULATED\n${run.assertions.passed} assertions passed; ${run.assertions.failed} failed\n${run.safeNextAction}\nFixed branch failures: ${fixAndRerun(run).assertions.failed}`);return 0;
      }
      case 'doctor':{
        const sample=await scenarioBundle(),verified=await verifyBundle(sample);const network:Record<string,string>={};
        if(options.live)for(const n of Object.values(networks))try{await new ReadonlyRpc({chainId:n.id,retries:0,timeoutMs:4000}).checkChain();network[n.name]='CHAIN_ID_MATCH';}catch(e){network[n.name]=e instanceof Error?e.message:'UNAVAILABLE';}
        const report={node:process.version,localVerifier:verified.integrity,network:options.live?network:'NOT_REQUESTED',walletActions:[],paidDependencies:[],offlineReady:verified.integrity==='VALID'};out(report);return verified.integrity==='VALID'?0:1;
      }
      case 'inspect-tx':{
        if(!input)throw new EvidenceError('HASH','Provide transaction hash');const chainId=Number(options.chain??11142220);if(chainId!==42220&&chainId!==11142220)throw new EvidenceError('CHAIN','Unsupported Celo chain');
        const expected:Expectations=options['trust-expectations']?{chainId,transactionHash:input.toLowerCase()}:{};for(const key of ['asset','recipient','sender','amount']as const)if(typeof options[key]==='string')expected[key]=options[key];
        const selected=options.log===undefined?{}:{selectedLogIndex:Number(options.log)};
        if('selectedLogIndex'in selected&&(!Number.isSafeInteger(selected.selectedLogIndex)||selected.selectedLogIndex!<0))throw new EvidenceError('LOG','Invalid log index');
        const report=await reconcile(new ReadonlyRpc({chainId}),input,{expected,...selected,expectationTrust:options['trust-expectations']?'USER_CONFIRMED':'NOT_PROVIDED',tokenBehavior:options['standard-erc20']?'CONFIGURED_ERC20':'UNVERIFIED'});out(report);return report.stale?2:0;
      }
      case 'export':{
        if(!input||typeof options.out!=='string')throw new EvidenceError('EXPORT','Provide input and --out');const bundle=await importBundle(await readFile(input,'utf8'));
        const selected=options.complete?bundle:publicBundle(bundle);await outputFile(options.out,options.html?htmlReport(selected,await verifyBundle(selected)):JSON.stringify(selected,null,2));print(`Exported ${options.complete?'complete private evidence':'public minimal evidence'} to ${resolve(options.out)}`);return 0;
      }
      case 'init':{
        const directory=resolve(input??'echoframe-example');await mkdir(directory,{recursive:true});
        await outputFile(join(directory,'sample.echoframe.json'),JSON.stringify(await scenarioBundle(),null,2));
        await outputFile(join(directory,'echoframe.config.json'),JSON.stringify({schemaVersion:'1.0.0',chainId:11142220,rpc:networks[11142220].rpc,policy:outcomeExamples.rates!.manifest},null,2));print(`Created offline sample and configuration in ${directory}`);return 0;
      }
      case 'check-config':{
        if(!input)throw new EvidenceError('CONFIG','Provide config path');const data=await readJson(input) as Record<string,Json>;
        if(data.schemaVersion!=='1.0.0'||(data.chainId!==42220&&data.chainId!==11142220)||typeof data.rpc!=='string')throw new EvidenceError('CONFIG','Invalid schemaVersion, chainId or RPC');
        const {manifestSchema}=await import('@echoframe/core');manifestSchema.parse(data.policy);new ReadonlyRpc({chainId:data.chainId,endpoints:[data.rpc]});out({valid:true,networkReads:false});return 0;
      }
      case 'integration-test':{
        const instrumentation=await runRecorderSelfTest();
        const dir=await mkdtemp(join(tmpdir(),'echoframe-journal-'));let first:SqliteAttemptJournal|undefined,reopened:SqliteAttemptJournal|undefined;
        try{
          first=new SqliteAttemptJournal(join(dir,'attempts.sqlite'));const attempt=await first.create({chainId:11142220,protocol:'x402',requestId:'integration',payer:'0x0000000000000000000000000000000000000001',payee:'0x0000000000000000000000000000000000000002',token:'0x0000000000000000000000000000000000000003',amount:'1000',quoteHash:commitment('integration',null)});
          await first.append(attempt.key,'AUTHORIZED');await first.append(attempt.key,'SUBMITTED');await first.append(attempt.key,'UNKNOWN');first.close();first=undefined;
          reopened=new SqliteAttemptJournal(join(dir,'attempts.sqlite'));const recovered=await reopened.get(attempt.key);const retry=shouldRetry(recovered!.events.at(-1)!.state);hex32.parse(attempt.key);
          const verified=await verifyBundle(await scenarioBundle());const ok=retry==='RECONCILE_FIRST'&&verified.integrity==='VALID';out({passed:ok,instrumentation,recoveredEvents:recovered!.events.length,recommendation:retry,verifier:verified.integrity,noPaymentSent:true});return ok?0:1;
        }finally{first?.close();reopened?.close();await rm(dir,{recursive:true,force:true});}
      }
    }return 1;
  }catch(e){print(JSON.stringify({error:e instanceof Error?e.message:String(e)}));return 1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.exitCode=await runCli(process.argv.slice(2));
