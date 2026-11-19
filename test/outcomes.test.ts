import {describe,it,expect} from 'vitest';
import {Ajv} from 'ajv';
import {runOutcome,createOutcomeProof,verifyOutcomeProof,outcomeExamples,sha256,utf8,type ValidatorManifest,type OutcomeInput,type Json,deterministicDiff} from '../packages/core/src/index.js';
import {copy,NOW} from './fixtures.js';
import {privateKeyToAccount} from 'viem/accounts';
const manifest=(rule:Json):ValidatorManifest=>({version:'1.0.0',name:'Test policy',now:NOW,rules:[rule as ValidatorManifest['rules'][number]]});
const input:OutcomeInput={status:200,body:{rate:2,pair:'CELO/USD',asOf:'2026-01-01T11:59:00.000Z',a:2,b:3}};
describe('bounded deterministic validator DSL',()=>{
  const cases:Array<[string,Json,OutcomeInput,boolean]>=[
    ['presence present',{kind:'presence'},input,true],['presence empty',{kind:'presence'},{status:200,body:''},false],
    ['HTTP accepted',{kind:'http',min:200,max:299},input,true],['HTTP rejected',{kind:'http',min:400,max:499},input,false],
    ['required keys',{kind:'required',paths:['rate','pair']},input,true],['missing keys',{kind:'required',paths:['missing']},input,false],
    ['number type',{kind:'type',path:'rate',type:'number'},input,true],['type mismatch',{kind:'type',path:'rate',type:'string'},input,false],
    ['exact value',{kind:'equals',path:'pair',value:'CELO/USD'},input,true],['changed value',{kind:'equals',path:'rate',value:3},input,false],
    ['numeric bounds',{kind:'range',path:'rate',min:1,max:3},input,true],['invalid numeric bounds',{kind:'range',path:'rate',min:4,max:5},input,false],
    ['fresh date',{kind:'freshness',path:'asOf',maxAgeSeconds:120},input,true],['stale date',{kind:'freshness',path:'asOf',maxAgeSeconds:30},input,false],
    ['future date',{kind:'freshness',path:'asOf',maxAgeSeconds:99999},{status:200,body:{asOf:'2027-01-01T00:00:00.000Z'}},false],
    ['sum',{kind:'math',operation:'sum',paths:['a','b'],expected:5,tolerance:0},input,true],
    ['difference',{kind:'math',operation:'difference',paths:['a','b'],expected:-1,tolerance:0},input,true],
    ['product',{kind:'math',operation:'product',paths:['a','b'],expected:6,tolerance:0},input,true],
    ['ratio',{kind:'math',operation:'ratio',paths:['a','b'],expected:2/3,tolerance:1e-12},input,true],
    ['division by zero',{kind:'math',operation:'ratio',paths:['a','b'],expected:1,tolerance:0},{status:200,body:{a:1,b:0}},false],
    ['independent numeric input',{kind:'crossCheck',path:'rate',tolerance:0.1},{...input,crossCheck:{rate:2.01}},true],
    ['absent cross-check',{kind:'crossCheck',path:'rate',tolerance:0.1},input,false],
    ['safe regex',{kind:'regex',path:'pair',pattern:'^[A-Z]{3,8}$'},{status:200,body:{pair:'CELO'}},true],
    ['regex mismatch',{kind:'regex',path:'pair',pattern:'^[A-Z]{3,8}$'},input,false],
    ['file limits',{kind:'file',mime:'text/plain',maxBytes:5},{status:200,body:'hello',file:{mime:'text/plain',bytesBase64:'aGVsbG8='}},true],
    ['file oversize',{kind:'file',mime:'text/plain',maxBytes:4},{status:200,body:'hello',file:{mime:'text/plain',bytesBase64:'aGVsbG8='}},false],
    ['source signature absent',{kind:'sourceSignature',signer:'0x0000000000000000000000000000000000000001'},input,false]
  ];
  it.each(cases)('%s',async(_name,rule,body,pass)=>expect((await runOutcome(manifest(rule),body)).verdict).toBe(pass?'TESTED_PASS':'TESTED_FAIL'));
  it.each(Object.entries(outcomeExamples))('reproduces bundled %s example',async(_name,e)=>{const a=await runOutcome(e.manifest,e.input);expect(await runOutcome(copy(e.manifest),copy(e.input))).toEqual(a);expect(a.checks.length).toBeGreaterThan(0);});
  it('keeps subjective questions not machine verifiable',async()=>expect((await runOutcome(manifest({kind:'subjective',question:'Is it valuable?'}),input)).verdict).toBe('NOT_MACHINE_VERIFIABLE'));
  it.each(['(a+)+$','^a*$','(?=a)a','^([a-z]+)*$'])('rejects unsafe regex %s',async pattern=>await expect(runOutcome(manifest({kind:'regex',path:'pair',pattern}),input)).rejects.toThrow('REGEX'));
  it('rejects executable DSL',async()=>await expect(runOutcome({version:'1.0.0',name:'Bad',now:NOW,rules:[{kind:'javascript',source:'process.exit(1)'}]},input)).rejects.toThrow());
  it.each(['$ref','pattern','format','allOf','unknown'])('fails closed on unsupported schema keyword %s',async key=>await expect(runOutcome(manifest({kind:'schema',schema:{[key]:'evil'}}),input)).rejects.toThrow('UNSUPPORTED_SCHEMA'));
  it('matches Ajv for supported strict schemas',async()=>{const schema={type:'object',required:['a','b'],additionalProperties:false,properties:{a:{type:'number',minimum:1,maximum:10},b:{type:'string',minLength:2,maxLength:8}}};const validate=new Ajv().compile(schema);for(const body of [{a:2,b:'valid'},{a:0,b:'x'},{a:3,b:'okay',extra:true},{a:'2',b:'valid'}])expect((await runOutcome(manifest({kind:'schema',schema}),{status:200,body})).verdict==='TESTED_PASS').toBe(validate(body));});
  it('checks the exact selected SHA-256 bytes',async()=>{const hash=await sha256(utf8('hello'));const r=await runOutcome(manifest({kind:'sha256',expected:hash}),{status:200,body:null,file:{mime:'text/plain',bytesBase64:'aGVsbG8='}});expect(r.verdict).toBe('TESTED_PASS');});
  it('does not equate a matching hash with schema correctness',async()=>{const body={rate:-1},hash=await sha256(utf8('{"rate":-1}'));const m:ValidatorManifest={version:'1.0.0',name:'Hash and bounds',now:NOW,rules:[{kind:'sha256',expected:hash},{kind:'range',path:'rate',min:0,max:10}]};const r=await runOutcome(m,{status:200,body});expect(r.checks[0]?.status).toBe('PASS');expect(r.verdict).toBe('TESTED_FAIL');});
  it('exports an independently reproducible proof',async()=>{const p=await createOutcomeProof('trace-event',11142220,outcomeExamples.rates!.manifest,outcomeExamples.rates!.input);expect((await verifyOutcomeProof(p)).valid).toBe(true);});
  it('rejects changed outcome results',async()=>{const p=await createOutcomeProof('trace-event',11142220,outcomeExamples.rates!.manifest,outcomeExamples.rates!.input);p.result.verdict='TESTED_FAIL';expect((await verifyOutcomeProof(p)).valid).toBe(false);});
  it('binds outcome to event, content, policy and input',async()=>{const p=await createOutcomeProof('trace-event',11142220,outcomeExamples.rates!.manifest,outcomeExamples.rates!.input);for(const key of ['eventId','chainId','proofHash']){const changed=copy(p);Object.assign(changed,{[key]:key==='chainId'?42220:'changed'});expect((await verifyOutcomeProof(changed)).valid).toBe(false);}});
  it('redacts nested sensitive differences',()=>expect(deterministicDiff({user:{email:'a'}},{user:{email:'b'}})[0]?.observed).toBe('[REDACTED]'));
  it('cryptographically verifies a real local source signature and rejects changed bytes',async()=>{
    const account=privateKeyToAccount(('0x'+'1'.padStart(64,'0')) as `0x${string}`),hash=await sha256(utf8('hello'));
    const signature=await account.signMessage({message:{raw:hash}});const m=manifest({kind:'sourceSignature',signer:account.address});
    const i:OutcomeInput={status:200,body:null,file:{mime:'text/plain',bytesBase64:'aGVsbG8='},sourceSignature:signature};
    expect((await runOutcome(m,i)).verdict).toBe('TESTED_PASS');expect((await runOutcome(m,{...i,file:{mime:'text/plain',bytesBase64:'d29ybGQ='}})).verdict).toBe('TESTED_FAIL');
  });
  it('rejects unsupported schema keywords even in absent properties',async()=>await expect(runOutcome(manifest({kind:'schema',schema:{type:'object',properties:{absent:{$ref:'https://internal.invalid'}}}}),{status:200,body:{}})).rejects.toThrow('UNSUPPORTED_SCHEMA'));
});
