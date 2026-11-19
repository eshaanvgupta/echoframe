import {TRANSFER_TOPIC,type RpcReceipt,type RpcTransport} from '../packages/celo/src/index.js';
import {encodeBase64,utf8,type Json,commitment,type AttemptIdentity} from '../packages/core/src/index.js';
import {Challenge,Receipt,Credential} from 'mppx';
import {encodePaymentRequiredHeader,encodePaymentSignatureHeader,encodePaymentResponseHeader} from '@x402/core/http';
import {requirements,syntheticPayment} from '../examples/express-x402/index.js';

export const A='0x0000000000000000000000000000000000000001',B='0x0000000000000000000000000000000000000002',TOKEN='0x0000000000000000000000000000000000000003';
export const TX='0x'+'11'.repeat(32),BLOCK='0x'+'22'.repeat(32);
export const NOW='2026-01-01T12:00:00.000Z';
export const copy=<T>(v:T):T=>structuredClone(v);
const topic=(a:string)=>'0x'+'0'.repeat(24)+a.slice(2);
export function receipt():RpcReceipt{return {transactionHash:TX,blockHash:BLOCK,blockNumber:'0x10',from:A,to:TOKEN,status:'0x1',logs:[{address:TOKEN,topics:[TRANSFER_TOPIC,topic(A),topic(B)],data:'0x'+(1000n).toString(16).padStart(64,'0'),logIndex:'0x2',transactionHash:TX,blockHash:BLOCK,blockNumber:'0x10',removed:false}]};}
export function transport(overrides:Partial<Record<string,unknown>>={},hook?:(endpoint:string,method:string)=>void):RpcTransport{
  return async(endpoint,method,_params,signal)=>{signal.throwIfAborted();hook?.(endpoint,method);if(Object.hasOwn(overrides,method)){const value=overrides[method];if(value instanceof Error)throw value;return value;}
    if(method==='eth_chainId')return '0xaa044c';if(method==='eth_getTransactionReceipt')return receipt();if(method==='eth_getBlockByHash')return {hash:BLOCK,number:'0x10',timestamp:'0x1000',transactions:[TX]};if(method==='eth_call')return '0x'+'6'.padStart(64,'0');if(method==='eth_getCode')return '0x6000';return null;};
}
export const identity:AttemptIdentity={chainId:11142220,protocol:'x402',requestId:'test-request',payer:A,payee:B,token:TOKEN,amount:'1000',quoteHash:commitment('test-quote',null)};
export const challenge={x402Version:2,resource:{url:'https://example.invalid/rates'},accepts:[requirements]};
export const xHeader=()=>encodePaymentRequiredHeader(challenge);
export const signHeader=()=>encodePaymentSignatureHeader(syntheticPayment());
export const responseHeader=()=>encodePaymentResponseHeader({success:false,errorReason:'settlement_pending',transaction:TX,network:'eip155:11142220'});
export const base64Json=(value:unknown)=>encodeBase64(utf8(JSON.stringify(value)));
export const mppChallenge=Challenge.from({id:'test-charge',realm:'test.invalid',method:'evm',intent:'charge',request:{amount:'1000',currency:TOKEN,recipient:B,methodDetails:{chainId:11142220,decimals:6,credentialTypes:['authorization']}}});
export const mHeader=()=>Challenge.serialize(mppChallenge);
export const mCredential=()=>Credential.serialize({challenge:mppChallenge,payload:{type:'authorization',from:A,to:B,value:'1000',validAfter:'1700000000',validBefore:'1700000060',nonce:TX,signature:'0x'+'33'.repeat(65)}});
export const mReceipt=()=>Receipt.serialize({method:'evm',reference:TX,status:'success',timestamp:NOW});
export function json(value:unknown):Json{return JSON.parse(JSON.stringify(value)) as Json;}
