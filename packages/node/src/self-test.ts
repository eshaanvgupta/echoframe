import {createServer,type Server} from 'node:http';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {Hono} from 'hono';
import {HTTPFacilitatorClient,encodePaymentRequiredHeader,encodePaymentResponseHeader,encodePaymentSignatureHeader,decodePaymentSignatureHeader} from '@x402/core/http';
import {Challenge,Credential,Receipt} from 'mppx';
import {canonicalize,importBundle,verifyBundle,diagnoseBundle,type EvidenceBundle} from '@echoframe/core';
import {inspectX402Signature} from '@echoframe/x402';
import {PaymentRecorder,type PaymentRecorderOptions} from './payment-recorder.js';
import {SqliteAttemptJournal} from './index.js';

const payer='0x0000000000000000000000000000000000000001',recipient='0x0000000000000000000000000000000000000002',token='0x0000000000000000000000000000000000000003',tx='0x'+'33'.repeat(32);
const requirements={scheme:'exact' as const,network:'eip155:11142220' as const,amount:'1000',asset:token,payTo:recipient,maxTimeoutSeconds:60,extra:{name:'Synthetic Token',version:'1'}};
const clock=()=>new Date('2026-01-01T12:00:00.000Z'),seconds=Date.parse(clock().toISOString())/1000;
export function syntheticLocalCredential(){return encodePaymentSignatureHeader({x402Version:2,accepted:requirements,payload:{signature:'0x'+'11'.repeat(65),authorization:{from:payer,to:recipient,value:'1000',validAfter:String(seconds-1),validBefore:String(seconds+30),nonce:'0x'+'22'.repeat(32)}}});}
function config(directory:string,protocol:'x402'|'mpp',journal:SqliteAttemptJournal,project:boolean):PaymentRecorderOptions{
  return {protocol,chainId:11142220,environment:'SIMULATED',payment:{token,recipient,amount:'1000',sender:payer},storagePath:join(directory,`${protocol}-recordings.sqlite`),journal,clock,
    ...(project?{capture:{mode:'json-allowlist' as const,paths:['rate','pair']},outcomePolicy:{version:'1.0.0' as const,name:'Allowlisted rate response',now:clock().toISOString(),rules:[{kind:'presence' as const},{kind:'range' as const,path:'rate',min:0,max:100}]}}:{})};
}
/** Production-shaped observation example with an explicitly synthetic LOOPBACK facilitator. Never uses an RPC or wallet. */
export async function startLocalMerchantSimulation(directory:string,options:{project?:boolean}={}):Promise<{url:string;server:Server;recorder:PaymentRecorder;journal:SqliteAttemptJournal;calls:string[];close:()=>Promise<void>}>{
  await mkdir(directory,{recursive:true});const journal=new SqliteAttemptJournal(join(directory,'x402-attempts.sqlite')),recorder=new PaymentRecorder(config(directory,'x402',journal,!!options.project)),middleware=recorder.express(),calls:string[]=[];
  const server=createServer((req,res)=>{
    // These are fixture endpoints, not a processor. All responses explicitly represent local simulation.
    if(req.url==='/facilitator/supported'){calls.push('supported');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({kinds:[{x402Version:2,scheme:'exact',network:'eip155:11142220'}],extensions:[],signers:{}}));return;}
    if(req.url==='/facilitator/verify'||req.url==='/facilitator/settle'){
      let size=0;req.on('data',(b:Buffer)=>{size+=b.length;if(size>32768)req.destroy();});req.on('end',()=>{const verify=req.url!.endsWith('verify');calls.push(verify?'verify':'settle');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(verify?{isValid:true,payer}:{success:false,errorReason:'settlement_pending',transaction:tx,network:'eip155:11142220',payer}));});return;
    }
    if(req.url!=='/resource'){res.statusCode=404;res.end('Not found');return;}
    middleware(req,res,error=>{
      if(error){res.statusCode=400;res.end('Recorder configuration or correlation invalid');return;}
      void(async()=>{
        const signature=req.headers['payment-signature'];res.setHeader('Content-Type','application/json');
        if(typeof signature!=='string'){res.statusCode=402;res.setHeader('PAYMENT-REQUIRED',encodePaymentRequiredHeader({x402Version:2,resource:{url:'https://example.invalid/resource'},accepts:[requirements]}));res.end('{"environment":"SIMULATED"}');return;}
        try{inspectX402Signature(signature,requirements,{nowSeconds:seconds,expectedPayer:payer});const credential=decodePaymentSignatureHeader(signature);const verify=await client.verify(credential,requirements);if(!verify.isValid)throw new Error('Invalid synthetic credential');const receipt=await client.settle(credential,requirements);res.setHeader('PAYMENT-RESPONSE',encodePaymentResponseHeader(receipt));res.end(JSON.stringify({environment:'SIMULATED',rate:0.41,pair:'CELO/USD',privateCustomerNote:'not-retained'}));}
        catch{res.statusCode=400;res.end('{"error":"Unsupported synthetic fixture"}');}
      })().catch(()=>{res.destroy();});
    });
  });
  await new Promise<void>((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;const client=new HTTPFacilitatorClient({url:url+'/facilitator',timeoutMs:2000});
  return {url,server,recorder,journal,calls,close:async()=>{await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));await recorder.close();journal.close();}};
}
/** Installed-package self-test: real HTTP lifecycle + Hono, durable recovery, export/import and independent checks. */
export async function runRecorderSelfTest():Promise<{passed:true;environment:'SIMULATED';frameworks:string[];requestCount:number;recovered:number;integrity:string;outcome:string;noPaymentSent:true}>{
  const directory=await mkdtemp(join(tmpdir(),'echoframe-recorder-'));if(dirname(directory)!==resolve(tmpdir()))throw new Error('Unexpected self-test directory');
  let merchant:Awaited<ReturnType<typeof startLocalMerchantSimulation>>|undefined;let reopened:PaymentRecorder|undefined;let journal:SqliteAttemptJournal|undefined;let honoRecorder:PaymentRecorder|undefined;let honoJournal:SqliteAttemptJournal|undefined;
  try{
    merchant=await startLocalMerchantSimulation(directory,{project:true});const first=await fetch(merchant.url+'/resource',{headers:{'X-Echoframe-Request-Id':'installed-synthetic-001'}});await first.text();await merchant.recorder.drain();
    const paid=await fetch(merchant.url+'/resource',{headers:{'X-Echoframe-Request-Id':'installed-synthetic-001','PAYMENT-SIGNATURE':syntheticLocalCredential(),Cookie:'never-store-cookie'}});await paid.text();await merchant.recorder.drain();
    if(paid.status!==200||merchant.recorder.list().length!==1||merchant.calls.join(',')!=='verify,settle')throw new Error('Installed HTTP recorder lifecycle failed');
    const context=merchant.recorder.list()[0]!.contextKey,bundle=merchant.recorder.getBundle(context)!;
    const report=await verifyBundle(bundle);if(report.integrity!=='VALID'||report.outcomeStatus!=='TESTED_PASS')throw new Error('Installed outcome reproduction failed');
    const serialized=canonicalize(bundle);if(['never-store-cookie','privateCustomerNote','not-retained',syntheticLocalCredential()].some(secret=>serialized.includes(secret)))throw new Error('Recorder retained excluded source material');
    await merchant.recorder.exportEvidence(context,join(directory,'complete.echoframe.json'),{mode:'complete'});await importBundle(await readFile(join(directory,'complete.echoframe.json'),'utf8'));
    await merchant.close();merchant=undefined;
    journal=new SqliteAttemptJournal(join(directory,'x402-attempts.sqlite'));reopened=new PaymentRecorder(config(directory,'x402',journal,true));const recovered=await reopened.recover();if(recovered.length!==1||(await journal.list())[0]!.events.at(-1)!.state!=='PENDING')throw new Error('Installed persistent recovery failed');
    if(!(await diagnoseBundle(reopened.getBundle(context))).findings.some(f=>f.classification==='JOURNAL_RECOVERED'))throw new Error('Recovered trace diagnosis missing');
    honoJournal=new SqliteAttemptJournal(join(directory,'mpp-attempts.sqlite'));honoRecorder=new PaymentRecorder(config(directory,'mpp',honoJournal,false));const app=new Hono();app.use('*',honoRecorder.hono());
    const challenge=Challenge.from({id:'installed-fixture',realm:'loopback-simulation',method:'evm',intent:'charge',request:{amount:'1000',currency:token,recipient,methodDetails:{chainId:11142220,decimals:6,credentialTypes:['authorization']}}});
    app.get('/report',c=>c.req.header('Authorization')?c.json({environment:'SIMULATED',rate:0.41},{headers:{'Payment-Receipt':Receipt.serialize({method:'evm',reference:tx,status:'success',timestamp:clock().toISOString()})}}):c.json({environment:'SIMULATED'},{status:402,headers:{'WWW-Authenticate':Challenge.serialize(challenge)}}));
    const h1=await app.request('/report',{headers:{'X-Echoframe-Request-Id':'installed-hono-001'}});await h1.text();await honoRecorder.drain();
    const credential=Credential.serialize({challenge,payload:{type:'authorization',signature:'0x'+'11'.repeat(65),from:payer,to:recipient,value:'1000',validAfter:String(seconds-1),validBefore:String(seconds+30),nonce:'0x'+'22'.repeat(32)}});
    const h2=await app.request('/report',{headers:{'X-Echoframe-Request-Id':'installed-hono-001',Authorization:credential}});await h2.text();await honoRecorder.drain();const hb=honoRecorder.list()[0]!.bundle;
    if((await verifyBundle(hb)).integrity!=='VALID'||!hb.events.some(e=>e.type==='payment.response')||canonicalize(hb).includes(credential))throw new Error('Installed Hono metadata recorder failed');
    return {passed:true,environment:'SIMULATED',frameworks:['Express-compatible Node HTTP','Hono'],requestCount:4,recovered:recovered.length,integrity:report.integrity,outcome:report.outcomeStatus,noPaymentSent:true};
  }finally{await merchant?.close();await reopened?.close();journal?.close();await honoRecorder?.close();honoJournal?.close();await rm(directory,{recursive:true,force:true});}
}
export type {EvidenceBundle};
