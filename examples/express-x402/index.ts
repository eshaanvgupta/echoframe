import express from 'express';
import {writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import type {Server} from 'node:http';
import {HTTPFacilitatorClient,encodePaymentRequiredHeader,encodePaymentResponseHeader,decodePaymentSignatureHeader,encodePaymentSignatureHeader} from '@x402/core/http';
import {PaymentRecorder,SqliteAttemptJournal} from '@echoframe/node';
import {join} from 'node:path';
import {parseX402Challenge,inspectX402Signature,instrumentFetch,type X402Requirements} from '@echoframe/x402';
import {type EvidenceBundle} from '@echoframe/core';

// LOCAL SIMULATION ONLY. No signer, RPC or real settlement transport exists in this example.
export const requirements:X402Requirements={scheme:'exact',network:'eip155:11142220',amount:'1000',asset:'0x0000000000000000000000000000000000000003',payTo:'0x0000000000000000000000000000000000000002',maxTimeoutSeconds:60,extra:{name:'Synthetic Token',version:'1'}};
export function syntheticPayment(){return {x402Version:2,accepted:{...requirements,extra:{...requirements.extra}},payload:{signature:'0x'+'11'.repeat(65),authorization:{from:'0x0000000000000000000000000000000000000001',to:requirements.payTo,value:'1000',validAfter:'1700000000',validBefore:'1700000060',nonce:'0x'+'22'.repeat(32)}}};}
export async function startExample(onBundle:(bundle:EvidenceBundle)=>void=()=>{},storageDirectory?:string):Promise<{url:string;server:Server;client:HTTPFacilitatorClient;calls:string[];close:()=>Promise<void>}>{
  if(storageDirectory)await mkdir(storageDirectory,{recursive:true});
  const journal=new SqliteAttemptJournal(storageDirectory?join(storageDirectory,'attempts.sqlite'):':memory:');
  const recorder=new PaymentRecorder({protocol:'x402',chainId:11142220,environment:'SIMULATED',payment:{token:requirements.asset,recipient:requirements.payTo,amount:requirements.amount,sender:'0x0000000000000000000000000000000000000001'},storagePath:storageDirectory?join(storageDirectory,'recordings.sqlite'):':memory:',journal,clock:()=>new Date(1700000010000),onBundle});
  const app=express(),calls:string[]=[];app.use(express.json({limit:'32kb'}));
  app.get('/facilitator/supported',(_req,res)=>{calls.push('supported');res.json({kinds:[{x402Version:2,scheme:'exact',network:'eip155:11142220'}],extensions:[],signers:{}});});
  app.post('/facilitator/verify',(req,res)=>{calls.push('verify');res.json({isValid:req.body?.paymentPayload?.accepted?.amount==='1000',payer:'0x0000000000000000000000000000000000000001'});});
  app.post('/facilitator/settle',(_req,res)=>{calls.push('settle');res.json({success:true,transaction:'0x'+'33'.repeat(32),network:'eip155:11142220',payer:'0x0000000000000000000000000000000000000001'});});
  app.use('/resource',recorder.express());
  app.get('/resource',async(req,res)=>{
    const signature=req.header('PAYMENT-SIGNATURE');
    if(!signature){res.setHeader('PAYMENT-REQUIRED',encodePaymentRequiredHeader({x402Version:2,resource:{url:'https://example.invalid/resource'},accepts:[requirements]}));res.status(402).json({environment:'SIMULATED',message:'Synthetic local charge challenge'});return;}
    try{
      inspectX402Signature(signature,requirements,{nowSeconds:1700000010});const payload=decodePaymentSignatureHeader(signature);
      const verification=await client.verify(payload,requirements);if(!verification.isValid){res.status(402).json({error:'Synthetic verification failed'});return;}
      const settlement=await client.settle(payload,requirements);res.setHeader('PAYMENT-RESPONSE',encodePaymentResponseHeader(settlement));res.json({environment:'SIMULATED',rate:0.41,pair:'CELO/USD'});
    }catch{res.status(400).json({error:'Unsupported or inconsistent synthetic credential'});}
  });
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const port=(server.address() as {port:number}).port,url=`http://127.0.0.1:${port}`;const client=new HTTPFacilitatorClient({url:`${url}/facilitator`,timeoutMs:2000});
  return {url,server,client,calls,close:async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await recorder.close();journal.close();}};
}
export async function runClientExample(url:string):Promise<{status:number;events:unknown[]}>{
  if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url))throw new Error('Example client is restricted to an explicit loopback simulation');
  const events:unknown[]=[],recorded=instrumentFetch(fetch,event=>events.push(event));const response=await recorded(`${url}/resource`,{headers:{'X-Echoframe-Request-Id':'example-synthetic-001'}});parseX402Challenge(response.headers.get('PAYMENT-REQUIRED')??undefined);
  const paid=await recorded(`${url}/resource`,{headers:{'X-Echoframe-Request-Id':response.headers.get('ECHOFRAME-REQUEST-ID')!,'PAYMENT-SIGNATURE':encodePaymentSignatureHeader(syntheticPayment())}});await paid.text();return {status:paid.status,events};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const traces:EvidenceBundle[]=[];const example=await startExample(b=>traces.push(b),'local-evidence');try{
    const result=await runClientExample(example.url);await mkdir('local-evidence',{recursive:true});
    const {sealBundle}=await import('@echoframe/core');for(const [i,b]of traces.entries())await writeFile(`local-evidence/http-${i}.echoframe.json`,JSON.stringify(sealBundle(b),null,2));
    console.log(JSON.stringify({environment:'SIMULATED',...result,facilitatorCalls:example.calls,evidenceDirectory:resolve('local-evidence')},null,2));
  }finally{await example.close();}
}
