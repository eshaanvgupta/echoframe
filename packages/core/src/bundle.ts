import type {Hex} from 'viem';
import {bundleSchema,type EvidenceBundle,type EvidenceEvent,type Artifact,type Json,type VerificationReport,financial,EvidenceError} from './types.js';
import {canonicalize,commitment,decodeBase64,encodeBase64,sha256,utf8,verifyCommitmentSignature,parseJson} from './crypto.js';
import {verifyOutcomeProof,type OutcomeProof} from './outcomes.js';

export function eventHash(event:Omit<EvidenceEvent,'hash'>):Hex{return commitment('event-v1',event);}
export function bundleRoot(bundle:EvidenceBundle):Hex {
  const {rootHash:_root,signature:_sig,...payload}=bundle;return commitment('bundle-v1',payload);
}
export function sealBundle(bundle:EvidenceBundle):EvidenceBundle {
  const {signature:_signature,...rest}=bundle;
  return bundleSchema.parse({...rest,rootHash:bundleRoot(bundle)});
}
export function createBundle(options:{title:string;chainId?:42220|11142220;protocolKind?:EvidenceBundle['protocolKind'];environment?:EvidenceBundle['environment'];createdAt?:string;requestContext?:Json}):EvidenceBundle {
  const createdAt=options.createdAt??new Date().toISOString(),chainId=options.chainId??11142220;
  const requestContextHash=commitment('request-context-v1',options.requestContext??null);
  const bundle={schemaVersion:'1.0.0',verificationAlgorithm:'echoframe-jcs-keccak-v1',bundleId:commitment('bundle-id-v1',{createdAt,requestContextHash,title:options.title}),chainId,protocolKind:options.protocolKind??'local',environment:options.environment??'SIMULATED',createdAt,observedAt:createdAt,redactionProfile:'boundary-allowlist-v1',title:options.title,claims:[],actors:[],events:[],paymentOffers:[],requestContextHash,facilitatorResponse:null,transactionHashes:[],rpcObservations:[],contentHashes:[],outcomes:[],warnings:[],policyVersion:'1.0.0',recoveryState:'NOT_INITIATED',artifacts:[],rootHash:commitment('empty',null)} as EvidenceBundle;
  return sealBundle(bundle);
}
export function appendEvent(bundle:EvidenceBundle,type:string,data:Json,options:{id?:string;at?:string;timestampProvenance?:EvidenceEvent['timestampProvenance']}={}):EvidenceBundle {
  const base={id:options.id??`event-${bundle.events.length}`,index:bundle.events.length,type,at:options.at??(options.timestampProvenance==='VIRTUAL_CLOCK'?bundle.observedAt:new Date().toISOString()),timestampProvenance:options.timestampProvenance??'LOCAL_CLOCK',data,previousHash:bundle.events.at(-1)?.hash??null};
  if(bundle.events.some(e=>e.id===base.id))throw new EvidenceError('DUPLICATE_EVENT','Event identifiers must be unique');
  return sealBundle({...bundle,events:[...bundle.events,{...base,hash:eventHash(base)}],observedAt:base.at});
}
export async function createArtifact(id:string,mime:string,bytes:Uint8Array):Promise<Artifact>{
  if(bytes.length>2_000_000)throw new EvidenceError('LIMIT','Artifact exceeds 2MB');
  return {id,mime,algorithm:'SHA-256',size:bytes.length,sha256:await sha256(bytes),bytesBase64:encodeBase64(bytes)};
}
export async function verifyBundle(value:unknown,options:{expectedChainId?:number;now?:string}={}):Promise<VerificationReport>{
  const report:VerificationReport={algorithm:'echoframe-jcs-keccak-v1',bundleId:null,integrity:'INVALID',errors:[],warnings:[],authorityStatus:'NOT_PROVIDED',financialStatus:'UNKNOWN',deliveryStatus:'UNKNOWN',environment:'UNKNOWN',claims:[],checks:{passed:0,failed:0},signatureVerified:false};
  const check=(ok:boolean,error:string)=>{if(ok)report.checks.passed++;else{report.checks.failed++;report.errors.push(error);}};
  try{
    if(utf8(canonicalize(value)).length>8_000_000)throw new EvidenceError('LIMIT','Bundle exceeds 8MB');
    const result=bundleSchema.safeParse(value);if(!result.success)throw new EvidenceError('SCHEMA',result.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).slice(0,8).join('; '));
    const bundle=result.data;report.bundleId=bundle.bundleId;report.environment=bundle.environment;
    check(options.expectedChainId===undefined||bundle.chainId===options.expectedChainId,'Unexpected chain ID');
    check(bundle.environment!=='MAINNET'||bundle.chainId===42220,'Mainnet environment has wrong chain');
    check(bundle.environment!=='TESTNET'||bundle.chainId===11142220,'Testnet environment has wrong chain');
    check(bundle.rootHash===bundleRoot(bundle),'Bundle root commitment mismatch');
    check(Date.parse(bundle.createdAt)<=Date.parse(bundle.observedAt),'Bundle observation predates creation');
    const ids=new Set<string>();let previous:Hex|null=null;
    for(const [index,event]of bundle.events.entries()){
      const {hash,...base}=event;
      check(!ids.has(event.id),'Duplicate event ID');ids.add(event.id);
      check(event.index===index,'Event index mismatch');check(event.previousHash===previous,'Broken event hash link');
      check(event.hash===eventHash(base),'Event commitment mismatch');previous=hash as Hex;
      check(Date.parse(event.at)>=Date.parse(bundle.createdAt)&&Date.parse(event.at)<=Date.parse(bundle.observedAt),'Event timestamp is outside bundle observation interval');
      if(index>0)check(Date.parse(event.at)>=Date.parse(bundle.events[index-1]!.at),'Non-monotonic event timestamps');
    }
    const artifactIds=new Set<string>();
    for(const artifact of bundle.artifacts){
      check(!artifactIds.has(artifact.id),'Duplicate artifact ID');artifactIds.add(artifact.id);
      const bytes=decodeBase64(artifact.bytesBase64);check(bytes.length===artifact.size,'Artifact byte length mismatch');check(await sha256(bytes)===artifact.sha256,'Artifact SHA-256 mismatch');
    }
    for(const content of bundle.contentHashes){
      const artifact=bundle.artifacts.find(a=>a.id===content.artifactId);check(!!artifact,'Content commitment references missing artifact');
      if(artifact){check(content.algorithm==='SHA-256'?content.hash===artifact.sha256:content.hash===commitment('artifact-content-v1',Array.from(decodeBase64(artifact.bytesBase64))),'Content commitment mismatch');}
    }
    for(const offer of bundle.paymentOffers){check(offer.chainId===bundle.chainId,'Payment offer chain mismatch');check(offer.decimalsSource==='NOT_PROVIDED'?offer.decimals===undefined:offer.decimals!==undefined,'Decimals/source mismatch');}
    for(const claim of bundle.claims)check(!claim.sourceEventId||ids.has(claim.sourceEventId),'Claim references missing event');
    if(bundle.signature){report.signatureVerified=await verifyCommitmentSignature(bundle.chainId,bundle.rootHash as Hex,bundle.signature.signer as Hex,bundle.signature.value as Hex);check(report.signatureVerified,'Invalid bundle signature');}
    report.authorityStatus=bundle.mandate?(bundle.mandate.revoked?'REVOKED':Date.parse(bundle.mandate.expiresAt)<Date.parse(options.now??bundle.observedAt)?'EXPIRED':'DECLARED'):'NOT_PROVIDED';
    let reproduced=0,failed=0;
    for(const outcome of bundle.outcomes){
      const proof=outcome as unknown as OutcomeProof;const verification=await verifyOutcomeProof(proof);
      check(verification.valid,'Outcome proof invalid: '+verification.errors.join('; '));
      const event=bundle.events.find(e=>e.id===proof.eventId);
      check(!!event&&proof.chainId===bundle.chainId,'Outcome event/chain binding invalid');
      // Presence of content commitment in the event prevents attaching unrelated successful tests.
      const data=event?.data;
      check(!!data&&typeof data==='object'&&!Array.isArray(data)&&data.contentHash===proof.result?.contentHash,'Outcome content is not committed by trace event');
      if(verification.valid){if(proof.result.verdict==='TESTED_PASS')reproduced++;if(proof.result.verdict==='TESTED_FAIL')failed++;}
    }
    report.financialStatus='NOT_INITIATED';
    for(const event of bundle.events){
      if(event.type==='financial.observation'&&event.data&&typeof event.data==='object'&&!Array.isArray(event.data)){
        const state=financial.safeParse(event.data.status);if(state.success)report.financialStatus=state.data;
      }
    }
    const returned=bundle.events.some(e=>e.type==='delivery.returned');
    const empty=bundle.events.some(e=>e.type==='delivery.empty');
    report.deliveryStatus=failed?'TESTED_FAIL':reproduced?'TESTED_PASS':empty?'NOT_DELIVERED':returned?'RETURNED_UNVERIFIED':'UNKNOWN';
    report.claims=bundle.claims.map(claim=>({statement:claim.statement,quality:'APP_REPORTED',reason:`Imported ${claim.quality} label is an assertion; no trust is inherited from its label.`}));
    if(report.signatureVerified)report.claims.push({statement:'Bundle signature verified',quality:'SIGNATURE_VERIFIED',reason:'A key signed this commitment. Signer identity and work quality remain external.'});
    if(reproduced||failed)report.claims.push({statement:`${reproduced+failed} outcome policies independently reproduced`,quality:'TEST_REPRODUCED',reason:'Only the declared deterministic checks were reproduced.'});
    report.warnings=[...bundle.warnings,'Imported RPC records and financial observations are APP_REPORTED until independently re-fetched. RPC agreement is not a light-client proof.','Delivery unverified — no evidence imported',...(bundle.environment==='SIMULATED'?['SIMULATED: no real payment occurred.']:[])];
    if(reproduced||failed)report.warnings=report.warnings.filter(w=>w!=='Delivery unverified — no evidence imported');
    report.integrity=report.errors.length?'INVALID':'VALID';
  }catch(error){report.errors.push(error instanceof Error?error.message:String(error));report.checks.failed++;}
  if(report.errors.length){report.integrity='INVALID';report.authorityStatus='UNKNOWN';report.financialStatus='UNKNOWN';report.deliveryStatus='UNKNOWN';report.claims=[];}
  return report;
}
export async function importBundle(text:string,expectedChainId?:number):Promise<EvidenceBundle>{
  const value=parseJson(text);const report=await verifyBundle(value,expectedChainId===undefined?{}:{expectedChainId});
  if(report.integrity!=='VALID')throw new EvidenceError('INTEGRITY',report.errors.join('; '));return bundleSchema.parse(value);
}
export function publicBundle(bundle:EvidenceBundle):EvidenceBundle {
  const source=bundle.rootHash;
  let output=createBundle({title:'Public evidence manifest',chainId:bundle.chainId,protocolKind:bundle.protocolKind,environment:bundle.environment,createdAt:bundle.createdAt,requestContext:{sourceCommitment:source}});
  for(const event of bundle.events)output=appendEvent(output,event.type,{sourceCommitment:event.hash},{id:event.id,at:event.at,timestampProvenance:event.timestampProvenance});
  return sealBundle({...output,redactionProfile:'public-minimal-v1',warnings:['Public minimal export: bodies, artifacts, claims, identities, outcomes and signatures were withheld. Original source commitment: '+source,'Original evidence must be supplied separately for reproduction.']});
}
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function htmlReport(bundle:EvidenceBundle,report:VerificationReport):string {
  const json=JSON.stringify(bundle,null,2);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>ECHOFRAME evidence report</title><style>body{background:#09101a;color:#f1f4ea;font:17px/1.7 system-ui;max-width:1000px;margin:auto;padding:32px}a{color:#53e7f2}pre{white-space:pre-wrap;overflow-wrap:anywhere;border:2px solid #536074;padding:20px}h1{color:#c6ff4d}</style><h1>ECHOFRAME // EVIDENCE REPORT</h1><h2>${escapeHtml(bundle.title)}</h2><p>${escapeHtml(bundle.environment)} · Integrity ${report.integrity}</p><p>Authority ${report.authorityStatus} · Financial ${report.financialStatus} (recorded observation) · Delivery ${report.deliveryStatus}</p><p>Integrity proves consistency, not authenticity or service quality. Re-run the independent CLI.</p><a download="evidence.echoframe.json" href="data:application/json;base64,${encodeBase64(utf8(json))}">Download complete evidence manifest</a><h2>Verifier output</h2><pre>${escapeHtml(JSON.stringify(report,null,2))}</pre><details><summary>Complete contained evidence</summary><pre>${escapeHtml(json)}</pre></details></html>`;
}
