import {describe,it,expect} from 'vitest';
import fc from 'fast-check';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteAttemptJournal} from '../packages/node/src/index.js';
import {attemptKey,initialAttempt,appendJournal,validateJournal,shouldRetry,scenarios,runScenario,fixAndRerun,scenarioBundle,verifyBundle,type FinancialStatus} from '../packages/core/src/index.js';
import {identity,NOW,TX} from './fixtures.js';
describe('persistent append-only attempts',()=>{
  it('is idempotent under concurrent creation',async()=>{const journal=new SqliteAttemptJournal(':memory:');try{const records=await Promise.all(Array.from({length:20},()=>journal.create(identity,NOW)));expect(new Set(records.map(r=>r.key)).size).toBe(1);expect(await journal.list()).toHaveLength(1);}finally{journal.close();}});
  it('preserves unknown across actual SQLite close/reopen',async()=>{const dir=await mkdtemp(join(tmpdir(),'echoframe-test-'));let journal:SqliteAttemptJournal|undefined;try{const path=join(dir,'journal.sqlite');journal=new SqliteAttemptJournal(path);const a=await journal.create(identity,NOW);await journal.append(a.key,'AUTHORIZED',null,NOW);await journal.append(a.key,'SUBMITTED',null,NOW);await journal.append(a.key,'UNKNOWN',null,NOW);journal.close();journal=new SqliteAttemptJournal(path);expect(shouldRetry((await journal.get(a.key))!.events.at(-1)!.state)).toBe('RECONCILE_FIRST');expect((await journal.create(identity,NOW)).events).toHaveLength(4);}finally{journal?.close();await rm(dir,{recursive:true,force:true});}});
  it('requires evidence for a terminal financial observation',async()=>{const journal=new SqliteAttemptJournal(':memory:');try{const a=await journal.create(identity,NOW);await journal.append(a.key,'AUTHORIZED',null,NOW);await journal.append(a.key,'SUBMITTED',null,NOW);await expect(journal.append(a.key,'SETTLED',null,NOW)).rejects.toThrow('EVIDENCE');}finally{journal.close();}});
  it('enforces unique settlement attribution across attempts',async()=>{const journal=new SqliteAttemptJournal(':memory:');try{for(const i of [identity,{...identity,requestId:'second'}]){const a=await journal.create(i,NOW);await journal.append(a.key,'AUTHORIZED',null,NOW);await journal.append(a.key,'SUBMITTED',null,NOW);}await journal.append(attemptKey(identity),'SETTLED',TX,NOW);await expect(journal.append(attemptKey({...identity,requestId:'second'}),'SETTLED',TX,NOW)).rejects.toThrow();}finally{journal.close();}});
  it('makes repeated state writes idempotent',async()=>{const journal=new SqliteAttemptJournal(':memory:');try{const a=await journal.create(identity,NOW);await journal.append(a.key,'AUTHORIZED',null,NOW);await journal.append(a.key,'AUTHORIZED',null,NOW);expect((await journal.get(a.key))!.events).toHaveLength(2);}finally{journal.close();}});
  it.each(['UNKNOWN','PENDING','SUBMITTED']as const)('always reconciles %s before a retry',state=>expect(shouldRetry(state)).toBe('RECONCILE_FIRST'));
  it('rejects backward timestamps',()=>expect(()=>appendJournal(initialAttempt(identity,NOW),'AUTHORIZED','2025-01-01T00:00:00.000Z')).toThrow('TIME'));
});
describe('seeded adversarial simulation',()=>{
  it.each(scenarios.map(s=>[s.id]))('replays %s, patches its invariant and preserves seed',id=>{const before=runScenario(id!,42220);const fixed=fixAndRerun(before);expect(fixed.seed).toBe(before.seed);expect(fixed.assertions.failed).toBe(0);expect(fixed.resultHash).toBe(runScenario(id!,42220,'honest').resultHash);if(id!=='valid')expect(before.assertions.failed).toBeGreaterThan(0);});
  it.each(scenarios.map(s=>[s.id]))('exports verifiable trace for %s',async id=>expect((await verifyBundle(await scenarioBundle(id!))).integrity).toBe('VALID'));
  it('uses different seeded event timing while remaining reproducible',()=>{const a=runScenario('response-lost',1),b=runScenario('response-lost',2);expect(a.resultHash).not.toBe(b.resultHash);expect(runScenario('response-lost',1)).toEqual(a);});
  it('keeps ambiguous result unknown in the safe branch',()=>expect(runScenario('ambiguous-failure',1,'honest')).toMatchObject({financialStatus:'UNKNOWN',authorizations:1}));
  it('does not claim that expiry cancels a submitted payment',()=>expect(runScenario('mandate-expiry',1,'honest').financialStatus).toBe('PENDING'));
  it('blocks fresh authorization after response loss',()=>expect(runScenario('response-lost',1,'honest').authorizations).toBe(1));
});
describe('fixed-seed state-machine properties',()=>{
  it('checks 2500 generated action sequences: immutable history, legal transitions and no false settlement',()=>{
    let generatedTransitions=0;
    const states:FinancialStatus[]=['NOT_INITIATED','AUTHORIZED','SUBMITTED','PENDING','UNKNOWN','SETTLED','REVERTED','REFUNDED','FAILED'];
    fc.assert(fc.property(fc.array(fc.record({state:fc.constantFrom(...states),evidence:fc.boolean()}),{minLength:8,maxLength:40}),actions=>{
      let record=initialAttempt(identity,NOW);
      for(const [index,action]of actions.entries()){
        generatedTransitions++;const previous=JSON.stringify(record.events),last=record.events.at(-1)!.state;
        let next:typeof record|undefined;
        try{next=appendJournal(record,action.state,new Date(Date.parse(NOW)+index+1).toISOString(),action.evidence?TX:null);}catch{expect(JSON.stringify(record.events)).toBe(previous);}
        if(next){
          expect(validateJournal(next)).toBe(true);expect(JSON.stringify(next.events.slice(0,record.events.length))).toBe(previous);
          if(next.events.length>record.events.length&&['SETTLED','REVERTED','REFUNDED'].includes(action.state))expect(action.evidence).toBe(true);
          if(['REVERTED','REFUNDED','FAILED'].includes(last))expect(next.events.length).toBe(record.events.length);
          record=next;
        }
        if(['SUBMITTED','PENDING','UNKNOWN'].includes(record.events.at(-1)!.state))expect(shouldRetry(record.events.at(-1)!.state)).toBe('RECONCILE_FIRST');
      }
    }),{seed:42220,numRuns:2500});expect(generatedTransitions).toBeGreaterThan(2000);
  });
  it('idempotency keys distinguish identities',()=>{fc.assert(fc.property(fc.string({minLength:1,maxLength:50}).filter(s=>s!==identity.requestId),requestId=>{expect(attemptKey({...identity,requestId})).not.toBe(attemptKey(identity));}),{seed:8183,numRuns:2000});});
});
