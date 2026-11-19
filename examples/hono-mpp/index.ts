import {Hono} from 'hono';
import {Challenge,Credential,Receipt} from 'mppx';
import {parseMppChallenge,inspectMppCredential,parseMppReceipt} from '@echoframe/mpp';
import {appendEvent,createBundle,sealBundle,type Json} from '@echoframe/core';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {writeFile,mkdir} from 'node:fs/promises';

export const charge=Challenge.from({id:'local-synthetic-charge',realm:'localhost-simulation',method:'evm',intent:'charge',request:{amount:'1000',currency:'0x0000000000000000000000000000000000000003',recipient:'0x0000000000000000000000000000000000000002',methodDetails:{chainId:11142220,decimals:6,credentialTypes:['authorization']}}});
export const app=new Hono();
app.get('/report',c=>{
  const credential=c.req.header('Authorization');if(!credential)return c.json({environment:'SIMULATED'},{status:402,headers:{'WWW-Authenticate':Challenge.serialize(charge)}});
  try{inspectMppCredential(credential,parseMppChallenge(Challenge.serialize(charge)));return c.json({environment:'SIMULATED',completed:9,failed:1},{headers:{'Payment-Receipt':Receipt.serialize({method:'evm',reference:'0x'+'44'.repeat(32),status:'success',timestamp:'2026-01-01T12:00:00.000Z'})}});}catch{return c.json({error:'Unsupported synthetic credential'},400);}
});
export async function runHonoExample(){
  const first=await app.request('/report'),challenge=parseMppChallenge(first.headers.get('WWW-Authenticate')!);
  const credential=Credential.serialize({challenge,payload:{type:'authorization',signature:'0x'+'11'.repeat(65),from:'0x0000000000000000000000000000000000000001',to:challenge.request.recipient,value:'1000',validAfter:'1700000000',validBefore:'1700000060',nonce:'0x'+'22'.repeat(32)}});
  const response=await app.request('/report',{headers:{Authorization:credential}});const receipt=parseMppReceipt(response.headers.get('Payment-Receipt')!,challenge);
  let bundle=createBundle({title:'Hono MPP local HTTP simulation',protocolKind:'mpp',environment:'SIMULATED'});bundle=appendEvent(bundle,'mpp.charge',{receipt:receipt as Json,status:response.status});
  return {status:response.status,bundle:sealBundle(bundle)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const result=await runHonoExample();await mkdir('local-evidence',{recursive:true});await writeFile('local-evidence/hono.echoframe.json',JSON.stringify(result.bundle,null,2));console.log(JSON.stringify(result,null,2));}
