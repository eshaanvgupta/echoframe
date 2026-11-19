import {DatabaseSync} from 'node:sqlite';
import {EvidenceError,parseJson,canonicalize,type Json} from '@echoframe/core';
/** A single durable submission gate, consumed before any credential reaches the payment middleware. */
export class PurchaseSession{
  private readonly db:DatabaseSync;
  constructor(path:string,readonly termsHash:string){this.db=new DatabaseSync(path);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS purchase(id INTEGER PRIMARY KEY CHECK(id=1),terms_hash TEXT NOT NULL,state TEXT NOT NULL,details TEXT NOT NULL);');this.db.prepare("INSERT OR IGNORE INTO purchase VALUES (1,?,'PREPARED','{}')").run(termsHash);if(this.read().termsHash!==termsHash){this.db.close();throw new EvidenceError('TERMS_CHANGED','Existing purchase uses different terms; preserve it and review before starting another session');}}
  read():{termsHash:string;state:string;details:Json}{const row=this.db.prepare('SELECT terms_hash,state,details FROM purchase WHERE id=1').get() as {terms_hash:string;state:string;details:string};return {termsHash:row.terms_hash,state:row.state,details:parseJson(row.details)};}
  approve(hash:string):void{if(hash!==this.termsHash)throw new EvidenceError('CONSENT','Reviewed terms changed');if(this.db.prepare("UPDATE purchase SET state='APPROVED_ONCE' WHERE id=1 AND state='PREPARED'").run().changes!==1)throw new EvidenceError('ONE_PURCHASE','An existing attempt must be reconciled; another submission is forbidden');}
  consume():void{if(this.db.prepare("UPDATE purchase SET state='SUBMISSION_STARTED' WHERE id=1 AND state='APPROVED_ONCE'").run().changes!==1)throw new EvidenceError('ONE_PURCHASE','Explicit approval for one submission is required');}
  reserveSettlement():void{if(this.db.prepare("UPDATE purchase SET state='SETTLEMENT_CALLED' WHERE id=1 AND state='SUBMISSION_STARTED'").run().changes!==1)throw new EvidenceError('ONE_SETTLEMENT','A settlement is not authorized in the current state');}
  record(state:'RESPONSE_OBSERVED'|'UNKNOWN'|'VERIFIED',details:Json):void{this.db.prepare('UPDATE purchase SET state=?,details=? WHERE id=1').run(state,canonicalize(details));}
  close():void{this.db.close();}
}
