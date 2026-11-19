import {describe,it,expect} from 'vitest';
import {encodePaymentRequiredHeader,encodePaymentSignatureHeader,encodePaymentResponseHeader} from '@x402/core/http';
import {Challenge,Credential,Receipt} from 'mppx';
import {parseX402Challenge,inspectX402Signature,parseX402Settlement,normalizeX402Offer,headerValue,instrumentFetch} from '../packages/x402/src/index.js';
import {parseMppChallenge,normalizeMppOffer,inspectMppCredential,parseMppReceipt} from '../packages/mpp/src/index.js';
import {decodeJobLogs,inspectJob,PROFILE,jobLogFilter} from '../packages/erc8183/src/index.js';
import {ReadonlyRpc} from '../packages/celo/src/index.js';
import {verifyBundle} from '../packages/core/src/index.js';
import {requirements,syntheticPayment,startExample,runClientExample} from '../examples/express-x402/index.js';
import {runHonoExample} from '../examples/hono-mpp/index.js';
import {receipt as jobReceipt,contract} from '../examples/erc8183-local/index.js';
import {xHeader,signHeader,responseHeader,base64Json,challenge,copy,mHeader,mppChallenge,mCredential,mReceipt,TX,A,transport} from './fixtures.js';

describe('x402 v2 supported profile',()=>{
  it('parses the current official SDK challenge encoding',()=>expect(parseX402Challenge(xHeader()).accepts[0]).toEqual(requirements));
  it('normalizes exact integer amount without guessed decimals',()=>expect(normalizeX402Offer(requirements)).toMatchObject({amount:'1000',decimalsSource:'NOT_PROVIDED',chainId:11142220}));
  it('inspects a consistent transient credential without retaining it',()=>{const r=JSON.stringify(inspectX402Signature(signHeader(),requirements,{nowSeconds:1700000010}));expect(r).toContain('STRUCTURALLY_CONSISTENT');expect(r).not.toContain('11'.repeat(65));expect(r).not.toContain('nonce');});
  it('keeps settlement_pending nonterminal',()=>expect(parseX402Settlement(responseHeader(),requirements)).toMatchObject({financialStatus:'PENDING',deliveryStatus:'UNKNOWN',recommendation:'RECONCILE_FIRST'}));
  it.each([undefined,'%%%','A'.repeat(100000),base64Json({...challenge,x402Version:1}),base64Json({...challenge,x402Version:3})])('fails closed on absent/malformed/unsupported challenge %#',value=>expect(()=>parseX402Challenge(value)).toThrow());
  const badOffers=[{amount:'1.0'},{amount:'-1'},{amount:(1n<<256n).toString()},{payTo:''},{network:'eip155:1'},{scheme:'upto'},{extra:{name:'Token',version:'1',assetTransferMethod:'permit2'}},{extra:{name:'Token',version:'1',paymentFlow:'escrow'}},{extra:{}}];
  it.each(badOffers)('rejects unsupported requirements %j',patch=>expect(()=>parseX402Challenge(base64Json({...challenge,accepts:[{...requirements,...patch}]}))).toThrow());
  it('rejects malformed alternative instead of falling back to valid amount or payee',()=>{const bad={...requirements,amount:undefined,payTo:undefined};expect(()=>parseX402Challenge(base64Json({...challenge,accepts:[requirements,bad]}))).toThrow();});
  it.each(['amount','payTo','asset','network'])('pins quote field %s',key=>{const payment=syntheticPayment();Object.assign(payment.accepted,{[key]:key==='amount'?'1000000':key==='network'?'eip155:42220':A});expect(()=>inspectX402Signature(base64Json(payment),requirements,{nowSeconds:1700000010})).toThrow();});
  it('rejects expired authorization',()=>expect(()=>inspectX402Signature(signHeader(),requirements,{nowSeconds:1700000100})).toThrow('AUTH_WINDOW'));
  it('rejects authorization value mismatch',()=>{const p=syntheticPayment();p.payload.authorization.value='999';expect(()=>inspectX402Signature(encodePaymentSignatureHeader(p),requirements,{nowSeconds:1700000010})).toThrow();});
  it('rejects pending without transaction reference',()=>expect(()=>parseX402Settlement(encodePaymentResponseHeader({success:false,errorReason:'settlement_pending',transaction:'',network:'eip155:11142220'}),requirements)).toThrow());
  it('handles case-insensitive headers while rejecting duplicates',()=>{expect(headerValue({'Payment-Required':'abc'},'payment-required')).toBe('abc');expect(()=>headerValue({'PAYMENT-REQUIRED':'a','payment-required':'b'},'payment-required')).toThrow();});
  it('instrumentation does not initiate payment or log credentials',async()=>{const calls:Request[]=[],events:unknown[]=[];const wrapped=instrumentFetch(async input=>{calls.push(input as Request);return new Response('{}',{status:402,headers:{'PAYMENT-REQUIRED':xHeader()}});},event=>events.push(event));await wrapped('https://example.invalid',{headers:{Authorization:'Bearer secret'}});expect(calls).toHaveLength(1);expect(calls[0]!.headers.has('PAYMENT-SIGNATURE')).toBe(false);expect(JSON.stringify(events)).not.toContain('secret');});
});
describe('MPP evm one-shot charge via official mppx',()=>{
  it('normalizes official challenge serialization',()=>expect(parseMppChallenge(mHeader()).request.amount).toBe('1000'));
  it('preserves configured decimal provenance',()=>expect(normalizeMppOffer(parseMppChallenge(mHeader()))).toMatchObject({decimals:6,decimalsSource:'CONFIGURED'}));
  it('inspects flat EVM SDK credential without retaining signature',()=>expect(inspectMppCredential(mCredential(),parseMppChallenge(mHeader()))).toMatchObject({credentialRetained:false,amount:'1000'}));
  it('treats receipt as reported, not proven settlement or delivery',()=>expect(parseMppReceipt(mReceipt(),parseMppChallenge(mHeader()))).toMatchObject({financialStatus:'SUBMITTED',deliveryStatus:'UNKNOWN',quality:'APP_REPORTED'}));
  it.each(['session','subscription'])('rejects unsupported intent %s',intent=>expect(()=>parseMppChallenge(Challenge.serialize({...mppChallenge,intent}))).toThrow('UNSUPPORTED_MPP'));
  it('rejects unsupported method',()=>expect(()=>parseMppChallenge(Challenge.serialize({...mppChallenge,method:'stripe'}))).toThrow());
  it('rejects duplicate auth parameters',()=>expect(()=>parseMppChallenge(mHeader()+', intent="charge"')).toThrow('Duplicate'));
  it('rejects oversized or multiline headers',()=>{expect(()=>parseMppChallenge('Payment '+'A'.repeat(40000))).toThrow();expect(()=>parseMppChallenge(mHeader()+'\r\n')).toThrow();});
  it('rejects expired challenge',()=>expect(()=>parseMppChallenge(Challenge.serialize({...mppChallenge,expires:'2020-01-01T00:00:00.000Z'}),'2026-01-01T00:00:00.000Z')).toThrow('expired'));
  it('rejects changed echoed charge terms',()=>{const altered={...mppChallenge,request:{...mppChallenge.request,amount:'1000000'}};const credential=Credential.deserialize(mCredential());expect(()=>inspectMppCredential(Credential.serialize({...credential,challenge:altered}),parseMppChallenge(mHeader()))).toThrow('MPP_CHANGED');});
  it('rejects wrong receipt method',()=>expect(()=>parseMppReceipt(Receipt.serialize({method:'tempo',reference:TX,status:'success',timestamp:'2026-01-01T00:00:00.000Z'}),parseMppChallenge(mHeader()))).toThrow());
});
describe('ERC-8183 explicit reference compatibility',()=>{
  const config={chainId:11142220 as const,address:contract,expectedCodeHash:TX,profile:PROFILE};
  it('decodes the pinned indexed completion event',()=>expect(decodeJobLogs(jobReceipt,config,'1')[0]).toMatchObject({event:'JobCompleted'}));
  it('does not attribute other job IDs',()=>expect(decodeJobLogs(jobReceipt,config,'2')).toHaveLength(0));
  it('does not accept wrong emitter',()=>expect(decodeJobLogs(jobReceipt,{...config,address:A},'1')).toHaveLength(0));
  it('rejects unknown ABI profile',()=>expect(()=>decodeJobLogs(jobReceipt,{...config,profile:'other'as typeof PROFILE},'1')).toThrow('UNSUPPORTED'));
  it('rejects reverted containing receipts',()=>expect(()=>decodeJobLogs({...jobReceipt,status:'0x0'},config,'1')).toThrow());
  it('rejects unexpected ABI length',()=>{const r=copy(jobReceipt);r.logs[0]!.data+='00';expect(()=>decodeJobLogs(r,config,'1')).toThrow();});
  it('fails closed on unverified code hash',async()=>await expect(inspectJob(new ReadonlyRpc({chainId:11142220,transport:transport(),retries:0}),config,'1')).rejects.toThrow('code commitment'));
  it('bounds job log queries',()=>{expect(()=>jobLogFilter(config,'1','0x0','0x100000')).toThrow('LOG_RANGE');expect(jobLogFilter(config,'1','0x1','0x10')).toMatchObject({address:contract});});
});
describe('real local HTTP example transports',()=>{
  it('runs Express recorder and official HTTPFacilitatorClient over loopback',async()=>{
    const bundles:unknown[]=[];const example=await startExample(b=>bundles.push(b));try{await example.client.getSupported();const result=await runClientExample(example.url);expect(result.status).toBe(200);expect(example.calls).toEqual(['supported','verify','settle']);expect(bundles).toHaveLength(2);for(const b of bundles)expect((await verifyBundle(b)).integrity).toBe('VALID');expect(JSON.stringify(bundles)).not.toContain('11'.repeat(65));}finally{await example.close();}
  });
  it('does not send a credential on discovery',async()=>{const example=await startExample();try{const r=await fetch(`${example.url}/resource`);expect(r.status).toBe(402);expect(example.calls).toEqual([]);expect(parseX402Challenge(r.headers.get('PAYMENT-REQUIRED')!).accepts).toHaveLength(1);}finally{await example.close();}});
  it('rejects changed quote on local HTTP path without a facilitator call',async()=>{const example=await startExample();try{const p=syntheticPayment();p.accepted.amount='1000000';const r=await fetch(`${example.url}/resource`,{headers:{'PAYMENT-SIGNATURE':encodePaymentSignatureHeader(p)}});expect(r.status).toBe(400);expect(example.calls).toHaveLength(0);}finally{await example.close();}});
  it('runs Hono request/credential/receipt with mppx serialization',async()=>{const result=await runHonoExample();expect(result.status).toBe(200);expect((await verifyBundle(result.bundle)).integrity).toBe('VALID');});
  it('official x402 codec preserves exact current v2 format',()=>expect(parseX402Challenge(encodePaymentRequiredHeader(challenge))).toEqual(challenge));
});
