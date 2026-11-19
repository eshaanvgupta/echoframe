import {DatabaseSync} from 'node:sqlite';
import {bundleSchema,bundleRoot,canonicalize,parseJson,utf8,EvidenceError,type EvidenceBundle} from '@echoframe/core';

/** Private local recorder state. Only normalized metadata or explicit allowlisted outcome inputs enter it. */
export class RecorderStore{
  private readonly db:DatabaseSync;
  constructor(path:string){
    this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS recordings(context_key TEXT PRIMARY KEY,bundle TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS authorization_references(fingerprint TEXT PRIMARY KEY,context_key TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS auth_reference_immutable BEFORE UPDATE ON authorization_references BEGIN SELECT RAISE(ABORT,'immutable authorization reference'); END;`);
  }
  close():void{this.db.close();}
  get(contextKey:string):EvidenceBundle|undefined{
    const row=this.db.prepare('SELECT bundle FROM recordings WHERE context_key=?').get(contextKey) as {bundle:string}|undefined;if(!row)return undefined;
    const bundle=bundleSchema.parse(parseJson(row.bundle));if(bundle.rootHash!==bundleRoot(bundle))throw new EvidenceError('RECORDER_INTEGRITY','Stored recording commitment does not match');return bundle;
  }
  mutate(contextKey:string,initial:()=>EvidenceBundle,change:(bundle:EvidenceBundle)=>EvidenceBundle):EvidenceBundle{
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const current=this.get(contextKey),next=change(current??initial());
      if(current&&canonicalize(next.events.slice(0,current.events.length))!==canonicalize(current.events))throw new EvidenceError('RECORDER_HISTORY','Existing recorder events cannot be rewritten');
      if(next.rootHash!==bundleRoot(next)||utf8(canonicalize(next)).length>8_000_000)throw new EvidenceError('RECORDER_LIMIT','Recording is invalid or exceeds the portable 8MB limit');
      this.db.prepare('INSERT INTO recordings VALUES (?,?) ON CONFLICT(context_key) DO UPDATE SET bundle=excluded.bundle').run(contextKey,canonicalize(next));this.db.exec('COMMIT');return next;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  registerAuthorization(fingerprint:string,contextKey:string):'NEW'|'SAME_REQUEST'|'OTHER_REQUEST'{
    this.db.exec('BEGIN IMMEDIATE');
    try{const row=this.db.prepare('SELECT context_key FROM authorization_references WHERE fingerprint=?').get(fingerprint) as {context_key:string}|undefined;
      if(!row)this.db.prepare('INSERT INTO authorization_references VALUES (?,?)').run(fingerprint,contextKey);this.db.exec('COMMIT');return row?(row.context_key===contextKey?'SAME_REQUEST':'OTHER_REQUEST'):'NEW';
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  list():Array<{contextKey:string;bundle:EvidenceBundle}>{return (this.db.prepare('SELECT context_key FROM recordings ORDER BY context_key LIMIT 1000').all() as Array<{context_key:string}>).map(row=>({contextKey:row.context_key,bundle:this.get(row.context_key)!}));}
}
