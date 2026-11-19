import {describe,it,expect,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {PaymentRequired} from '@x402/core/types';
import {encodePaymentRequiredHeader,encodePaymentSignatureHeader} from '@x402/core/http';
import {makeTerms,termsHash,checkChallenge,checkSigningRequest,CHAIN_ID,NETWORK,TOKEN,FACILITATOR,TIMEOUT,type SigningRequest} from '../examples/celo-x402-live/public.js';
import {createBuyerClient} from '../examples/celo-x402-live/client.js';
import {PurchaseSession} from '../examples/celo-x402-live/session.js';
import {restrictedFetch} from '../examples/celo-x402-live/network-guard.js';
import {inspectX402Signature} from '../packages/x402/src/index.js';
import {syntheticPayment,requirements} from '../examples/express-x402/index.js';
import {referenceForFinalization} from '../examples/celo-x402-live/reference.js';
const buyer='0x0000000000000000000000000000000000000001',seller='0x0000000000000000000000000000000000000002',terms=makeTerms(buyer,seller);
const required:PaymentRequired={x402Version:2,resource:{url:'http://127.0.0.1:4390/premium'},accepts:[{scheme:'exact',network:NETWORK,asset:TOKEN,payTo:seller,amount:'10000',maxTimeoutSeconds:TIMEOUT,extra:{name:'USDC',version:'2'}}]};
describe('official SDK and explicit MetaMask approval boundary (no settlement)',()=>{
  it('constructs only the reviewed unsigned EIP-3009 request and stops before signing',async()=>{const requests:SigningRequest[]=[];const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('NETWORK_FORBIDDEN_IN_TEST'));try{const client=createBuyerClient({address:buyer,signTypedData:async request=>{requests.push(request);throw new Error('SIGNATURE_NOT_AUTHORIZED');}});expect(requests).toHaveLength(0);await expect(client.createPaymentPayload(required)).rejects.toThrow('SIGNATURE_NOT_AUTHORIZED');expect(requests).toHaveLength(1);expect(()=>checkSigningRequest(requests[0]!,terms)).not.toThrow();expect(String(requests[0]!.message.validAfter)).toBe('0');expect(network).not.toHaveBeenCalled();}finally{network.mockRestore();}});
  it.each([{chainId:42220},{token:'0x'+'1'.repeat(40)},{amount:'10001'}])('rejects changed public intent %j',patch=>expect(()=>checkChallenge(encodePaymentRequiredHeader({...required,accepts:required.accepts.map(q=>({...q,...('chainId'in patch?{network:'eip155:42220'}:{}),...('token'in patch?{asset:patch.token}:{}),...('amount'in patch?{amount:patch.amount}:{})}))}),terms)).toThrow());
  it('rejects changed signer domain, parties, amount, duration and signing type',()=>{const request:SigningRequest={domain:{name:'USDC',version:'2',chainId:CHAIN_ID,verifyingContract:TOKEN},types:{TransferWithAuthorization:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'}]},primaryType:'TransferWithAuthorization',message:{from:buyer,to:seller,value:10000n,validAfter:0n,validBefore:1300n,nonce:'0x'+'11'.repeat(32)}};expect(()=>checkSigningRequest(request,terms,1000)).not.toThrow();for(const patch of [{domain:{...request.domain,chainId:42220}},{domain:{...request.domain,verifyingContract:buyer}},{primaryType:'Permit'},{message:{...request.message,value:10001n}},{message:{...request.message,to:buyer}},{message:{...request.message,validBefore:1301n}},{message:{...request.message,validBefore:1000n}}])expect(()=>checkSigningRequest({...request,...patch},terms,1000)).toThrow();});
  it('accepts the official epoch validAfter without accepting excessive remaining expiry',()=>{const p=syntheticPayment();p.payload.authorization.validAfter='0';expect(()=>inspectX402Signature(encodePaymentSignatureHeader(p),requirements,{nowSeconds:1700000010})).not.toThrow();p.payload.authorization.validBefore='1700000071';expect(()=>inspectX402Signature(encodePaymentSignatureHeader(p),requirements,{nowSeconds:1700000010})).toThrow('AUTH_WINDOW');});
});
describe('durable one-purchase boundary',()=>{
  it('requires matching explicit consent and prevents every repeated submission/settlement',()=>{const s=new PurchaseSession(':memory:',termsHash(terms));try{expect(()=>s.consume()).toThrow('ONE_PURCHASE');expect(()=>s.approve('0x'+'11'.repeat(32))).toThrow('CONSENT');s.approve(termsHash(terms));expect(()=>s.approve(termsHash(terms))).toThrow();s.consume();expect(()=>s.consume()).toThrow();s.reserveSettlement();expect(()=>s.reserveSettlement()).toThrow('ONE_SETTLEMENT');}finally{s.close();}});
  it('reopening after submission cannot authorize another payment',async()=>{const directory=await mkdtemp(join(tmpdir(),'echoframe-live-gate-'));try{const s=new PurchaseSession(join(directory,'gate.sqlite'),termsHash(terms));s.approve(termsHash(terms));s.consume();s.close();const recovered=new PurchaseSession(join(directory,'gate.sqlite'),termsHash(terms));try{expect(recovered.read().state).toBe('SUBMISSION_STARTED');expect(()=>recovered.approve(termsHash(terms))).toThrow();expect(()=>recovered.consume()).toThrow();}finally{recovered.close();}}finally{await rm(directory,{recursive:true,force:true});}});
});
describe('testnet-only network boundary',()=>{
  it('blocks mainnet, foreign origins, API key leakage and wallet-write RPC before any request',async()=>{let called=0;const guarded=restrictedFetch(async()=>{called++;throw new Error('NO_NETWORK_REPLY');});for(const url of ['https://api.x402.celo.org/settle','https://forno.celo.org','https://evil.example/verify'])await expect(guarded(url,{method:'POST'})).rejects.toThrow();await expect(guarded('https://forno.celo-sepolia.celo-testnet.org',{method:'POST',body:JSON.stringify({method:'eth_sendRawTransaction'})})).rejects.toThrow('READ_ONLY');await expect(guarded('https://forno.celo-sepolia.celo-testnet.org',{method:'POST',headers:{'X-API-Key':'never-forward'},body:'{}'})).rejects.toThrow();expect(called).toBe(0);});
  it('does not retry the only settlement fetch even when no response is available',async()=>{let called=0;const guarded=restrictedFetch(async()=>{called++;throw new Error('TRANSPORT_UNAVAILABLE_NO_RESPONSE');});await expect(guarded(FACILITATOR+'/settle',{method:'POST',body:'{}'})).rejects.toThrow('TRANSPORT_UNAVAILABLE');await expect(guarded(FACILITATOR+'/settle',{method:'POST',body:'{}'})).rejects.toThrow('ONE_SETTLEMENT');expect(called).toBe(1);});
});
describe('read-only finalization after a rejected response header',()=>{
  const hash='0x'+'ab'.repeat(32),other='0x'+'cd'.repeat(32);
  it('uses the separately persisted successful SDK reference without constructing a protocol response',()=>{
    expect(referenceForFinalization([],{success:true,transaction:hash})).toEqual({transactionHash:hash,facilitatorReference:{transaction:hash,success:true}});
    expect(referenceForFinalization([hash],{})).toEqual({transactionHash:hash});
  });
  it('refuses missing, failed, malformed, conflicting and multiple references',()=>{
    for(const [hashes,details]of [[[],{}],[[],{success:false,transaction:hash}],[[],{success:true,transaction:'not-a-hash'}],[[hash],{success:true,transaction:other}],[[hash,other],{success:true,transaction:hash}]]as const)expect(referenceForFinalization(hashes,details)).toBeUndefined();
  });
});
