import {commitment,canonicalize} from './crypto.js';
import {createBundle,appendEvent,sealBundle} from './bundle.js';
import {createOutcomeProof,outcomeExamples,testSafeSchema,hasResponse,type OutcomeInput} from './outcomes.js';
import {initialAttempt,appendJournal,validateJournal,shouldRetry,type AttemptRecord} from './journal.js';
import {EvidenceError,type Json,type EvidenceBundle,type FinancialStatus} from './types.js';

export type PolicyFlag='commitQuote'|'bindRequest'|'reconcileUnknown'|'requireOutcome'|'matchChain'|'selectTransfer'|'separateEvaluator'|'persistentJournal'|'exactDecimals'|'mandateAtSettlement'|'independentClaims'|'rpcAgreement';
export type ReplayPolicy=Readonly<Record<PolicyFlag,boolean>>;
export const safePolicy:ReplayPolicy=Object.freeze({commitQuote:true,bindRequest:true,reconcileUnknown:true,requireOutcome:true,matchChain:true,selectTransfer:true,separateEvaluator:true,persistentJournal:true,exactDecimals:true,mandateAtSettlement:true,independentClaims:true,rpcAgreement:true});
export interface Scenario{id:string;title:string;summary:string;severity:'baseline'|'high'|'critical';patch:PolicyFlag;patchDescription:string;preconditions:string[];}
const definitions:Array<[string,string,string,Scenario['severity'],PolicyFlag,string]>=[
 ['valid','Settled. Delivered. Checked.','Expected quote, recipient and structured rate response.','baseline','requireOutcome','Require the declared outcome checks.'],
 ['recipient-switch','The recipient switch','Merchant changes payTo after discovery.','critical','commitQuote','Pin the full discovered quote commitment before authorization.'],
 ['price-drift','A price with three extra zeros','Accepted amount changes from 1000 to 1000000 atomic units.','critical','commitQuote','Reject any change to the accepted amount or quote.'],
 ['request-reuse','One signature. Two requests.','An authorization is attributed to a different request.','critical','bindRequest','Bind local attribution to the original request; never reuse it for another request.'],
 ['response-lost','Settled, but the response was lost','Broadcast succeeded; the facilitator response timed out.','critical','reconcileUnknown','UNKNOWN means reconcile first; reuse no fresh authorization.'],
 ['ambiguous-failure','The dangerous pay-again loop','A facilitator error cannot establish whether broadcast occurred.','critical','reconcileUnknown','Retain UNKNOWN and require read-only reconciliation.'],
 ['empty-body','Paid but not delivered','A successful HTTP status conceals an empty response.','high','requireOutcome','Require a non-empty body and validate its structure.'],
 ['hash-schema','The hash matches. The work fails.','The bytes match their hash but contain an invalid market rate.','high','requireOutcome','Run semantic schema bounds after checking integrity.'],
 ['chain-mismatch','Right quote. Wrong chain.','Signing chain differs from the quoted Celo chain.','critical','matchChain','Reject chain mismatch before authorization.'],
 ['multi-transfer','A transfer is not your transfer','A transaction contains an unrelated Transfer before the expected one.','high','selectTransfer','Select one log and match exact token, parties and units.'],
 ['evaluator-only','Completed is an evaluator statement','An ERC-8183 evaluator completes a job without independent work evidence.','high','separateEvaluator','Keep evaluator completion separate from tested delivery.'],
 ['crash-recovery','The crash between attempts','Process restarts after broadcast with an unresolved attempt.','critical','persistentJournal','Reload the append-only journal and reconcile the existing attempt.'],
 ['decimals','The decimal illusion','Display assumes 18 decimals for a 6-decimal asset.','high','exactDecimals','Require an explicit decimals source and preserve integer units.'],
 ['mandate-expiry','Permission expires in flight','Mandate expires between authorization and final observation.','high','mandateAtSettlement','Report EXPIRED and stop automatic continuation; reconcile the existing payment.'],
 ['forged-delivery','A seller says â€œdeliveredâ€','Seller inserts a delivery badge without result evidence.','high','independentClaims','Treat seller claims as APP_REPORTED and leave delivery UNKNOWN.'],
 ['rpc-conflict','Two RPCs. Two stories.','Rate limiting is followed by contradictory receipt observations.','critical','rpcAgreement','Expose disagreement and retain UNKNOWN until manually reconciled.']
];
export const scenarios:readonly Scenario[]=definitions.map(([id,title,summary,severity,patch,patchDescription])=>({id,title,summary,severity,patch,patchDescription,preconditions:['SIMULATED Celo Sepolia; no wallet or network calls','One exact quote: 1000 atomic units, known token and payee','A virtual clock and fixed seed control all fault timing',`Injected condition: ${summary}`]}));
export interface ReplayEvent{index:number;at:number;stage:'INTENT'|'AUTHORITY'|'PAYMENT'|'DELIVERY'|'PROOF';action:string;data:Json;financialStatus:FinancialStatus;}
export interface RunResult{version:'1.0.0';scenarioId:string;seed:number;variant:'honest'|'vulnerable';policy:ReplayPolicy;preconditions:string[];timeline:ReplayEvent[];invariants:Array<{id:string;satisfied:boolean;detail:string}>;missingEvidence:string[];safeNextAction:string;assertions:{passed:number;failed:number};financialStatus:FinancialStatus;deliveryStatus:string;authorizations:number;resultHash:string;}
export function runScenario(id:string,seed=42220,variant:'honest'|'vulnerable'='vulnerable',overrides:Partial<ReplayPolicy>={}):RunResult{
  const scenario=scenarios.find(s=>s.id===id);if(!scenario)throw new EvidenceError('SCENARIO','Unknown scenario');
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new EvidenceError('SEED','Use an unsigned 32-bit integer');
  const policy=Object.freeze({...safePolicy,...(variant==='vulnerable'?{[scenario.patch]:false}:{}),...overrides});
  let random=seed||1,time=0,authorizations=0,deliveryStatus='UNKNOWN';
  const state:{status:FinancialStatus}={status:'NOT_INITIATED'};
  const quote={chainId:11142220,payee:'0x0000000000000000000000000000000000000002',token:'0x0000000000000000000000000000000000000003',amount:'1000'};
  const rateSchema={type:'object',required:['pair','rate','asOf'],additionalProperties:false,properties:{pair:{type:'string'},rate:{type:'number',minimum:0.0001,maximum:1000000},asOf:{type:'string'}}} as Record<string,Json>;
  const returnedBody:Json=id==='empty-body'?'':{pair:'CELO/USD',rate:id==='hash-schema'?-9:0.41,asOf:'2026-01-01T11:59:00.000Z'};
  const actualOutcomePass=hasResponse(returnedBody)&&testSafeSchema(rateSchema,returnedBody);
  const timeline:ReplayEvent[]=[],missingEvidence:string[]=[];
  const push=(stage:ReplayEvent['stage'],action:string,data:Json=null)=>{
    random=(Math.imul(random,1664525)+1013904223)>>>0;time+=10+random%90;
    timeline.push({index:timeline.length,at:time,stage,action,data,financialStatus:state.status});
  };
  let journal:AttemptRecord=initialAttempt({chainId:11142220,protocol:'x402',requestId:'simulation-request-1',payer:'0x0000000000000000000000000000000000000001',payee:quote.payee,token:quote.token,amount:quote.amount,quoteHash:commitment('simulation-quote',quote)},'2026-01-01T00:00:00.000Z');
  const set=(next:FinancialStatus)=>{journal=appendJournal(journal,next,new Date(Date.parse('2026-01-01T00:00:00.000Z')+time).toISOString(),['SETTLED','REVERTED','REFUNDED'].includes(next)?commitment('simulated-receipt',{id,seed}):null);state.status=next;};
  push('INTENT','Discovered exact quote',{chainId:11142220,amount:'1000',quoteCommitment:journal.identity.quoteHash});
  let prevented=false,satisfied=true;
  if(id==='recipient-switch'||id==='price-drift'){
    push('INTENT','Offer changed after discovery',{field:id==='recipient-switch'?'payTo':'amount',original:id==='recipient-switch'?'payee-A':'1000',observed:id==='recipient-switch'?'payee-B':'1000000'});
    const changed={...quote,...(id==='recipient-switch'?{payee:'0x0000000000000000000000000000000000000004'}:{amount:'1000000'})};
    prevented=policy.commitQuote&&commitment('simulation-quote',changed)!==journal.identity.quoteHash;satisfied=prevented;
    push('AUTHORITY',prevented?'Commitment mismatch: authorization blocked':'Changed quote accepted without comparison');
  }
  if(id==='chain-mismatch'){
    prevented=policy.matchChain;satisfied=prevented;
    push('AUTHORITY',prevented?'Chain mismatch: authorization blocked':'Wrong signing chain accepted',{quoted:11142220,signing:42220});
  }
  if(id==='decimals'){
    satisfied=policy.exactDecimals;push('INTENT',policy.exactDecimals?'Preserved units and configured decimals':'Incorrect 18-decimal display accepted',{amount:'1000',actualDecimals:6,display:policy.exactDecimals?'0.001':'0.000000000000001'});
  }
  if(!prevented){set('AUTHORIZED');authorizations++;push('AUTHORITY','Recorded a simulated authorization; no signature produced');set('SUBMITTED');push('PAYMENT','Simulated broadcast',{attemptKey:journal.key});}
  if(['response-lost','ambiguous-failure','crash-recovery'].includes(id)){
    set('UNKNOWN');push('PAYMENT','Response unavailable; broadcast outcome unknown');
    let guarded=policy.reconcileUnknown;
    if(id==='crash-recovery'){
      const recovered=JSON.parse(canonicalize(journal)) as AttemptRecord;
      guarded=policy.persistentJournal&&validateJournal(recovered)&&shouldRetry(recovered.events.at(-1)!.state)==='RECONCILE_FIRST';
      push('PAYMENT',guarded?'Reloaded existing durable attempt':'Restart discarded attempt identity',{recovered:guarded});
    }
    if(guarded)push('PAYMENT','Reconcile first; no fresh authorization',{recommendation:shouldRetry(state.status)});
    else {authorizations++;push('AUTHORITY','Vulnerable policy requested a second authorization',{authorizations});}
    satisfied=authorizations===1;
    if(id==='response-lost'){set('SETTLED');push('PAYMENT','Simulated receipt recovered; same attempt reconciled');}
    else missingEvidence.push('Independent receipt confirming the original broadcast');
  }else if(id==='rpc-conflict'){
    set('UNKNOWN');push('PAYMENT','Simulated 429; bounded retry with virtual backoff',{retryAfterMs:200});
    push('PAYMENT','RPC observations disagree',{primary:'SETTLED',secondary:'REVERTED'});
    if(!policy.rpcAgreement){set('SETTLED');push('PAYMENT','Vulnerable policy trusted first observation');}
    satisfied=state.status==='UNKNOWN';missingEvidence.push('Consistent independent chain observation');
  }else if(id==='mandate-expiry'){
    push('AUTHORITY','Mandate expired before settlement observation');
    if(policy.mandateAtSettlement){set('PENDING');missingEvidence.push('Current valid mandate and final receipt');push('PAYMENT','Existing payment pending; continuation stopped');}else{set('SETTLED');push('PROOF','Vulnerable policy kept authority marked valid');}
    satisfied=policy.mandateAtSettlement;
  }else if(!prevented){set('SETTLED');push('PAYMENT','Simulated successful receipt; not a public chain receipt');}
  if(id==='request-reuse'){
    satisfied=policy.bindRequest;push('AUTHORITY',policy.bindRequest?'Cross-request attribution rejected':'Same authorization attributed to a second request',{originalRequest:'request-1',newRequest:'request-2'});
  }
  if(id==='multi-transfer'){
    satisfied=policy.selectTransfer;push('PAYMENT',policy.selectTransfer?'Selected expected log 7; unrelated log 2 excluded':'Unrelated first Transfer attributed to purchase',{selectedLog:policy.selectTransfer?7:2,totalTransfers:2});
  }
  if(!prevented&&state.status==='SETTLED'){
    if(id==='empty-body'||id==='hash-schema'){
      push('DELIVERY',id==='empty-body'?'HTTP 200 returned zero body bytes':'Content hash matched an invalid negative rate');
      deliveryStatus=policy.requireOutcome?(actualOutcomePass?'TESTED_PASS':'TESTED_FAIL'):'TESTED_PASS';satisfied=(deliveryStatus==='TESTED_PASS')===actualOutcomePass;
      if(id==='empty-body')missingEvidence.push('Non-empty deliverable');
      push('PROOF',policy.requireOutcome?'Outcome validation failed':'Vulnerable policy promoted HTTP/hash to delivery proof');
    }else if(id==='evaluator-only'||id==='forged-delivery'){
      const flag=id==='evaluator-only'?policy.separateEvaluator:policy.independentClaims;
      deliveryStatus=flag?'UNKNOWN':'TESTED_PASS';satisfied=flag;
      push('DELIVERY',id==='evaluator-only'?'Configured evaluator marked job Completed':'Merchant self-reported delivered');
      push('PROOF',flag?'No independent result evidence: delivery UNKNOWN':'Vulnerable policy promoted a claim to proof');missingEvidence.push('Independent deliverable and deterministic outcome checks');
    }else{deliveryStatus=actualOutcomePass?'TESTED_PASS':'TESTED_FAIL';push('DELIVERY','Synthetic structured rate response returned',returnedBody);push('PROOF',actualOutcomePass?'Built-in structure and numeric bounds satisfied':'Built-in structure or numeric bounds failed');}
  }
  if(id==='valid')satisfied=true;
  const invariants=[{id:scenario.patch,satisfied,detail:scenario.patchDescription},{id:'append-only-state',satisfied:validateJournal(journal),detail:'All journal transitions follow the declared state machine'},{id:'no-real-payment',satisfied:true,detail:'The replay engine has no transport, key or wallet dependency'}];
  const result={version:'1.0.0' as const,scenarioId:id,seed,variant,policy,preconditions:scenario.preconditions,timeline,invariants,missingEvidence,safeNextAction:prevented?'Stop and manually inspect the changed quote':state.status==='UNKNOWN'||state.status==='PENDING'?'RECONCILE_FIRST â€” retain original attempt; never sign fresh payment':deliveryStatus==='TESTED_FAIL'?'Retain failed outcome evidence; contact provider manually':deliveryStatus==='UNKNOWN'?'Request independent delivery evidence; no automatic payment':'Export the evidence and reproduce the declared checks',assertions:{passed:invariants.filter(i=>i.satisfied).length,failed:invariants.filter(i=>!i.satisfied).length},financialStatus:state.status,deliveryStatus,authorizations};
  return {...result,resultHash:commitment('replay-result-v1',result)};
}
export function fixAndRerun(run:RunResult):RunResult{
  const scenario=scenarios.find(s=>s.id===run.scenarioId)!;return runScenario(run.scenarioId,run.seed,'honest',{...run.policy,[scenario.patch]:true});
}
export function generateRegression(run:RunResult):string{
  const id=JSON.stringify(run.scenarioId),flag=JSON.stringify(scenarios.find(s=>s.id===run.scenarioId)!.patch);
  return `// Deterministic SIMULATION. No real-world exploit claim.\nimport {describe,it,expect} from 'vitest';\nimport {runScenario,fixAndRerun} from '@echoframe/core';\ndescribe('ECHOFRAME '+${id},()=>{\n  it('reproduces and fixes the same seed',()=>{\n    const before=runScenario(${id},${run.seed},'vulnerable');\n    const after=fixAndRerun(before);\n    expect(after.seed).toBe(before.seed);\n    expect(after.invariants.find(i=>i.id===${flag})?.satisfied).toBe(true);\n    expect(after.assertions.failed).toBe(0);\n    expect(runScenario(${id},${run.seed},'honest').resultHash).toBe(after.resultHash);\n  });\n});\n`;
}
export async function scenarioBundle(id='empty-body',seed=42220):Promise<EvidenceBundle>{
  const run=runScenario(id,seed,'honest');const scenario=scenarios.find(s=>s.id===id)!;
  let bundle=createBundle({title:scenario.title,createdAt:'2026-01-01T00:00:00.000Z',requestContext:{scenarioId:id,seed}});
  for(const event of run.timeline)bundle=appendEvent(bundle,`replay.${event.stage.toLowerCase()}`,{action:event.action,details:event.data},{at:new Date(Date.parse(bundle.createdAt)+event.at).toISOString(),timestampProvenance:'VIRTUAL_CLOCK'});
  bundle=appendEvent(bundle,'financial.observation',{status:run.financialStatus,source:'deterministic simulation'},{timestampProvenance:'VIRTUAL_CLOCK'});
  if(['empty-body','hash-schema','valid'].includes(id)){
    const example=outcomeExamples.rates!;
    const input:OutcomeInput={status:200,body:id==='empty-body'?'':id==='hash-schema'?{pair:'CELO/USD',rate:-9,asOf:'2026-01-01T11:59:00.000Z'}:example.input.body};
    const proof=await createOutcomeProof('outcome-0',bundle.chainId,example.manifest,input);
    bundle=appendEvent(bundle,id==='empty-body'?'delivery.empty':'delivery.returned',{contentHash:proof.result.contentHash},{id:'outcome-0',timestampProvenance:'VIRTUAL_CLOCK'});
    bundle=sealBundle({...bundle,outcomes:[JSON.parse(canonicalize(proof)) as Json]});
  }
  return sealBundle({...bundle,recoveryState:run.financialStatus,claims:[{id:'simulation',statement:'Deterministic local fixture; no public transaction',quality:'TEST_REPRODUCED'}]});
}
