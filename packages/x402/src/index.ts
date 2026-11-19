import {z} from 'zod';
import {decodePaymentRequiredHeader,decodePaymentSignatureHeader,decodePaymentResponseHeader} from '@x402/core/http';
import {address,atomic,hex32,commitment,canonicalize,decodeBase64,parseJson,EvidenceError,type Json,type PaymentOffer} from '@echoframe/core';

const network=z.enum(['eip155:42220','eip155:11142220']);
export const requirementsSchema=z.object({scheme:z.literal('exact'),network,amount:atomic,asset:address,payTo:address,maxTimeoutSeconds:z.number().int().positive().max(86400),extra:z.object({name:z.string().min(1).max(100),version:z.string().min(1).max(20),assetTransferMethod:z.literal('eip3009').optional(),paymentFlow:z.literal('authorization').optional()}).strict()}).strict();
export type X402Requirements=z.infer<typeof requirementsSchema>;
const resource=z.object({url:z.url().max(2048),description:z.string().max(1000).optional(),mimeType:z.string().max(100).optional()}).strict();
const challengeSchema=z.object({x402Version:z.literal(2),resource,accepts:z.array(requirementsSchema).min(1).max(10),error:z.string().max(500).optional(),extensions:z.record(z.string(),z.unknown()).optional()}).strict();
const authorizationSchema=z.object({from:address,to:address,value:atomic,validAfter:atomic,validBefore:atomic,nonce:hex32}).strict();
const signatureSchema=z.object({x402Version:z.literal(2),accepted:requirementsSchema,payload:z.object({signature:z.string().regex(/^0x[0-9a-fA-F]{130}$/),authorization:authorizationSchema}).strict(),resource:resource.optional(),extensions:z.record(z.string(),z.unknown()).optional()}).strict();
const settlementSchema=z.object({success:z.boolean(),transaction:z.string().max(66),network,payer:address.optional(),amount:atomic.optional(),errorReason:z.string().max(100).optional(),errorMessage:z.string().max(500).optional(),extensions:z.record(z.string(),z.unknown()).optional()}).strict();
function bounded(header:string|undefined):string{
  if(!header)throw new EvidenceError('UNSUPPORTED_X402','Canonical v2 header is required; no body/legacy fallback');
  parseJson(new TextDecoder('utf-8',{fatal:true}).decode(decodeBase64(header,32768)),32768);return header;
}
function noExtensions(value:{extensions?:Record<string,unknown>|undefined}):void{
  if(value.extensions&&Object.keys(value.extensions).length)throw new EvidenceError('UNSUPPORTED_X402','Extensions require an explicitly supported profile');
}
export function parseX402Challenge(header:string|undefined):z.infer<typeof challengeSchema>{
  try{const value=challengeSchema.parse(decodePaymentRequiredHeader(bounded(header)));noExtensions(value);return value;}
  catch(e){throw new EvidenceError('UNSUPPORTED_X402',e instanceof Error?e.message:'Invalid v2 challenge');}
}
export function quoteCommitment(requirements:X402Requirements):string{return commitment('x402-quote-v2',requirementsSchema.parse(requirements));}
export function normalizeX402Offer(requirements:X402Requirements,id='offer-0'):PaymentOffer{
  const q=requirementsSchema.parse(requirements);return {id,chainId:Number(q.network.split(':')[1]) as 42220|11142220,scheme:'exact',token:q.asset,payee:q.payTo,amount:q.amount,decimalsSource:'NOT_PROVIDED',quoteHash:quoteCommitment(q)};
}
/** Transient credential normalization; never exposes signature or nonce in its return value. */
export function readX402CredentialMetadata(header:string){
  const value=signatureSchema.parse(decodePaymentSignatureHeader(bounded(header)));noExtensions(value);
  const auth=value.payload.authorization;
  return {requirements:value.accepted,offer:normalizeX402Offer(value.accepted),payer:auth.from.toLowerCase(),payee:auth.to.toLowerCase(),amount:auth.value,validAfter:auth.validAfter,validBefore:auth.validBefore,authorizationFingerprint:commitment('eip3009-reference-v1',{chain:value.accepted.network,token:value.accepted.asset.toLowerCase(),payer:auth.from.toLowerCase(),nonce:auth.nonce})};
}
/** Consumes credential transiently. The return value contains no replayable signature/nonce. */
export function inspectX402Signature(header:string|undefined,selected:X402Requirements,options:{nowSeconds?:number;expectedPayer?:string;expectedResourceUrl?:string}={}):Json{
  let value:z.infer<typeof signatureSchema>;
  try{value=signatureSchema.parse(decodePaymentSignatureHeader(bounded(header)));noExtensions(value);}catch(e){throw new EvidenceError('UNSUPPORTED_X402',e instanceof Error?e.message:'Invalid credential');}
  const expected=requirementsSchema.parse(selected),auth=value.payload.authorization;
  if(canonicalize(value.accepted)!==canonicalize(expected))throw new EvidenceError('QUOTE_CHANGED','Accepted requirements differ from the selected offer');
  if(auth.to.toLowerCase()!==expected.payTo.toLowerCase()||auth.value!==expected.amount)throw new EvidenceError('AUTHORIZATION_MISMATCH','Authorization recipient or amount differs from offer');
  if(options.expectedPayer&&auth.from.toLowerCase()!==address.parse(options.expectedPayer).toLowerCase())throw new EvidenceError('PAYER','Unexpected authorization payer');
  const now=BigInt(Math.floor(options.nowSeconds??Date.now()/1000));
  // Official ExactEvmScheme uses validAfter=0 and expires at signing time + maxTimeoutSeconds.
  // Bound remaining validity, not the interval since the epoch.
  if(BigInt(auth.validAfter)>=now||BigInt(auth.validBefore)<=now||BigInt(auth.validBefore)-now>BigInt(expected.maxTimeoutSeconds))throw new EvidenceError('AUTH_WINDOW','Authorization is expired, premature or has more remaining validity than the quoted timeout');
  if(options.expectedResourceUrl&&value.resource?.url!==options.expectedResourceUrl)throw new EvidenceError('RESOURCE','Resource context changed');
  return {protocol:'x402',version:2,quoteHash:quoteCommitment(expected),payer:auth.from.toLowerCase(),payee:auth.to.toLowerCase(),amount:auth.value,network:expected.network,signatureStatus:'STRUCTURALLY_CONSISTENT_NOT_CRYPTOGRAPHICALLY_VERIFIED',credentialRetained:false,warning:'EIP-3009 does not intrinsically bind arbitrary request IDs; local journal attribution is separate.'};
}
export function parseX402Settlement(header:string|undefined,selected:Pick<X402Requirements,'network'|'amount'>):Json{
  const value=settlementSchema.parse(decodePaymentResponseHeader(bounded(header)));noExtensions(value);
  if(value.network!==selected.network||value.amount!==undefined&&value.amount!==selected.amount)throw new EvidenceError('SETTLEMENT_MISMATCH','Settlement network or amount differs from quote');
  if(value.transaction&&!hex32.safeParse(value.transaction).success)throw new EvidenceError('TRANSACTION','Invalid transaction reference');
  if((value.success||value.errorReason==='settlement_pending')&&!value.transaction)throw new EvidenceError('TRANSACTION','Success/pending requires a transaction hash');
  return {protocol:'x402',network:value.network,transaction:value.transaction||null,success:value.success,financialStatus:value.errorReason==='settlement_pending'?'PENDING':value.success?'SUBMITTED':'UNKNOWN',quality:'APP_REPORTED',errorReason:value.errorReason??null,recommendation:'RECONCILE_FIRST',deliveryStatus:'UNKNOWN'};
}
export function headerValue(headers:Headers|Record<string,string|string[]|undefined>,name:string):string|undefined{
  if(headers instanceof Headers)return headers.get(name)??undefined;
  const values=Object.entries(headers).filter(([key])=>key.toLowerCase()===name.toLowerCase());
  if(values.length>1||Array.isArray(values[0]?.[1]))throw new EvidenceError('HEADER','Duplicate payment header');return values[0]?.[1] as string|undefined;
}
export function instrumentFetch(fetcher:typeof fetch,onObservation:(event:{type:string;data:Json})=>void):typeof fetch{
  return async(input,init)=>{
    const request=new Request(input,init);const id=commitment('http-request-context',{method:request.method,urlHash:commitment('url',request.url)});
    onObservation({type:'http.request',data:{requestContextHash:id,method:request.method,hasPaymentSignature:request.headers.has('PAYMENT-SIGNATURE')}});
    try{
      const response=await fetcher(request);
      const challenge=headerValue(response.headers,'PAYMENT-REQUIRED');
      if(response.status===402&&challenge){const parsed=parseX402Challenge(challenge);onObservation({type:'x402.challenge',data:{requestContextHash:id,offers:parsed.accepts.map(q=>normalizeX402Offer(q)) as unknown as Json}});}
      onObservation({type:'http.response',data:{requestContextHash:id,status:response.status}});return response;
    }catch(error){onObservation({type:'http.unknown',data:{requestContextHash:id,recommendation:'RECONCILE_FIRST'}});throw error;}
  };
}
