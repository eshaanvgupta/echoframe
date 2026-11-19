import type {IncomingMessage,ServerResponse} from 'node:http';
import {writeFile} from 'node:fs/promises';
import type {MiddlewareHandler} from 'hono';
import {appendEvent,createBundle,sealBundle,canonicalize,commitment,createOutcomeProof,manifestSchema,publicBundle,verifyBundle,settlementAttributionKey,address,atomic,chain,EvidenceError,type EvidenceBundle,type Json,type PaymentOffer,type ValidatorManifest,type AttemptJournal} from '@echoframe/core';
import {parseX402Challenge,normalizeX402Offer,readX402CredentialMetadata,inspectX402Signature,parseX402Settlement,headerValue} from '@echoframe/x402';
import {parseMppChallenge,normalizeMppOffer,readMppCredentialMetadata,inspectMppCredential,parseMppReceiptReference} from '@echoframe/mpp';
import {reconcile,type ReadonlyRpc,type Reconciliation} from '@echoframe/celo';
import {RecorderStore} from './recorder-store.js';
import {BodyObserver,captureProjection,validateCapture,safeMime,type JsonCapture,type BodyObservation} from './body-observer.js';

export interface PaymentRecorderOptions{
  protocol:'x402'|'mpp';chainId:42220|11142220;
  payment:{token:string;recipient:string;amount:string;sender?:string};
  journal:AttemptJournal;storagePath:string;environment?:EvidenceBundle['environment'];
  /** Explicit selection is required when more than one offer matches. */
  selectOffer?:(offers:readonly PaymentOffer[])=>number;
  /** No bytes are retained without this explicit allowlist. Policies evaluate only the retained projection. */
  capture?:JsonCapture;outcomePolicy?:ValidatorManifest;
  maxResponseBytes?:number;responseTimeoutMs?:number;clock?:()=>Date;
  onError?:(error:EvidenceError)=>void;onBundle?:(bundle:EvidenceBundle)=>void;
}
interface Exchange{key:string;id:string;attemptKey:string|null;authenticated:boolean;}
const data=(v:Json):Record<string,Json>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v:{};
const json=(v:unknown):Json=>JSON.parse(canonicalize(v)) as Json;
const opaque=/^[A-Za-z0-9_-]{8,128}$/;
/** Observes existing merchant middleware. It never signs, broadcasts, refunds or retries payments. */
export class PaymentRecorder{
  private readonly store:RecorderStore;private readonly jobs=new Set<Promise<void>>();private readonly failures:EvidenceError[]=[];
  private readonly active=new Map<string,number>();private readonly finalizations=new Map<string,Promise<void>>();private closed=false;
  constructor(private readonly options:PaymentRecorderOptions){
    if(!['x402','mpp'].includes(options.protocol))throw new EvidenceError('RECORDER_CONFIG','Unsupported protocol');
    chain.parse(options.chainId);address.parse(options.payment.token);address.parse(options.payment.recipient);atomic.parse(options.payment.amount);
    if(options.payment.sender)address.parse(options.payment.sender);
    if(options.environment&&options.environment!=='SIMULATED'&&options.environment!==(options.chainId===42220?'MAINNET':'TESTNET'))throw new EvidenceError('ENVIRONMENT','Environment and chain differ');
    if(options.capture)validateCapture(options.capture);
    if(options.outcomePolicy){manifestSchema.parse(options.outcomePolicy);if(!options.capture)throw new EvidenceError('CAPTURE_CONFIG','Outcome policy requires explicit allowlisted JSON capture');}
    for(const [name,value,max]of [['maxResponseBytes',options.maxResponseBytes,2_000_000],['responseTimeoutMs',options.responseTimeoutMs,60000]]as const)if(value!==undefined&&(!Number.isSafeInteger(value)||value<1||value>max))throw new EvidenceError('RECORDER_CONFIG',`Invalid ${name}`);
    this.store=new RecorderStore(options.storagePath);
  }
  private now():string{return (this.options.clock?.()??new Date()).toISOString();}
  private limit():number{return Math.min(this.options.maxResponseBytes??2_000_000,this.options.capture?(this.options.capture.maxBytes??65536):2_000_000);}
  private finalize(exchange:Exchange,status:number,headers:Headers|Record<string,string|string[]|undefined>,body:BodyObservation):Promise<void>{
    const previous=this.finalizations.get(exchange.key)??Promise.resolve();const work=previous.catch(()=>{}).then(()=>this.finish(exchange,status,headers,body)).finally(()=>{if(this.finalizations.get(exchange.key)===work)this.finalizations.delete(exchange.key);});this.finalizations.set(exchange.key,work);return work;
  }
  private add(key:string,type:string,value:Json):EvidenceBundle{return this.store.mutate(key,()=>{throw new EvidenceError('CONTEXT','Unknown request context');},b=>appendEvent(b,type,value,{at:this.now()}));}
  private offer(key:string):PaymentOffer|undefined{return this.store.get(key)?.paymentOffers[0];}
  private error(key:string,error:unknown):void{
    // Exception messages may contain provider headers/credentials. Only stable local categories cross this boundary.
    const code=error instanceof EvidenceError&&/^[A-Z_]{1,50}$/.test(error.code)?error.code:'UNSUPPORTED_PROFILE';
    this.add(key,'protocol.unsupported',{code,profile:this.options.protocol,financialStatus:'UNKNOWN',detail:'Artifact rejected by the configured supported profile; raw input and error text were not retained.'});
  }
  private matches(q:PaymentOffer):boolean{const p=this.options.payment;return q.chainId===this.options.chainId&&q.token.toLowerCase()===p.token.toLowerCase()&&q.payee.toLowerCase()===p.recipient.toLowerCase()&&q.amount===p.amount;}
  private track(work:Promise<void>):void{
    const job=work.catch(()=>{const error=new EvidenceError('RECORDER_WRITE','Evidence capture did not complete; reconcile the existing payment independently');this.failures.push(error);try{this.options.onError?.(error);}catch{/* An application error handler cannot alter the merchant response. */}}).finally(()=>this.jobs.delete(job));this.jobs.add(job);
  }
  async drain():Promise<void>{while(this.jobs.size)await Promise.all([...this.jobs]);if(this.failures.length){this.failures.length=0;throw new EvidenceError('RECORDER_WRITE','One or more evidence captures failed; inspect onError and reconcile independently');}}
  private async begin(method:string,route:string,headers:Headers|Record<string,string|string[]|undefined>):Promise<Exchange>{
    if(this.closed)throw new EvidenceError('RECORDER_CLOSED','Recorder is closed');
    const supplied=headerValue(headers,'x-echoframe-request-id');if(supplied&&!opaque.test(supplied))throw new EvidenceError('CORRELATION','Request ID must be opaque, 8–128 safe characters');
    const id=supplied??crypto.randomUUID(),key=commitment('merchant-request-v1',{protocol:this.options.protocol,chainId:this.options.chainId,method:method.toUpperCase(),routeHash:commitment('merchant-route-v1',route),idHash:commitment('opaque-request-id-v1',id)});
    const existing=this.store.get(key),overlap=this.active.has(key);
    this.store.mutate(key,()=>createBundle({title:'Merchant payment evidence',protocolKind:this.options.protocol,chainId:this.options.chainId,environment:this.options.environment??(this.options.chainId===42220?'MAINNET':'TESTNET'),createdAt:this.now(),requestContext:{contextKey:key}}),b=>appendEvent(b,'http.request',{contextKey:key,method:method.toUpperCase(),correlated:!!existing,metadataOnly:!this.options.capture},{at:this.now()}));
    this.active.set(key,(this.active.get(key)??0)+1);
    const exchange:Exchange={key,id,attemptKey:null,authenticated:false};
    if(overlap)this.add(key,'attempt.duplicate',{contextKey:key,reason:'CONCURRENT_REQUEST',recommendation:'RECONCILE_FIRST'});
    try{
      let credential:string|undefined;
      if(this.options.protocol==='x402')credential=headerValue(headers,'PAYMENT-SIGNATURE');
      else{
        const rawAuthorization=headerValue(headers,'Authorization'),alternate=headerValue(headers,'Payment-Authorization');
        // The alternate payment header exists specifically to coexist with ordinary HTTP authentication.
        const authorization=rawAuthorization&&/^Payment\s/i.test(rawAuthorization)?rawAuthorization:undefined;
        if(authorization&&alternate)throw new EvidenceError('MPP_CREDENTIAL_HEADER','Ambiguous payment credential headers');
        const selection=this.store.get(key)?.events.filter(e=>e.type==='quote.selected').at(-1),selectedHeader=selection?data(selection.data).credentialHeader:'Authorization';
        if((selectedHeader==='Payment-Authorization'&&authorization)||(selectedHeader!=='Payment-Authorization'&&alternate))throw new EvidenceError('MPP_CREDENTIAL_HEADER','Credential header differs from the original challenge');
        credential=selectedHeader==='Payment-Authorization'?alternate:authorization;
      }
      if(!credential)return exchange;
      const observed=this.options.protocol==='x402'?readX402CredentialMetadata(credential):readMppCredentialMetadata(credential);
      const pinned=this.offer(key);
      this.add(key,'quote.compared',{stage:'SELECTED_TO_ACCEPTED',expected:json(pinned??this.options.payment),observed:json(observed.offer)});
      if(observed.offer.payee.toLowerCase()!==observed.payee.toLowerCase()||observed.offer.amount!==observed.amount)this.add(key,'quote.compared',{stage:'ACCEPTED_TO_AUTHORIZATION',expected:json(observed.offer),observed:json({...observed.offer,payee:observed.payee,amount:observed.amount})});
      if(!pinned)throw new EvidenceError('MISSING_CHALLENGE','Capture the original challenge using the same opaque request ID');
      if(!this.matches(observed.offer)||pinned.quoteHash!==observed.offer.quoteHash)throw new EvidenceError('QUOTE_CHANGED','Quote differs from configured original expectation');
      const metadata=this.options.protocol==='x402'
        ?inspectX402Signature(credential,readX402CredentialMetadata(credential).requirements,{nowSeconds:Date.parse(this.now())/1000,...(this.options.payment.sender?{expectedPayer:this.options.payment.sender}:{})})
        :inspectMppCredential(credential,readMppCredentialMetadata(credential).challenge,{nowSeconds:Date.parse(this.now())/1000});
      if(this.options.payment.sender&&observed.payer!==this.options.payment.sender.toLowerCase())throw new EvidenceError('PAYER','Unexpected payer');
      const reference=this.store.registerAuthorization(observed.authorizationFingerprint,key);
      this.add(key,'authorization.observed',metadata);
      if(reference!=='NEW')this.add(key,'authorization.reused',{contextKey:key,referenceStatus:reference,recommendation:'RECONCILE_FIRST'});
      if(reference==='OTHER_REQUEST'||overlap)return exchange;
      const record=await this.options.journal.create({chainId:this.options.chainId,protocol:this.options.protocol,requestId:key,payer:observed.payer,payee:pinned.payee,token:pinned.token,amount:pinned.amount,quoteHash:pinned.quoteHash},this.now());
      exchange.attemptKey=record.key;exchange.authenticated=true;
      this.add(key,'attempt.identity',{attemptKey:record.key,payer:observed.payer});
      if(record.events.at(-1)!.state==='NOT_INITIATED')await this.options.journal.append(record.key,'AUTHORIZED',null,this.now());
      else this.add(key,'attempt.duplicate',{attemptKey:record.key,recommendation:'RECONCILE_FIRST'});
    }catch(error){this.error(key,error);}
    return exchange;
  }
  private async finish(exchange:Exchange,status:number,headers:Headers|Record<string,string|string[]|undefined>,body:BodyObservation):Promise<void>{
    const {key}=exchange;
    try{
      const challengeHeader=headerValue(headers,this.options.protocol==='x402'?'PAYMENT-REQUIRED':'WWW-Authenticate');
      if(status===402&&challengeHeader){
        try{
          const mppChallenge=this.options.protocol==='mpp'?parseMppChallenge(challengeHeader,this.now()):null;
          const offers=mppChallenge?[normalizeMppOffer(mppChallenge)]:parseX402Challenge(challengeHeader).accepts.map((q,i)=>normalizeX402Offer(q,`offer-${i}`));
          const matches=offers.filter(q=>this.matches(q));
          const selected=this.options.selectOffer?offers[this.options.selectOffer(offers)]:matches.length===1?matches[0]:undefined;
          if(!selected||!this.matches(selected))throw new EvidenceError('OFFER_SELECTION','Select one offer that matches the configured payment');
          this.add(key,'payment.challenge',{quote:json(selected),offerCount:offers.length});
          const pinned=this.offer(key);if(pinned&&pinned.quoteHash!==selected.quoteHash)throw new EvidenceError('QUOTE_CHANGED','Original pinned quote cannot be replaced');
          this.store.mutate(key,()=>{throw new Error('Missing context');},b=>sealBundle({...b,paymentOffers:[selected]}));
          this.add(key,'quote.selected',{quote:json(selected),expectationOrigin:'APPLICATION_CONFIGURED',credentialHeader:this.options.protocol==='x402'?'PAYMENT-SIGNATURE':mppChallenge?.header??'Authorization'});
        }catch(error){this.error(key,error);}
      }
      const protocolHeader=headerValue(headers,this.options.protocol==='x402'?'PAYMENT-RESPONSE':'Payment-Receipt');
      if(protocolHeader){
        try{
          const selected=this.offer(key);if(!selected||!exchange.authenticated)throw new EvidenceError('MISSING_AUTHORIZATION','Response lacks matching observed request authorization');
          const observation=this.options.protocol==='x402'?parseX402Settlement(protocolHeader,{network:`eip155:${selected.chainId}`,amount:selected.amount}):parseMppReceiptReference(protocolHeader,selected.chainId);
          this.add(key,'payment.response',observation);
          const d=data(observation),tx=d.transaction??d.reference;
          if(typeof tx==='string')this.store.mutate(key,()=>{throw new Error('Missing context');},b=>sealBundle({...b,transactionHashes:[...new Set([...b.transactionHashes,tx])]}));
          if(exchange.attemptKey){const current=await this.options.journal.get(exchange.attemptKey);
            if(current?.events.at(-1)!.state==='AUTHORIZED')await this.options.journal.append(exchange.attemptKey,'SUBMITTED',null,this.now());
            const state=d.financialStatus==='PENDING'?'PENDING':'UNKNOWN';const updated=await this.options.journal.get(exchange.attemptKey);
            if(updated&&['SUBMITTED','PENDING','UNKNOWN'].includes(updated.events.at(-1)!.state))await this.options.journal.append(exchange.attemptKey,state,null,this.now());
            this.add(key,'financial.observation',{status:state,quality:'APP_REPORTED',recommendation:'RECONCILE_FIRST'});
          }
        }catch(error){this.error(key,error);}
      }else if(exchange.attemptKey){const record=await this.options.journal.get(exchange.attemptKey);if(record&&record.events.at(-1)!.state==='AUTHORIZED')await this.options.journal.append(exchange.attemptKey,'UNKNOWN',null,this.now());this.add(key,'payment.unknown',{reason:'PROTOCOL_RESPONSE_NOT_OBSERVED',recommendation:'RECONCILE_FIRST'});}
      if(exchange.attemptKey){const record=await this.options.journal.get(exchange.attemptKey);if(record)this.store.mutate(key,()=>{throw new Error('Missing context');},b=>sealBundle({...b,recoveryState:record.events.at(-1)!.state}));}
      this.add(key,body.complete?'merchant.response':'merchant.response_lost',{status,byteCount:body.byteCount,contentHash:body.contentHash,mime:safeMime(headerValue(headers,'Content-Type')),complete:body.complete,reason:body.reason,commitmentScope:'APPLICATION_RESPONSE_BYTES',captureMode:this.options.capture?'JSON_ALLOWLIST_PROJECTION':'METADATA_AND_COMMITMENT_ONLY'});
      // A 402 challenge is not a purchased deliverable.
      if(status!==402&&body.complete)this.add(key,body.byteCount?'delivery.returned':'delivery.empty',{status,byteCount:body.byteCount,contentHash:body.contentHash,quality:'APP_REPORTED'});
      if(status!==402&&body.complete&&body.capture&&this.options.capture){
        try{
          const projection=captureProjection(body.capture,this.options.capture);
          if(this.options.outcomePolicy){
            const id=`event-${this.store.get(key)!.events.length}`;
            const proof=await createOutcomeProof(id,this.options.chainId,this.options.outcomePolicy,{body:projection,status});
            this.add(key,'outcome.input',{contentHash:proof.result.contentHash,sourceContentHash:body.contentHash,scope:'ALLOWLIST_PROJECTION',projectionManifestHash:commitment('capture-projection-v1',this.options.capture),warning:'Checks reproduce the retained projection; hidden original response bytes are not independently available.'});
            this.store.mutate(key,()=>{throw new Error('Missing context');},b=>sealBundle({...b,outcomes:[...b.outcomes,json(proof)]}));
          }else this.add(key,'result.projection',{body:projection,sourceContentHash:body.contentHash,scope:'ALLOWLIST_PROJECTION'});
        }catch(error){this.error(key,error);}finally{body.capture.fill(0);}
      }
      const bundle=this.store.get(key)!;this.options.onBundle?.(bundle);
    }finally{const remaining=(this.active.get(key)??1)-1;if(remaining)this.active.set(key,remaining);else this.active.delete(key);}
  }
  /** Place before the existing Express payment middleware. Recorder failures call next(error), never initiate a payment. */
  express(){return (req:IncomingMessage,res:ServerResponse,next:(error?:unknown)=>void):void=>{
    void this.begin(req.method??'GET',req.url??'/',req.headers).then(exchange=>{
      res.setHeader('ECHOFRAME-REQUEST-ID',exchange.id);
      const observer=new BodyObserver(this.limit(),!!this.options.capture);
      const write=res.write,end=res.end;
      res.write=function(this:ServerResponse,...args:unknown[]){observer.add(args[0],typeof args[1]==='string'?args[1] as BufferEncoding:undefined);return Reflect.apply(write,this,args) as boolean;};
      res.end=function(this:ServerResponse,...args:unknown[]){observer.add(args[0],typeof args[1]==='string'?args[1] as BufferEncoding:undefined);return Reflect.apply(end,this,args) as ServerResponse;};
      let finished=false;const finish=(complete:boolean)=>{if(finished)return;finished=true;clearTimeout(timer);const normalized=Object.fromEntries(Object.entries(res.getHeaders()).map(([k,v])=>[k,typeof v==='number'?String(v):v]));this.track(this.finalize(exchange,res.statusCode,normalized,observer.finish(complete)));};
      const timer=setTimeout(()=>finish(false),this.options.responseTimeoutMs??10000);timer.unref();res.once('finish',()=>finish(true));res.once('close',()=>finish(res.writableFinished));next();
    }).catch(next);
  };}
  /** Real Hono middleware; bounded clone observation leaves the application's response readable. */
  hono():MiddlewareHandler{return async(c,next)=>{
    const exchange=await this.begin(c.req.method,new URL(c.req.url).pathname+new URL(c.req.url).search,c.req.raw.headers);
    try{await next();c.header('ECHOFRAME-REQUEST-ID',exchange.id);
      const response=c.res.clone(),observer=new BodyObserver(this.limit(),!!this.options.capture);
      this.track((async()=>{const reader=response.body?.getReader();let complete=true;let timeout:ReturnType<typeof setTimeout>|undefined;
        try{if(reader){let count=0;const read=async()=>{for(;;){const part=await reader.read();if(part.done)break;observer.add(part.value);count+=part.value.length;if(count>this.limit()){void reader.cancel().catch(()=>{});return;}}};await Promise.race([read(),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('timeout')),this.options.responseTimeoutMs??10000);})]);}}
        catch{complete=false;void reader?.cancel().catch(()=>{});}finally{clearTimeout(timeout);}
        await this.finalize(exchange,response.status,response.headers,observer.finish(complete));})());
    }catch(error){this.track(this.finalize(exchange,500,new Headers(),{byteCount:0,contentHash:null,complete:false,reason:'RESPONSE_LOST',capture:null}));throw error;}
  };}
  list():Array<{contextKey:string;bundle:EvidenceBundle}>{return this.store.list();}
  getBundle(contextKey:string):EvidenceBundle|undefined{return this.store.get(contextKey);}
  async recover():Promise<Array<{contextKey:string;attemptKey:string|null;recommendation:'RECONCILE_FIRST'}>>{
    const attempts=await this.options.journal.list();const recovered=[];for(const {contextKey,bundle}of this.store.list()){
      const identity=bundle.events.filter(e=>e.type==='attempt.identity').at(-1),attempt=identity?String(data(identity.data).attemptKey):attempts.find(a=>a.identity.requestId===contextKey)?.key??null;
      if(attempt){const record=await this.options.journal.get(attempt);if(record){this.store.mutate(contextKey,()=>{throw new Error('Missing context');},b=>sealBundle({...b,recoveryState:record.events.at(-1)!.state}));if(['SETTLED','REVERTED','FAILED','REFUNDED'].includes(record.events.at(-1)!.state))continue;}}
      this.add(contextKey,'journal.recovered',{attemptKey:attempt,recommendation:'RECONCILE_FIRST'});recovered.push({contextKey,attemptKey:attempt,recommendation:'RECONCILE_FIRST' as const});
    }return recovered;
  }
  /** Explicit, read-only reconciliation; caller chooses a transaction AND log. */
  async reconcile(contextKey:string,rpc:ReadonlyRpc,transactionHash:string,options:{selectedLogIndex:number;tokenBehavior:'CONFIGURED_ERC20';crossCheck?:boolean}):Promise<Reconciliation>{
    await this.drain();const b=this.store.get(contextKey);if(!b)throw new EvidenceError('CONTEXT','Unknown request context');
    if(rpc.chainId!==this.options.chainId||!b.transactionHashes.includes(transactionHash))throw new EvidenceError('TRANSACTION_CONTEXT','Reconciliation must reference this recorded protocol response and configured chain');
    const p=this.options.payment,result=await reconcile(rpc,transactionHash,{expected:{chainId:this.options.chainId,transactionHash,asset:p.token,recipient:p.recipient,amount:p.amount,...(p.sender?{sender:p.sender}:{})},selectedLogIndex:options.selectedLogIndex,expectationTrust:'APPLICATION_CONFIGURED',tokenBehavior:options.tokenBehavior,...(options.crossCheck!==undefined?{crossCheck:options.crossCheck}:{})});
    this.add(contextKey,'payment.reconciliation',json(result));
    if(result.financialStatus==='SETTLED'){
      const attempts=await this.options.journal.list();
      const identity=b.events.filter(e=>e.type==='attempt.identity').at(-1),attempt=identity?String(data(identity.data).attemptKey):attempts.find(a=>a.identity.requestId===contextKey)?.key??null;
      if(attempt){const current=await this.options.journal.get(attempt);if(current&&['SUBMITTED','PENDING','UNKNOWN'].includes(current.events.at(-1)!.state)){const settled=await this.options.journal.append(attempt,'SETTLED',settlementAttributionKey(this.options.chainId,transactionHash,options.selectedLogIndex),this.now());this.store.mutate(contextKey,()=>{throw new Error('Missing context');},bundle=>sealBundle({...bundle,recoveryState:settled.events.at(-1)!.state}));}}
    }
    this.add(contextKey,'financial.observation',{status:result.financialStatus,quality:'APP_REPORTED',source:'READ_ONLY_RPC_WITH_CONFIGURED_EXPECTATIONS'});return result;
  }
  async exportEvidence(contextKey:string,path:string,options:{mode:'public'|'complete'}={mode:'public'}):Promise<void>{
    await this.drain();const bundle=this.store.get(contextKey);if(!bundle)throw new EvidenceError('CONTEXT','Unknown request context');
    if((await verifyBundle(bundle)).integrity!=='VALID')throw new EvidenceError('INTEGRITY','Stored evidence did not verify');
    await writeFile(path,canonicalize(options.mode==='complete'?bundle:publicBundle(bundle)),{flag:'wx',mode:0o600});
  }
  async close():Promise<void>{try{await this.drain();if(this.active.size)throw new EvidenceError('RECORDER_BUSY','Stop the server and finish active responses before closing the recorder');}finally{if(!this.active.size){this.closed=true;this.store.close();}}}
}
export type {JsonCapture} from './body-observer.js';
