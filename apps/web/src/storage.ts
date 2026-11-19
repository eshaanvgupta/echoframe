import Dexie,{type Table} from 'dexie';
import {initialAttempt,appendJournal,attemptKey,validateJournal,verifyBundle,publicBundle,type AttemptJournal,type AttemptIdentity,type AttemptRecord,type FinancialStatus,type EvidenceBundle,EvidenceError} from '@echoframe/core';

interface SavedBundle{id:string;title:string;savedAt:string;bundle:EvidenceBundle;}
class EvidenceDatabase extends Dexie{
  bundles!:Table<SavedBundle,string>;attempts!:Table<AttemptRecord,string>;
  constructor(){super('echoframe-local-v1');this.version(1).stores({bundles:'id,savedAt',attempts:'key'});}
}
export const db=new EvidenceDatabase();
export async function saveBundle(bundle:EvidenceBundle,complete=false):Promise<void>{
  const safe=complete?bundle:publicBundle(bundle);const report=await verifyBundle(safe);if(report.integrity!=='VALID')throw new EvidenceError('INTEGRITY','Cannot save invalid evidence');
  await db.bundles.put({id:safe.bundleId,title:safe.title,savedAt:new Date().toISOString(),bundle:safe});
}
export class BrowserAttemptJournal implements AttemptJournal{
  async create(identity:AttemptIdentity,at=new Date().toISOString()):Promise<AttemptRecord>{
    const key=attemptKey(identity);return db.transaction('rw',db.attempts,async()=>{const existing=await db.attempts.get(key);if(existing){if(!validateJournal(existing))throw new EvidenceError('JOURNAL_INTEGRITY','Stored journal invalid');return existing;}const record=initialAttempt(identity,at);await db.attempts.add(record);return record;});
  }
  async append(key:string,state:FinancialStatus,evidenceHash:string|null=null,at=new Date().toISOString()):Promise<AttemptRecord>{
    return db.transaction('rw',db.attempts,async()=>{
      const record=await db.attempts.get(key);if(!record||!validateJournal(record))throw new EvidenceError('JOURNAL_INTEGRITY','Missing or invalid attempt');
      const next=appendJournal(record,state,at,evidenceHash);
      if(state==='SETTLED'&&evidenceHash){const all=await db.attempts.toArray();if(all.some(a=>a.key!==key&&a.events.some(e=>e.state==='SETTLED'&&e.evidenceHash===evidenceHash)))throw new EvidenceError('ATTRIBUTION','Settlement already attributed to another attempt');}
      if(next!==record)await db.attempts.put(next);return next;
    });
  }
  async get(key:string):Promise<AttemptRecord|undefined>{const value=await db.attempts.get(key);if(value&&!validateJournal(value))throw new EvidenceError('JOURNAL_INTEGRITY','Invalid journal');return value;}
  async list():Promise<AttemptRecord[]>{const all=await db.attempts.toArray();if(all.some(a=>!validateJournal(a)))throw new EvidenceError('JOURNAL_INTEGRITY','Invalid journal');return all;}
}
export const browserJournal=new BrowserAttemptJournal();
