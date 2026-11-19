import {Challenge,Credential,Receipt} from 'mppx';
import {z} from 'zod';
import {address,atomic,chain,hex32,commitment,canonicalize,parseJson,decodeBase64,EvidenceError,type Json,type PaymentOffer} from '@echoframe/core';

export const chargeRequestSchema=z.object({amount:atomic,currency:address,recipient:address,description:z.string().max(500).optional(),externalId:z.string().max(200).optional(),methodDetails:z.object({chainId:chain,decimals:z.number().int().min(0).max(36),credentialTypes:z.tuple([z.literal('authorization')])}).strict()}).strict();
const challengeSchema=z.object({id:z.string().min(1).max(200),realm:z.string().min(1).max(200),method:z.literal('evm'),intent:z.literal('charge'),request:chargeRequestSchema,expires:z.iso.datetime().optional(),description:z.string().max(500).optional(),digest:z.string().max(200).optional(),opaque:z.string().max(8192).optional(),header:z.literal('Payment-Authorization').optional()}).strict();
export type MppCharge=z.infer<typeof challengeSchema>;
function bound(header:string):void{if(typeof header!=='string'||header.length>32768||/[\r\n]/.test(header))throw new EvidenceError('MPP_HEADER','Invalid or oversized header');}
function encodedJson(encoded:unknown):Json{
  if(typeof encoded!=='string'||!/^[A-Za-z0-9_-]+={0,2}$/.test(encoded))throw new EvidenceError('MPP_HEADER','Malformed base64url JSON');
  const base=encoded.replaceAll('-','+').replaceAll('_','/').replace(/=+$/,'');return parseJson(new TextDecoder('utf-8',{fatal:true}).decode(decodeBase64(base+'='.repeat((4-base.length%4)%4),32768)),32768);
}
function challengeParameters(header:string):string[]{
  let i=header.indexOf(' ')+1;const keys:string[]=[];
  while(i<header.length){
    while(/[\s,]/.test(header[i]??'')&&i<header.length)i++;
    if(i===header.length)break;const start=i;while(/[A-Za-z0-9_-]/.test(header[i]??'')&&i<header.length)i++;
    if(i===start)throw new EvidenceError('MPP_HEADER','Malformed challenge parameter');const key=header.slice(start,i).toLowerCase();keys.push(key);
    while(header[i]===' ')i++;if(header[i++]!=='=')throw new EvidenceError('MPP_HEADER','Expected challenge parameter value');while(header[i]===' ')i++;
    const valueStart=i;
    if(header[i]==='"'){i++;let closed=false;while(i<header.length){const c=header[i++];if(c==='\\'){i++;continue;}if(c==='"'){closed=true;break;}}if(!closed)throw new EvidenceError('MPP_HEADER','Unclosed quoted parameter');}
    else{const begin=i;while(i<header.length&&header[i]!==','&&header[i]!==' ')i++;if(i===begin)throw new EvidenceError('MPP_HEADER','Empty parameter value');}
    if(key==='request'){const raw=header.slice(valueStart,i);encodedJson(raw.startsWith('"')?raw.slice(1,-1):raw);}
    while(header[i]===' ')i++;if(i<header.length&&header[i]!==',')throw new EvidenceError('MPP_HEADER','Multiple or malformed challenges are unsupported');
  }return keys;
}
const mppPayloadSchema=z.object({type:z.literal('authorization'),signature:z.string().regex(/^0x[0-9a-fA-F]{130}$/),from:address,to:address,value:atomic,validAfter:atomic,validBefore:atomic,nonce:hex32}).strict();
function boundedCredential(header:string){
  bound(header);if(!/^Payment /i.test(header))throw new EvidenceError('UNSUPPORTED_MPP','Expected Payment credential');
  const encoded=header.slice(8);if(!/^[A-Za-z0-9_-]+$/.test(encoded))throw new EvidenceError('MPP_HEADER','Malformed base64url credential');
  const raw=encodedJson(encoded);
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['challenge','payload','source'].includes(k)))throw new EvidenceError('UNSUPPORTED_MPP','Unsupported credential fields');
  const c=raw.challenge;if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['id','realm','method','intent','request','expires','description','digest','opaque','header'].includes(k)))throw new EvidenceError('UNSUPPORTED_MPP','Unsupported echoed challenge fields');encodedJson(c.request);
  return Credential.deserialize('Payment '+encoded);
}
/** Only one EVM charge challenge; never silently select a different payment alternative. */
export function parseMppChallenge(header:string,now?:string):MppCharge{
  bound(header);if(!/^Payment /i.test(header))throw new EvidenceError('UNSUPPORTED_MPP','Expected Payment authentication scheme');
  const params=challengeParameters(header);
  if(new Set(params).size!==params.length)throw new EvidenceError('MPP_HEADER','Duplicate challenge parameter');
  if(params.some(p=>!['id','realm','method','intent','request','expires','description','digest','opaque','header'].includes(p)))throw new EvidenceError('UNSUPPORTED_MPP','Unsupported challenge parameter');
  try{
    const challenge=challengeSchema.parse(Challenge.deserialize('Payment '+header.slice(8)));
    if(now&&challenge.expires&&Date.parse(challenge.expires)<=Date.parse(now))throw new EvidenceError('MPP_EXPIRED','Challenge expired');
    return challenge;
  }catch(error){throw new EvidenceError('UNSUPPORTED_MPP',error instanceof Error?error.message:'Unsupported challenge');}
}
export function normalizeMppOffer(challenge:MppCharge):PaymentOffer{
  const c=challengeSchema.parse(challenge);return {id:'mpp-offer',chainId:c.request.methodDetails.chainId,scheme:'exact',token:c.request.currency,payee:c.request.recipient,amount:c.request.amount,decimals:c.request.methodDetails.decimals,decimalsSource:'CONFIGURED',quoteHash:commitment('mpp-evm-charge-v1',c)};
}
export function inspectMppCredential(header:string,expected:MppCharge,options:{nowSeconds?:number}={}):Json{
  const credential=boundedCredential(header);
  const c=challengeSchema.parse(credential.challenge);
  if(canonicalize(c)!==canonicalize(challengeSchema.parse(expected)))throw new EvidenceError('MPP_CHANGED','Echoed challenge does not match selected terms');
  const payload=mppPayloadSchema.parse(credential.payload);
  if(payload.to.toLowerCase()!==c.request.recipient.toLowerCase()||payload.value!==c.request.amount)throw new EvidenceError('MPP_AUTHORIZATION','Credential does not match charge recipient/amount');
  if(options.nowSeconds!==undefined){const now=BigInt(Math.floor(options.nowSeconds));if(BigInt(payload.validAfter)>=now||BigInt(payload.validBefore)<=now||c.expires&&Date.parse(c.expires)<=options.nowSeconds*1000)throw new EvidenceError('AUTH_WINDOW','MPP authorization/challenge is expired or premature');}
  return {protocol:'mpp',intent:'charge',method:'evm',quoteHash:normalizeMppOffer(c).quoteHash,payer:payload.from,amount:c.request.amount,credentialRetained:false,signatureStatus:'STRUCTURALLY_CONSISTENT_NOT_CRYPTOGRAPHICALLY_VERIFIED',challengeAuthenticity:'UNVERIFIED_SERVER_HMAC'};
}
export function readMppCredentialMetadata(header:string){
  const credential=boundedCredential(header),challenge=challengeSchema.parse(credential.challenge),payload=mppPayloadSchema.parse(credential.payload);
  return {challenge,offer:normalizeMppOffer(challenge),payer:payload.from.toLowerCase(),payee:payload.to.toLowerCase(),amount:payload.value,validAfter:payload.validAfter,validBefore:payload.validBefore,authorizationFingerprint:commitment('eip3009-reference-v1',{chain:`eip155:${challenge.request.methodDetails.chainId}`,token:challenge.request.currency.toLowerCase(),payer:payload.from.toLowerCase(),nonce:payload.nonce})};
}
export function parseMppReceipt(header:string,expected:MppCharge):Json{
  challengeSchema.parse(expected);
  return parseMppReceiptReference(header,expected.request.methodDetails.chainId);
}
export function parseMppReceiptReference(header:string,chainId:42220|11142220):Json{
  bound(header);encodedJson(header);const value=Receipt.deserialize(header);
  const receipt=z.object({method:z.literal('evm'),reference:hex32,status:z.literal('success'),timestamp:z.iso.datetime()}).strict().parse(value);
  return {protocol:'mpp',method:receipt.method,reference:receipt.reference,status:receipt.status,timestamp:receipt.timestamp,chainId,financialStatus:'SUBMITTED',quality:'APP_REPORTED',deliveryStatus:'UNKNOWN',recommendation:'RECONCILE_FIRST'};
}
export {Challenge,Receipt};
