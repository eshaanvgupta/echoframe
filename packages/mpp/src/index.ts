import {Challenge,Credential,Receipt} from 'mppx';
import {z} from 'zod';
import {address,atomic,chain,hex32,commitment,canonicalize,EvidenceError,type Json,type PaymentOffer} from '@echoframe/core';

export const chargeRequestSchema=z.object({amount:atomic,currency:address,recipient:address,description:z.string().max(500).optional(),externalId:z.string().max(200).optional(),methodDetails:z.object({chainId:chain,decimals:z.number().int().min(0).max(36),credentialTypes:z.tuple([z.literal('authorization')])}).strict()}).strict();
const challengeSchema=z.object({id:z.string().min(1).max(200),realm:z.string().min(1).max(200),method:z.literal('evm'),intent:z.literal('charge'),request:chargeRequestSchema,expires:z.iso.datetime().optional(),description:z.string().max(500).optional(),digest:z.string().max(200).optional(),opaque:z.string().max(8192).optional(),header:z.literal('Payment-Authorization').optional()}).strict();
export type MppCharge=z.infer<typeof challengeSchema>;
function bound(header:string):void{if(typeof header!=='string'||header.length>32768||/[\r\n]/.test(header))throw new EvidenceError('MPP_HEADER','Invalid or oversized header');}
/** Only one EVM charge challenge; never silently select a different payment alternative. */
export function parseMppChallenge(header:string,now?:string):MppCharge{
  bound(header);if(!header.startsWith('Payment '))throw new EvidenceError('UNSUPPORTED_MPP','Expected Payment authentication scheme');
  const params=[...header.matchAll(/(?:^Payment\s+|,\s*)([A-Za-z][A-Za-z0-9_-]*)\s*=/g)].map(m=>m[1]!.toLowerCase());
  if(new Set(params).size!==params.length)throw new EvidenceError('MPP_HEADER','Duplicate challenge parameter');
  try{
    const challenge=challengeSchema.parse(Challenge.deserialize(header));
    if(now&&challenge.expires&&Date.parse(challenge.expires)<=Date.parse(now))throw new EvidenceError('MPP_EXPIRED','Challenge expired');
    return challenge;
  }catch(error){throw new EvidenceError('UNSUPPORTED_MPP',error instanceof Error?error.message:'Unsupported challenge');}
}
export function normalizeMppOffer(challenge:MppCharge):PaymentOffer{
  const c=challengeSchema.parse(challenge);return {id:'mpp-offer',chainId:c.request.methodDetails.chainId,scheme:'exact',token:c.request.currency,payee:c.request.recipient,amount:c.request.amount,decimals:c.request.methodDetails.decimals,decimalsSource:'CONFIGURED',quoteHash:commitment('mpp-evm-charge-v1',c)};
}
export function inspectMppCredential(header:string,expected:MppCharge):Json{
  bound(header);const credential=Credential.deserialize(header);
  const c=challengeSchema.parse(credential.challenge);
  if(canonicalize(c)!==canonicalize(challengeSchema.parse(expected)))throw new EvidenceError('MPP_CHANGED','Echoed challenge does not match selected terms');
  const payload=z.object({type:z.literal('authorization'),signature:z.string().regex(/^0x[0-9a-fA-F]{130}$/),from:address,to:address,value:atomic,validAfter:atomic,validBefore:atomic,nonce:hex32}).strict().parse(credential.payload);
  if(payload.to.toLowerCase()!==c.request.recipient.toLowerCase()||payload.value!==c.request.amount)throw new EvidenceError('MPP_AUTHORIZATION','Credential does not match charge recipient/amount');
  return {protocol:'mpp',intent:'charge',method:'evm',quoteHash:normalizeMppOffer(c).quoteHash,payer:payload.from,amount:c.request.amount,credentialRetained:false,signatureStatus:'STRUCTURALLY_CONSISTENT_NOT_CRYPTOGRAPHICALLY_VERIFIED',challengeAuthenticity:'UNVERIFIED_SERVER_HMAC'};
}
export function parseMppReceipt(header:string,expected:MppCharge):Json{
  bound(header);const value=Receipt.deserialize(header);
  const receipt=z.object({method:z.literal('evm'),reference:hex32,status:z.literal('success'),timestamp:z.iso.datetime()}).strict().parse(value);
  challengeSchema.parse(expected);
  return {protocol:'mpp',method:receipt.method,reference:receipt.reference,status:receipt.status,timestamp:receipt.timestamp,chainId:expected.request.methodDetails.chainId,financialStatus:'SUBMITTED',quality:'APP_REPORTED',deliveryStatus:'UNKNOWN',recommendation:'RECONCILE_FIRST'};
}
export {Challenge,Receipt};
