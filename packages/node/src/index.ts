import {DatabaseSync} from 'node:sqlite';
import {initialAttempt,appendJournal,attemptKey,validateJournal,canonicalize,safeHttpMetadata,createBundle,appendEvent,type AttemptJournal,type AttemptIdentity,type AttemptRecord,type FinancialStatus,type EvidenceBundle,type Json,EvidenceError} from '@echoframe/core';
import {parseX402Challenge,normalizeX402Offer,headerValue} from '@echoframe/x402';
export {PaymentRecorder,type PaymentRecorderOptions,type JsonCapture} from './payment-recorder.js';
export {runRecorderSelfTest,startLocalMerchantSimulation,syntheticLocalCredential} from './self-test.js';

export class SqliteAttemptJournal implements AttemptJournal{
  private readonly db:DatabaseSync;
  constructor(path:string){
    this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, identity TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (attempt_key TEXT NOT NULL REFERENCES attempts(key), sequence INTEGER NOT NULL, state TEXT NOT NULL, at TEXT NOT NULL, evidence_hash TEXT, PRIMARY KEY(attempt_key,sequence));
      CREATE UNIQUE INDEX IF NOT EXISTS one_settlement_attribution ON events(evidence_hash) WHERE state='SETTLED' AND evidence_hash IS NOT NULL;
      CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'append only'); END;
      CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'append only'); END;
      CREATE TRIGGER IF NOT EXISTS attempts_no_update BEFORE UPDATE ON attempts BEGIN SELECT RAISE(ABORT,'immutable identity'); END;
      CREATE TRIGGER IF NOT EXISTS attempts_no_delete BEFORE DELETE ON attempts BEGIN SELECT RAISE(ABORT,'immutable identity'); END;`);
  }
  close():void{this.db.close();}
  private load(key:string):AttemptRecord|undefined{
    const identity=this.db.prepare('SELECT identity FROM attempts WHERE key=?').get(key) as {identity:string}|undefined;if(!identity)return undefined;
    const rows=this.db.prepare('SELECT sequence,state,at,evidence_hash FROM events WHERE attempt_key=? ORDER BY sequence').all(key) as unknown as Array<{sequence:number;state:FinancialStatus;at:string;evidence_hash:string|null}>;
    const record:AttemptRecord={key,identity:JSON.parse(identity.identity) as AttemptIdentity,events:rows.map(r=>({sequence:r.sequence,state:r.state,at:r.at,evidenceHash:r.evidence_hash}))};
    if(!validateJournal(record))throw new EvidenceError('JOURNAL_INTEGRITY','Stored journal is invalid');return record;
  }
  async create(identity:AttemptIdentity,at=new Date().toISOString()):Promise<AttemptRecord>{
    const record=initialAttempt(identity,at);this.db.exec('BEGIN IMMEDIATE');
    try{
      const existing=this.load(record.key);if(existing){this.db.exec('COMMIT');return existing;}
      this.db.prepare('INSERT INTO attempts(key,identity) VALUES (?,?)').run(record.key,canonicalize(record.identity));
      this.db.prepare('INSERT INTO events VALUES (?,?,?,?,?)').run(record.key,0,'NOT_INITIATED',at,null);this.db.exec('COMMIT');return record;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  async append(key:string,state:FinancialStatus,evidenceHash:string|null=null,at=new Date().toISOString()):Promise<AttemptRecord>{
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const record=this.load(key);if(!record)throw new EvidenceError('ATTEMPT','Unknown attempt');const next=appendJournal(record,state,at,evidenceHash);
      if(next.events.length>record.events.length){const event=next.events.at(-1)!;this.db.prepare('INSERT INTO events VALUES (?,?,?,?,?)').run(key,event.sequence,event.state,event.at,event.evidenceHash);}
      this.db.exec('COMMIT');return next;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  async get(key:string):Promise<AttemptRecord|undefined>{return this.load(key);}
  async list():Promise<AttemptRecord[]>{return (this.db.prepare('SELECT key FROM attempts ORDER BY key').all() as Array<{key:string}>).map(r=>this.load(r.key)!);}
}
export interface RecorderRequest{method?:string;url?:string;headers:Record<string,string|string[]|undefined>;}
export interface RecorderResponse{statusCode:number;getHeaders():Record<string,string|string[]|number|undefined>;on(event:'finish',listener:()=>void):unknown;}
/** Express-compatible non-signing recorder. The callback receives only boundary-redacted metadata. */
export function recorderMiddleware(onBundle:(bundle:EvidenceBundle)=>void,onError:(error:Error)=>void=()=>{},options:{chainId?:42220|11142220;environment?:EvidenceBundle['environment']}={}): (request:RecorderRequest,response:RecorderResponse,next:()=>void)=>void{
  return (request,response,next)=>{
    const id=crypto.randomUUID();let bundle=createBundle({title:'Recorded HTTP exchange',protocolKind:'x402',chainId:options.chainId??11142220,environment:options.environment??(options.chainId===42220?'MAINNET':'TESTNET')});
    bundle=appendEvent(bundle,'http.request',safeHttpMetadata({method:request.method??'UNKNOWN',requestId:id,url:request.url??'',headers:Object.fromEntries(Object.entries(request.headers).filter((p):p is [string,string]=>typeof p[1]==='string'))}));
    response.on('finish',()=>{
      try{
        bundle=appendEvent(bundle,'http.response',safeHttpMetadata({method:request.method??'UNKNOWN',requestId:id,status:response.statusCode}));
        const headers=response.getHeaders();const normalized=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k,typeof v==='number'?String(v):v]));
        const challenge=headerValue(normalized,'PAYMENT-REQUIRED');
        if(challenge){
          const parsed=parseX402Challenge(challenge),offers=parsed.accepts.map((q,i)=>normalizeX402Offer(q,`offer-${i}`)),chains=new Set(offers.map(o=>o.chainId));
          if(chains.size>1&&options.chainId===undefined)throw new EvidenceError('MULTI_CHAIN','Configure the chain to record when a challenge offers multiple chains');
          const selectedChain=options.chainId??offers[0]!.chainId,selected=offers.filter(o=>o.chainId===selectedChain);
          if(!selected.length)throw new EvidenceError('CHAIN_MISMATCH','No challenge offer matches the configured recording chain');
          bundle={...bundle,chainId:selectedChain,environment:options.environment??(selectedChain===42220?'MAINNET':'TESTNET'),paymentOffers:selected};bundle=appendEvent(bundle,'x402.challenge',{offerCount:offers.length,selectedOfferCount:selected.length});
        }
        onBundle(bundle);
      }catch(e){onError(e instanceof Error?e:new Error(String(e)));}
    });next();
  };
}
export function recordHonoExchange(request:Request,response:Response):EvidenceBundle{
  let bundle=createBundle({title:'Recorded Hono exchange',protocolKind:'mpp',environment:'TESTNET'});
  const requestId=crypto.randomUUID();bundle=appendEvent(bundle,'http.request',safeHttpMetadata({method:request.method,requestId,url:request.url}));
  return appendEvent(bundle,'http.response',safeHttpMetadata({method:request.method,requestId,status:response.status}));
}
export function journalSummary(record:AttemptRecord):Json{return {key:attemptKey(record.identity),state:record.events.at(-1)!.state,eventCount:record.events.length};}
