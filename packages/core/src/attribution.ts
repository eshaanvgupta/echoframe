import {z} from 'zod';
import {address,atomic,chain,hex32} from './types.js';
import {commitment} from './crypto.js';

export const paymentExpectationsSchema=z.object({
  chainId:chain.optional(),transactionHash:hex32.optional(),asset:address.optional(),sender:address.optional(),recipient:address.optional(),amount:atomic.optional(),decimals:z.number().int().min(0).max(36).optional()
}).strict();
export type PaymentExpectations=z.infer<typeof paymentExpectationsSchema>;
export type ExpectationTrust='NOT_PROVIDED'|'APPLICATION_CONFIGURED'|'USER_CONFIRMED'|'IMPORTED_UNTRUSTED';
export type TokenBehavior='UNVERIFIED'|'CONFIGURED_ERC20';
export function settlementAttributionKey(chainId:number,transactionHash:string,logIndex:number):string{
  chain.parse(chainId);hex32.parse(transactionHash);z.number().int().nonnegative().safe().parse(logIndex);
  return commitment('settlement-attribution-v1',{chainId,transactionHash,logIndex});
}
export interface ObservedTransfer{token:string;from:string;to:string;amount:string;logIndex:number;transactionHash:string;blockHash:string;}
export interface PaymentAttribution{
  status:'MATCHED'|'MISMATCHED'|'MISSING_EXPECTATIONS'|'UNTRUSTED_EXPECTATIONS'|'LOG_SELECTION_REQUIRED'|'TOKEN_BEHAVIOR_UNVERIFIED'|'PENDING'|'CONTRADICTED'|'UNAVAILABLE';
  trust:ExpectationTrust;tokenBehavior:TokenBehavior;missingEvidence:string[];matchedFields:string[];mismatchedFields:string[];
}
/** Pure attribution check. A successful execution/log is not a purchase without complete external expectations. */
export function assessPaymentAttribution(input:{chainId:number;transactionHash:string;execution:'SUCCESS'|'REVERTED'|'PENDING'|'UNKNOWN';transfers:readonly ObservedTransfer[];selectedLogIndex?:number;expected?:PaymentExpectations;trust?:ExpectationTrust;tokenBehavior?:TokenBehavior;contradicted?:boolean}):PaymentAttribution{
  const expected=paymentExpectationsSchema.parse(input.expected??{}),trust=input.trust??'NOT_PROVIDED',tokenBehavior=input.tokenBehavior??'UNVERIFIED';
  const result:PaymentAttribution={status:'UNAVAILABLE',trust,tokenBehavior,missingEvidence:[],matchedFields:[],mismatchedFields:[]};
  for(const key of ['chainId','transactionHash','asset','sender','recipient','amount']as const)if(expected[key]===undefined)result.missingEvidence.push(`expected.${key}`);
  if(input.selectedLogIndex===undefined)result.missingEvidence.push('selectedLogIndex');
  if(!['APPLICATION_CONFIGURED','USER_CONFIRMED'].includes(trust))result.missingEvidence.push('trusted payment expectations');
  if(tokenBehavior!=='CONFIGURED_ERC20')result.missingEvidence.push('application-confirmed ERC-20 token semantics');
  if(input.contradicted){result.status='CONTRADICTED';result.missingEvidence.push('consistent RPC observations');return result;}
  if(input.execution==='PENDING'){result.status='PENDING';result.missingEvidence.push('successful containing receipt');return result;}
  if(input.execution!=='SUCCESS'){result.missingEvidence.push('successful transaction execution');return result;}
  const selected=input.transfers.find(t=>t.logIndex===input.selectedLogIndex);
  const compare=(key:string,a:unknown,b:unknown)=>{if(a!==undefined)(a===b?result.matchedFields:result.mismatchedFields).push(key);};
  compare('chainId',expected.chainId,input.chainId);compare('transactionHash',expected.transactionHash,input.transactionHash);
  if(selected){compare('asset',expected.asset?.toLowerCase(),selected.token.toLowerCase());compare('sender',expected.sender?.toLowerCase(),selected.from.toLowerCase());compare('recipient',expected.recipient?.toLowerCase(),selected.to.toLowerCase());compare('amount',expected.amount,selected.amount);compare('transactionContext',input.transactionHash,selected.transactionHash);}
  if(result.mismatchedFields.length){result.status='MISMATCHED';return result;}
  if(result.missingEvidence.some(s=>s.startsWith('expected.'))){result.status='MISSING_EXPECTATIONS';return result;}
  if(input.selectedLogIndex===undefined||!selected){result.status='LOG_SELECTION_REQUIRED';if(!selected)result.missingEvidence.push('selected Transfer log in the containing receipt');return result;}
  if(!['APPLICATION_CONFIGURED','USER_CONFIRMED'].includes(trust)){result.status='UNTRUSTED_EXPECTATIONS';return result;}
  if(tokenBehavior!=='CONFIGURED_ERC20'){result.status='TOKEN_BEHAVIOR_UNVERIFIED';return result;}
  result.status='MATCHED';return result;
}
