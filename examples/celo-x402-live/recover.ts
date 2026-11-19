import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import {PaymentRecorder,SqliteAttemptJournal} from '@echoframe/node';
import {canonicalize,EvidenceError,hex32,settlementAttributionKey,verifyBundle} from '@echoframe/core';
import {loadPrivateConfig} from './config.js';
import {PurchaseSession} from './session.js';
import {termsHash,outcomePolicy,CHAIN_ID,TOKEN,AMOUNT,FACILITATOR} from './public.js';
import {restrictedFetch} from './network-guard.js';
import {readCredits} from './server.js';
import {finalizeEvidence} from './evidence.js';

/** Explicit read-only recovery. No signer, payment credential, approve or settlement method is called. */
async function recover(){
  const config=loadPrivateConfig(),session=new PurchaseSession(join(config.directory,'purchase.sqlite'),termsHash(config.terms));
  const journal=new SqliteAttemptJournal(join(config.directory,'attempts.sqlite'));
  const recorder=new PaymentRecorder({protocol:'x402',chainId:CHAIN_ID,environment:'TESTNET',payment:{token:TOKEN,recipient:config.terms.seller,sender:config.terms.buyer,amount:AMOUNT},storagePath:join(config.directory,'recordings.sqlite'),journal,capture:{mode:'json-allowlist',paths:['data'],maxBytes:4096},outcomePolicy:outcomePolicy(new Date().toISOString())});
  const savedFetch=globalThis.fetch,guarded=restrictedFetch(savedFetch,config.terms.buyer);
  globalThis.fetch=async(input,init)=>{const request=new Request(input,init),url=new URL(request.url);if(url.origin===FACILITATOR&&!(request.method==='GET'&&url.pathname==='/api/account'))throw new EvidenceError('RECOVERY_READ_ONLY','Recovery forbids all facilitator payment endpoints');return guarded(input,init);};
  try{
    if(session.read().state==='VERIFIED'){
      const bundle=JSON.parse(await readFile(join(config.directory,'complete-redacted.echoframe.json'),'utf8'));
      const report=await verifyBundle(bundle);if(report.integrity!=='VALID'||report.outcomeStatus!=='TESTED_PASS')throw new EvidenceError('VERIFY','Existing recovery did not verify');console.log(JSON.stringify({state:'VERIFIED',existing:true,report}));return;
    }
    const reference=z.object({transaction:hex32,success:z.literal(true),creditBefore:z.object({freeTestnetCredits:z.number().int().nonnegative(),testnetPrepaidMicro:z.number().int().nonnegative()})}).parse(session.read().details);
    const recordings=recorder.list();if(recordings.length!==1)throw new EvidenceError('RECOVERY_CONTEXT','Exactly one recorded purchase context is required');
    const recorded=recordings[0]!;if((await verifyBundle(recorded.bundle)).integrity!=='VALID')throw new EvidenceError('INTEGRITY','Original recording failed verification');
    // Bytes come from the actual retained outcome input, not a generated replacement merchant response.
    const input=z.object({body:z.record(z.string(),z.unknown()),status:z.literal(200)}).parse((recorded.bundle.outcomes[0] as {input?:unknown}|undefined)?.input);
    const result=await finalizeEvidence({recorder,contextKey:recorded.contextKey,terms:config.terms,transactionHash:reference.transaction,directory:config.directory,clientBytes:new TextEncoder().encode(canonicalize(input.body)),deliverySource:'MERCHANT_RETAINED_BYTES',facilitatorReference:{transaction:reference.transaction,success:true},billing:{before:reference.creditBefore,after:await readCredits(config.terms.buyer,config.apiKey)}});
    const identity=recorded.bundle.events.find(e=>e.type==='attempt.identity')?.data as {attemptKey?:string}|undefined;
    if(identity?.attemptKey){let attempt=await journal.get(identity.attemptKey);if(attempt?.events.at(-1)?.state==='AUTHORIZED')attempt=await journal.append(identity.attemptKey,'UNKNOWN');if(attempt&&['UNKNOWN','SUBMITTED','PENDING'].includes(attempt.events.at(-1)!.state))await journal.append(identity.attemptKey,'SETTLED',settlementAttributionKey(CHAIN_ID,reference.transaction,result.match.selectedTransfer.logIndex));}
    session.record('VERIFIED',JSON.parse(canonicalize(result.match)));
    await writeFile(join(config.directory,'recovery-note.json'),canonicalize({source:'Persisted genuine facilitator SDK response and original merchant-retained HTTP 200 outcome bytes',economicActionsDuringRecovery:0,protocolHeaderWasRejected:true,separatelyPersistedBrowserAcknowledgement:false}),{flag:'wx',mode:0o600});
    console.log(JSON.stringify({state:'VERIFIED',match:result.match,report:result.report}));
  }finally{globalThis.fetch=savedFetch;await recorder.close();journal.close();session.close();}
}
void recover().catch(error=>{console.error(JSON.stringify({state:'RECOVERY_BLOCKED',code:error instanceof EvidenceError?error.code:'RECOVERY_REVIEW_REQUIRED',noPaymentAttempted:true}));process.exitCode=1;});
