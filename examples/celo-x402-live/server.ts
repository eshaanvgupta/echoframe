import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {serve} from '@hono/node-server';
import {serveStatic} from '@hono/node-server/serve-static';
import {paymentMiddleware,x402ResourceServer} from '@x402/hono';
import {HTTPFacilitatorClient,type FacilitatorClient,type RoutesConfig} from '@x402/core/server';
import {ExactEvmScheme} from '@x402/evm/exact/server';
import {decodePaymentSignatureHeader} from '@x402/core/http';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {encodeFunctionData,decodeFunctionResult,parseAbi,getAddress,type Hex} from 'viem';
import {ReadonlyRpc} from '@echoframe/celo';
import {PaymentRecorder,SqliteAttemptJournal} from '@echoframe/node';
import {parseJson,canonicalize,EvidenceError,hex32,type Json} from '@echoframe/core';
import {inspectX402Signature} from '@echoframe/x402';
import {loadPrivateConfig} from './config.js';
import {CHAIN_ID,NETWORK,TOKEN,FACILITATOR,AMOUNT,CONTENT,TIMEOUT,termsHash,outcomePolicy,checkChallenge,type Terms} from './public.js';
import {PurchaseSession} from './session.js';
import {restrictedFetch} from './network-guard.js';
import {finalizeEvidence} from './evidence.js';
import {referenceForFinalization} from './reference.js';
const tokenAbi=parseAbi(['function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)']);
export async function readCredits(buyer:string,apiKey:string){
  const response=await fetch(FACILITATOR+'/api/account?address='+buyer,{redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new EvidenceError('CREDITS','Cannot inspect free testnet credits');
  const data=await response.json() as {apiKeyPrefix?:string;balances?:{testnet?:number};balanceMicro?:{testnet?:number}};
  const prefix=typeof data.apiKeyPrefix==='string'?data.apiKeyPrefix.replace(/\.{3}$|…$/,''):'';
  const credits=data.balances?.testnet,prepaid=data.balanceMicro?.testnet;if(prefix.length<5||!apiKey.startsWith(prefix)||!Number.isSafeInteger(credits)||!Number.isSafeInteger(prepaid))throw new EvidenceError('CREDITS','Configured key cannot be matched to the reviewed facilitator account');
  return {checkedAt:new Date().toISOString(),freeTestnetCredits:credits!,testnetPrepaidMicro:prepaid!,keyMatchesCreditAccount:true};
}
export async function preflight(terms:Terms,apiKey:string){
  const rpc=new ReadonlyRpc({chainId:CHAIN_ID,retries:0});await rpc.checkChain();const code=await rpc.call('eth_getCode',[TOKEN,'latest']);if(typeof code!=='string'||code==='0x')throw new EvidenceError('TOKEN','Configured Sepolia USDC has no bytecode');
  const call=async(name:'decimals'|'balanceOf',args:readonly []|readonly [Hex])=>{const raw=await rpc.call('eth_call',[{to:TOKEN,data:encodeFunctionData({abi:tokenAbi,functionName:name,args})},'latest']);return decodeFunctionResult({abi:tokenAbi,functionName:name,data:raw as Hex});};
  const decimals=Number(await call('decimals',[])),balance=BigInt(await call('balanceOf',[terms.buyer as Hex]));if(decimals!==6)throw new EvidenceError('TOKEN','USDC decimals do not match the approved terms');
  const response=await fetch(FACILITATOR+'/supported',{redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new EvidenceError('FACILITATOR','Supported profiles unavailable');
  const supported=await response.json() as {kinds?:Array<{x402Version:number;scheme:string;network:string;extra?:{supportedAssets?:Array<{asset:string;decimals:number;name:string;version:string;assetTransferMethod:string}>}}>};
  const kind=supported.kinds?.find(k=>k.x402Version===2&&k.scheme==='exact'&&k.network===NETWORK),asset=kind?.extra?.supportedAssets?.find(a=>a.asset.toLowerCase()===TOKEN.toLowerCase());
  if(!asset||asset.decimals!==6||asset.name!=='USDC'||asset.version!=='2'||asset.assetTransferMethod!=='eip3009')throw new EvidenceError('FACILITATOR','Hosted capability does not match the intended token/profile');
  return {checkedAt:new Date().toISOString(),chainId:CHAIN_ID,token:TOKEN,decimals,buyer:terms.buyer,buyerAtomicBalance:balance.toString(),sufficientFunds:balance>=BigInt(AMOUNT),facilitator:FACILITATOR,creditObservation:await readCredits(terms.buyer,apiKey),supportedProfile:{version:2,scheme:'exact',network:NETWORK,assetTransferMethod:'eip3009'},economicActions:0};
}
const approvalSchema=z.object({termsHash:hex32,approve:z.literal(true),acknowledgeSelfPayment:z.boolean(),acknowledgeFacilitatorCredit:z.literal(true)}).strict();
const receivedSchema=z.object({status:z.literal(200),body:z.object({data:z.literal(CONTENT)}).strict()}).strict();
export async function startLiveSeller(){
  const config=loadPrivateConfig(),terms=config.terms,hash=termsHash(terms),origin=`http://127.0.0.1:${config.port}`;await mkdir(config.directory,{recursive:true});
  let checked=await preflight(terms,config.apiKey);await writeFile(join(config.directory,'preflight.json'),canonicalize(checked),{mode:0o600});
  const session=new PurchaseSession(join(config.directory,'purchase.sqlite'),hash),journal=new SqliteAttemptJournal(join(config.directory,'attempts.sqlite'));
  const token=randomBytes(32).toString('hex'),requestId='celo-01-'+hash.slice(2,26),savedFetch=globalThis.fetch;globalThis.fetch=restrictedFetch(savedFetch,terms.buyer);
  const recorder=new PaymentRecorder({protocol:'x402',chainId:CHAIN_ID,environment:'TESTNET',payment:{token:TOKEN,recipient:terms.seller,sender:terms.buyer,amount:AMOUNT},storagePath:join(config.directory,'recordings.sqlite'),journal,capture:{mode:'json-allowlist',paths:['data'],maxBytes:4096},outcomePolicy:outcomePolicy(new Date().toISOString()),responseTimeoutMs:60000});
  await recorder.recover();
  const http=new HTTPFacilitatorClient({url:FACILITATOR,timeoutMs:45000,createAuthHeaders:async()=>{const h={'X-API-Key':config.apiKey};return {supported:h,verify:h,settle:h};}});
  const checkPayment=(payload:Parameters<FacilitatorClient['verify']>[0],requirement:Parameters<FacilitatorClient['verify']>[1])=>{
    if(payload.x402Version!==2||requirement.network!==NETWORK||requirement.asset.toLowerCase()!==TOKEN.toLowerCase()||requirement.amount!==AMOUNT||requirement.payTo.toLowerCase()!==terms.seller.toLowerCase())throw new EvidenceError('PAYMENT','Payment differs from approved terms');
  };
  let creditBefore:Awaited<ReturnType<typeof readCredits>>|undefined;
  const facilitator:FacilitatorClient={getSupported:()=>http.getSupported(),verify:async(payload,requirement)=>{checkPayment(payload,requirement);return http.verify(payload,requirement);},settle:async(payload,requirement)=>{checkPayment(payload,requirement);session.reserveSettlement();creditBefore=await readCredits(terms.buyer,config.apiKey);if(creditBefore.freeTestnetCredits<1)throw new EvidenceError('FREE_CREDIT_REQUIRED','No paid settlement balance is authorized');const result=await http.settle(payload,requirement);session.record('RESPONSE_OBSERVED',{transaction:hex32.safeParse(result.transaction).success?result.transaction:null,success:result.success,creditBefore});return result;}};
  const resourceServer=new x402ResourceServer(facilitator).register(NETWORK,new ExactEvmScheme());
  const routes:RoutesConfig={'GET /premium':{accepts:[{scheme:'exact',network:NETWORK,payTo:getAddress(terms.seller),price:{amount:AMOUNT,asset:getAddress(TOKEN),extra:{name:'USDC',version:'2'}},maxTimeoutSeconds:TIMEOUT}],description:'Official Celo example premium content',mimeType:'application/json'}};
  const app=new Hono();let finalizing:Promise<unknown>|undefined;let clientBytes:Uint8Array|undefined;let finalError:string|undefined;
  app.use('*',bodyLimit({maxSize:16384,onError:c=>c.json({error:'Request too large'},413)}));
  app.use('*',async(c,next)=>{
    const url=new URL(c.req.url),requestOrigin=c.req.header('Origin');
    if(url.host!==new URL(origin).host||requestOrigin&&requestOrigin!==origin||c.req.header('Sec-Fetch-Site')==='cross-site')return c.text('Local origin required',403);
    c.header('Cache-Control','no-store');c.header('X-Content-Type-Options','nosniff');c.header('Referrer-Policy','no-referrer');
    c.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://forno.celo-sepolia.celo-testnet.org; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if((c.req.path.startsWith('/api/')&&c.req.method!=='GET'||c.req.path==='/premium')&&c.req.header('X-Echoframe-Session')!==token)return c.text('Session control required',403);
    await next();
  });
  const publicPlan=()=>({terms,termsHash:hash,sessionToken:token,requestId,preflight:checked,selfPayment:terms.buyer.toLowerCase()===terms.seller.toLowerCase(),state:session.read().state,content:CONTENT,facilitatorCreditPolicy:`${checked.creditObservation.freeTestnetCredits} free testnet credits observed. One free settlement credit is intended; paid balance/top-ups are not authorized. The free balance is checked again immediately before the only settlement call.`,source:{repository:'https://github.com/celo-org/x402-celo-example',commit:'f3a128b339e770c5cd19627c6290bdd518470600',sdk:'@x402/* 2.31.0'}});
  app.get('/api/plan',c=>c.json(publicPlan()));
  app.get('/api/preflight',async c=>{checked=await preflight(terms,config.apiKey);return c.json(checked);});
  app.post('/api/approve-submit',async c=>{
    const approval=approvalSchema.parse(parseJson(await c.req.text(),2048));
    if(publicPlan().selfPayment&&!approval.acknowledgeSelfPayment)throw new EvidenceError('CONSENT','Self-payment requires an explicit acknowledgement');
    checked=await preflight(terms,config.apiKey);if(!checked.sufficientFunds||checked.creditObservation.freeTestnetCredits<1)throw new EvidenceError('FUNDS','Buyer funds or a free settlement credit are missing');session.approve(approval.termsHash);return c.json({approvedOnce:true});
  });
  app.use('/premium',async(c,next)=>{
    if(c.req.header('X-Echoframe-Request-Id')!==requestId)return c.text('Expected opaque request correlation required',400);
    const signature=c.req.header('PAYMENT-SIGNATURE');
    if(signature){
      const parsed=decodePaymentSignatureHeader(signature);checkPayment(parsed,parsed.accepted);inspectX402Signature(signature,parsed.accepted as Parameters<typeof inspectX402Signature>[1],{expectedPayer:terms.buyer,expectedResourceUrl:origin+'/premium'});
      session.consume();
    }await next();
  });
  app.use('/premium',recorder.hono());app.use('/premium',paymentMiddleware(routes,resourceServer));
  app.get('/premium',c=>c.json({data:CONTENT}));
  app.post('/api/received',async c=>{const received=receivedSchema.parse(parseJson(await c.req.text(),8192));clientBytes=new TextEncoder().encode(JSON.stringify(received.body));return c.json({receivedCommitmentRecorded:true});});
  app.get('/api/status',async c=>{
    await recorder.drain();const recordings=recorder.list(),bundle=recordings.at(-1)?.bundle;
    const persisted=session.read().details as {transaction?:unknown;success?:unknown};
    const reference=referenceForFinalization(bundle?.transactionHashes??[],persisted),transactionHash=reference?.transactionHash,recoveredReference=reference?.facilitatorReference;
    if(clientBytes&&transactionHash&&bundle&&!finalizing&&session.read().state!=='VERIFIED'){
      const bytes=clientBytes,contextKey=recordings.at(-1)!.contextKey;finalizing=(async()=>finalizeEvidence({recorder,contextKey,terms,transactionHash,directory:config.directory,clientBytes:bytes,...(recoveredReference?{facilitatorReference:recoveredReference}:{}),...(creditBefore?{billing:{before:creditBefore,after:await readCredits(terms.buyer,config.apiKey)}}:{})}))().then(result=>{session.record('VERIFIED',JSON.parse(canonicalize(result.match)) as Json);}).catch(()=>{finalError='Evidence needs read-only reconciliation or deliverable review; do not pay again.';session.record('UNKNOWN',{...persisted,transaction:transactionHash,evidenceComplete:false} as Json);});
    }
    const state=session.read();return c.json({state:state.state,details:state.details,error:finalError??null,finalizationRunning:!!finalizing&&state.state!=='VERIFIED'&&!finalError});
  });
  const exports=new Set(['complete-redacted.echoframe.json','outcome-proof.json','payment-match.json','verification-report.json','purchase.regression.test.ts']);
  app.get('/api/export/:name',async c=>{const name=c.req.param('name');if(!exports.has(name)||session.read().state!=='VERIFIED')return c.text('Verified export not available',404);const bytes=await readFile(join(config.directory,name));c.header('Content-Disposition',`attachment; filename="${name}"`);c.header('Content-Type',name.endsWith('.ts')?'text/plain; charset=utf-8':'application/json');return c.body(bytes);});
  app.get('/assets/*',serveStatic({root:fileURLToPath(new URL('./dist',import.meta.url))}));
  app.get('/',async c=>c.html(await readFile(fileURLToPath(new URL('./dist/index.html',import.meta.url)),'utf8')));
  app.onError((_error,c)=>c.json({error:'Request could not be completed safely. Preserve the attempt; do not automatically repeat a payment.'},400));
  const server=serve({fetch:app.fetch,hostname:'127.0.0.1',port:config.port});await new Promise<void>((done,reject)=>{if(server.listening)done();else server.once('listening',done);server.once('error',reject);});
  const discovery=await app.request(origin+'/premium',{headers:{'X-Echoframe-Session':token,'X-Echoframe-Request-Id':requestId}});await discovery.text();await recorder.drain();if(discovery.status!==402)throw new EvidenceError('DISCOVERY','Official seller did not return an unpaid challenge');checkChallenge(discovery.headers.get('PAYMENT-REQUIRED')??'',terms);
  return {origin,terms,preflight:checked,directory:config.directory,app,close:async()=>{await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));await finalizing;await recorder.close();journal.close();session.close();globalThis.fetch=savedFetch;}};
}
