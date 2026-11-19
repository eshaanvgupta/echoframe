import {commitment,canonicalize} from './crypto.js';
import {chain,address,atomic,hex32,EvidenceError,type FinancialStatus} from './types.js';
import {z} from 'zod';

export const attemptSchema=z.object({chainId:chain,protocol:z.enum(['x402','mpp','erc8183','erc20']),requestId:z.string().min(1).max(200),payer:address,payee:address,token:address,amount:atomic,quoteHash:hex32}).strict();
export type AttemptIdentity=z.infer<typeof attemptSchema>;
export interface JournalEvent{sequence:number;state:FinancialStatus;at:string;evidenceHash:string|null;}
export interface AttemptRecord{key:string;identity:AttemptIdentity;events:JournalEvent[];}
export const attemptKey=(identity:AttemptIdentity):string=>{
  const parsed=attemptSchema.parse(identity);
  return commitment('attempt-journal-v1',{...parsed,payer:parsed.payer.toLowerCase(),payee:parsed.payee.toLowerCase(),token:parsed.token.toLowerCase()});
};
const transitions:Record<FinancialStatus,readonly FinancialStatus[]>={NOT_INITIATED:['AUTHORIZED','FAILED'],AUTHORIZED:['SUBMITTED','FAILED','UNKNOWN'],SUBMITTED:['PENDING','UNKNOWN','SETTLED','REVERTED'],PENDING:['UNKNOWN','SETTLED','REVERTED'],UNKNOWN:['PENDING','SETTLED','REVERTED'],SETTLED:['REFUNDED'],REVERTED:[],REFUNDED:[],FAILED:[]};
export function transition(current:FinancialStatus,next:FinancialStatus,evidenceHash:string|null=null):FinancialStatus {
  if(current===next)return current;
  if(!transitions[current].includes(next))throw new EvidenceError('STATE',`${current} cannot transition to ${next}`);
  if(['SETTLED','REVERTED','REFUNDED'].includes(next)&&!hex32.safeParse(evidenceHash).success)throw new EvidenceError('EVIDENCE','A receipt or reconciliation commitment is required');
  return next;
}
export function shouldRetry(state:FinancialStatus):'SAFE_SAME_AUTH'|'RECONCILE_FIRST'|'MANUAL_REVIEW'|'TERMINAL_FAILURE'{
  if(['SUBMITTED','PENDING','UNKNOWN'].includes(state))return 'RECONCILE_FIRST';
  if(state==='NOT_INITIATED'||state==='AUTHORIZED')return 'SAFE_SAME_AUTH';
  if(state==='FAILED'||state==='REVERTED')return 'TERMINAL_FAILURE';return 'MANUAL_REVIEW';
}
export function initialAttempt(identity:AttemptIdentity,at:string):AttemptRecord{
  if(!z.iso.datetime().safeParse(at).success)throw new EvidenceError('TIME','Invalid event timestamp');
  return {key:attemptKey(identity),identity:attemptSchema.parse(identity),events:[{sequence:0,state:'NOT_INITIATED',at,evidenceHash:null}]};
}
export function appendJournal(record:AttemptRecord,state:FinancialStatus,at:string,evidenceHash:string|null=null):AttemptRecord{
  if(!z.iso.datetime().safeParse(at).success||Date.parse(at)<Date.parse(record.events.at(-1)!.at))throw new EvidenceError('TIME','Journal timestamps must be monotonic');
  const last=record.events.at(-1)!;transition(last.state,state,evidenceHash);
  if(last.state===state)return record;
  return {...record,events:[...record.events,{sequence:record.events.length,state,at,evidenceHash}]};
}
export function validateJournal(record:AttemptRecord):boolean{
  try{
    if(record.key!==attemptKey(record.identity)||!record.events.length||record.events[0]!.state!=='NOT_INITIATED')return false;
    let fresh=initialAttempt(record.identity,record.events[0]!.at);
    for(const event of record.events.slice(1)){if(event.sequence!==fresh.events.length)return false;fresh=appendJournal(fresh,event.state,event.at,event.evidenceHash);}
    return canonicalize(fresh)===canonicalize(record);
  }catch{return false;}
}
export interface AttemptJournal{create(identity:AttemptIdentity,at?:string):Promise<AttemptRecord>;append(key:string,state:FinancialStatus,evidenceHash?:string|null,at?:string):Promise<AttemptRecord>;get(key:string):Promise<AttemptRecord|undefined>;list():Promise<AttemptRecord[]>;}
