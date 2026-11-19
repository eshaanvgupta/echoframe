import {Hono} from 'hono';
import {Challenge,Credential,Receipt} from 'mppx';
import {parseMppChallenge,inspectMppCredential,parseMppReceipt} from '@echoframe/mpp';
import {PaymentRecorder,SqliteAttemptJournal} from '@echoframe/node';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {writeFile,mkdir} from 'node:fs/promises';

export const charge=Challenge.from({id:'local-synthetic-charge',realm:'localhost-simulation',method:'evm',intent:'charge',request:{amount:'1000',currency:'0x0000000000000000000000000000000000000003',recipient:'0x0000000000000000000000000000000000000002',methodDetails:{chainId:11142220,decimals:6,credentialTypes:['authorization']}}});
export const app=new Hono();
app.get('/report',c=>{
  const credential=c.req.header('Authorization');if(!credential)return c.json({environment:'SIMULATED'},{status:402,headers:{'WWW-Authenticate':Challenge.serialize(charge)}});
  try{inspectMppCredential(credential,parseMppChallenge(Challenge.serialize(charge)));return c.json({environment:'SIMULATED',completed:9,failed:1},{headers:{'Payment-Receipt':Receipt.serialize({method:'evm',reference:'0x'+'44'.repeat(32),status:'success',timestamp:'2026-01-01T12:00:00.000Z'})}});}catch{return c.json({error:'Unsupported synthetic credential'},400);}
});
export async function runHonoExample(storageDirectory?:string){
  if(storageDirectory)await mkdir(storageDirectory,{recursive:true});
  const journal=new SqliteAttemptJournal(storageDirectory?join(storageDirectory,'attempts.sqlite'):':memory:');
  const recorder=new PaymentRecorder({protocol:'mpp',chainId:11142220,environment:'SIMULATED',payment:{token:charge.request.currency as string,recipient:charge.request.recipient as string,amount:'1000',sender:'0x0000000000000000000000000000000000000001'},journal,storagePath:storageDirectory?join(storageDirectory,'recordings.sqlite'):':memory:',clock:()=>new Date(1700000010000)});
  const recorded=new Hono();recorded.use('*',recorder.hono());recorded.route('/',app);
  try{
  const first=await recorded.request('/report',{headers:{'X-Echoframe-Request-Id':'example-mpp-001'}}),challenge=parseMppChallenge(first.headers.get('WWW-Authenticate')!);
  await first.text();await recorder.drain();
  const credential=Credential.serialize({challenge,payload:{type:'authorization',signature:'0x'+'11'.repeat(65),from:'0x0000000000000000000000000000000000000001',to:challenge.request.recipient,value:'1000',validAfter:'1700000000',validBefore:'1700000060',nonce:'0x'+'22'.repeat(32)}});
  const response=await recorded.request('/report',{headers:{'X-Echoframe-Request-Id':'example-mpp-001',Authorization:credential}});parseMppReceipt(response.headers.get('Payment-Receipt')!,challenge);await response.text();await recorder.drain();
  return {status:response.status,bundle:recorder.list()[0]!.bundle};
  }finally{await recorder.close();journal.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const result=await runHonoExample('local-evidence');await mkdir('local-evidence',{recursive:true});await writeFile('local-evidence/hono.echoframe.json',JSON.stringify(result.bundle,null,2));console.log(JSON.stringify(result,null,2));}
