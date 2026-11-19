import {z} from 'zod';
import {address,hex32,atomic,chain,EvidenceError,commitment,canonicalize,parseJson,assessPaymentAttribution,paymentExpectationsSchema,type PaymentExpectations,type PaymentAttribution,type ExpectationTrust,type TokenBehavior,type Json} from '@echoframe/core';
import {parseAbi,encodeFunctionData,decodeFunctionResult,type Hex,type Abi,keccak256,toBytes} from 'viem';

export const networks={42220:{id:42220,name:'Celo Mainnet',rpc:'https://forno.celo.org',explorer:'https://celo.blockscout.com',environment:'MAINNET'},11142220:{id:11142220,name:'Celo Sepolia',rpc:'https://forno.celo-sepolia.celo-testnet.org',explorer:'https://celo-sepolia.blockscout.com',environment:'TESTNET'}} as const;
export const TRANSFER_TOPIC=keccak256(toBytes('Transfer(address,address,uint256)'));
const quantity=z.string().regex(/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/);
// Normalize only the supported receipt/log fields; provider extensions must not carry credentials into exports.
const logSchema=z.object({address,topics:z.array(hex32).max(4),data:z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/).max(20000),logIndex:quantity,transactionHash:hex32,blockHash:hex32,blockNumber:quantity,removed:z.boolean().optional()});
const receiptSchema=z.object({transactionHash:hex32,blockHash:hex32,blockNumber:quantity,from:address,to:address.nullable(),status:z.enum(['0x0','0x1']),logs:z.array(logSchema).max(10000)});
export type RpcReceipt=z.infer<typeof receiptSchema>;
export interface Transfer{token:string;from:string;to:string;amount:string;logIndex:number;transactionHash:string;blockHash:string;}
export function decodeTransfers(receiptInput:unknown,expectedTx?:string):Transfer[]{
  const receipt=receiptSchema.parse(receiptInput);
  if(expectedTx&&receipt.transactionHash!==expectedTx.toLowerCase())throw new EvidenceError('TX_MISMATCH','Receipt transaction does not match the requested hash');
  if(receipt.status!=='0x1')return [];
  const indices=new Set<string>(),result:Transfer[]=[];
  for(const log of receipt.logs){
    if(log.removed||log.transactionHash!==receipt.transactionHash||log.blockHash!==receipt.blockHash||log.blockNumber!==receipt.blockNumber)throw new EvidenceError('LOG_CONTEXT','Log is removed or outside the containing receipt');
    if(indices.has(log.logIndex))throw new EvidenceError('DUPLICATE_LOG','Repeated log attribution');indices.add(log.logIndex);
    if(log.topics[0]!==TRANSFER_TOPIC)continue;
    if(log.topics.length!==3||!/^0x[0-9a-fA-F]{64}$/.test(log.data)||!log.topics.slice(1).every(t=>/^0x0{24}[0-9a-fA-F]{40}$/.test(t)))throw new EvidenceError('TRANSFER_ABI','Malformed ERC-20 Transfer ABI');
    const index=Number(BigInt(log.logIndex));if(!Number.isSafeInteger(index))throw new EvidenceError('LOG_INDEX','Log index exceeds safe range');
    result.push({token:log.address.toLowerCase(),from:'0x'+log.topics[1]!.slice(-40).toLowerCase(),to:'0x'+log.topics[2]!.slice(-40).toLowerCase(),amount:BigInt(log.data).toString(),logIndex:index,transactionHash:receipt.transactionHash,blockHash:receipt.blockHash});
  }return result;
}
export type ReadMethod='eth_chainId'|'eth_getTransactionReceipt'|'eth_getBlockByHash'|'eth_getBlockByNumber'|'eth_getCode'|'eth_call'|'eth_blockNumber'|'eth_getLogs';
const allowedMethods=new Set<ReadMethod>(['eth_chainId','eth_getTransactionReceipt','eth_getBlockByHash','eth_getBlockByNumber','eth_getCode','eth_call','eth_blockNumber','eth_getLogs']);
export type RpcTransport=(endpoint:string,method:ReadMethod,params:unknown[],signal:AbortSignal)=>Promise<unknown>;
class RateLimitError extends EvidenceError{constructor(public readonly retryAfterMs:number){super('RATE_LIMIT','RPC returned HTTP 429; bounded backoff applies');}}
const officialOrigins=Object.values(networks).map(n=>new URL(n.rpc).origin);
export function validateEndpoint(endpoint:string,trustedOrigins:readonly string[]=officialOrigins):string{
  let url:URL;try{url=new URL(endpoint);}catch{throw new EvidenceError('ENDPOINT','Invalid endpoint URL');}
  if(url.protocol!=='https:'||url.username||url.password||url.hash||!trustedOrigins.includes(url.origin))throw new EvidenceError('ENDPOINT','RPC origin must be explicitly trusted HTTPS configuration');
  return url.toString();
}
async function boundedJson(response:Response):Promise<unknown>{
  const reader=response.body?.getReader();if(!reader)throw new EvidenceError('RPC_BODY','Empty RPC response');let size=0;const pieces:Uint8Array[]=[];
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4_000_000){await reader.cancel();throw new EvidenceError('RPC_LIMIT','Response exceeds 4MB');}pieces.push(part.value);}
  const all=new Uint8Array(size);let offset=0;for(const p of pieces){all.set(p,offset);offset+=p.length;}
  try{return parseJson(new TextDecoder('utf-8',{fatal:true}).decode(all),4_000_000);}catch{throw new EvidenceError('RPC_JSON','Invalid or ambiguous RPC JSON');}
}
export const httpTransport:RpcTransport=async(endpoint,method,params,signal)=>{
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'});
  if(response.status===429){const header=response.headers.get('retry-after')??'0',seconds=Number(header);const delay=Number.isFinite(seconds)?seconds*1000:Math.max(0,Date.parse(header)-Date.now());throw new RateLimitError(Math.min(2000,Math.max(0,Number.isFinite(delay)?delay:0)));}
  if(!response.ok)throw new EvidenceError('RPC_HTTP',`HTTP ${response.status}`);
  const raw=await boundedJson(response);
  if(!raw||typeof raw!=='object')throw new EvidenceError('RPC_SHAPE','Invalid response');const data=raw as Record<string,unknown>;
  if(data.jsonrpc!=='2.0'||data.id!==1||data.error||!Object.hasOwn(data,'result'))throw new EvidenceError('RPC_ERROR','RPC returned an error or mismatched envelope');return data.result;
};
export class ReadonlyRpc{
  readonly endpoints:readonly string[];readonly chainId:42220|11142220;
  constructor(options:{chainId:42220|11142220;endpoints?:string[];trustedOrigins?:string[];transport?:RpcTransport;retries?:number;timeoutMs?:number;backoffMs?:number}){
    this.chainId=chain.parse(options.chainId);this.options=options;
    this.endpoints=(options.endpoints??[networks[options.chainId].rpc]).map(e=>validateEndpoint(e,options.trustedOrigins));
    if(!this.endpoints.length||this.endpoints.length>3)throw new EvidenceError('ENDPOINT','Configure one to three RPC endpoints');
  }
  private readonly options:{transport?:RpcTransport;retries?:number;timeoutMs?:number;backoffMs?:number};
  async call(method:ReadMethod,params:unknown[]=[],signal?:AbortSignal,endpoint=this.endpoints[0]!):Promise<unknown>{
    if(!allowedMethods.has(method))throw new EvidenceError('READ_ONLY','Only read-only RPC methods are allowed');
    if(!this.endpoints.includes(endpoint))throw new EvidenceError('ENDPOINT','Endpoint not configured');
    let last:unknown;
    for(let attempt=0;attempt<=Math.min(3,Math.max(0,this.options.retries??2));attempt++){
      signal?.throwIfAborted();
      const abort=AbortSignal.any([AbortSignal.timeout(Math.min(20000,Math.max(50,this.options.timeoutMs??8000))),...(signal?[signal]:[])]);
      try{return await (this.options.transport??httpTransport)(endpoint,method,params,abort);}catch(e){last=e;signal?.throwIfAborted();
        if(attempt<(this.options.retries??2))await wait(Math.min(2000,Math.max((this.options.backoffMs??200)*2**attempt,e instanceof RateLimitError?e.retryAfterMs:0)),signal);
      }
    }throw last;
  }
  async checkChain(signal?:AbortSignal,endpoint=this.endpoints[0]!):Promise<void>{
    const id=await this.call('eth_chainId',[],signal,endpoint);if(typeof id!=='string'||!quantity.safeParse(id).success||BigInt(id)!==BigInt(this.chainId))throw new EvidenceError('CHAIN_MISMATCH','RPC chain ID does not match configured chain');
  }
}
function wait(ms:number,signal?:AbortSignal):Promise<void>{return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(signal.reason);return;}const done=()=>{signal?.removeEventListener('abort',abort);resolve();};const timer=setTimeout(done,ms);const abort=()=>{clearTimeout(timer);reject(signal?.reason);};signal?.addEventListener('abort',abort,{once:true});
});}
export type Expectations=PaymentExpectations;
export interface Reconciliation{
  chainId:number;environment:'TESTNET'|'MAINNET';transactionHash:string;observedAt:string;
  financialStatus:'SETTLED'|'REVERTED'|'PENDING'|'UNKNOWN';transactionStatus:'SUCCESS'|'REVERTED'|'PENDING'|'UNKNOWN';deliveryStatus:'UNKNOWN';
  authorityStatus:'NOT_PROVIDED';transferStatus:'OBSERVED'|'NOT_OBSERVED'|'UNKNOWN';attribution:PaymentAttribution;
  transfers:Transfer[];selectedLogIndex:number|null;expectations:Record<string,string|number|null>;expectationsMatch:boolean|null;
  decimals:{value:number|null;source:'RPC'|'NOT_PROVIDED'};receipt:RpcReceipt|null;block:Json;
  rpcAgreement:'NOT_REQUESTED'|'AGREES'|'DISAGREES'|'UNAVAILABLE';observations:Array<{endpoint:string;status:string;commitment:string|null}>;warnings:string[];stale:boolean;
}
const decimalsAbi=parseAbi(['function decimals() view returns (uint8)']);
export async function reconcile(rpc:ReadonlyRpc,txHash:string,options:{expected?:Expectations;selectedLogIndex?:number;expectationTrust?:ExpectationTrust;tokenBehavior?:TokenBehavior;crossCheck?:boolean;signal?:AbortSignal}={}):Promise<Reconciliation>{
  // Trusted endpoint configuration may contain provider credentials in paths or queries. Never export those bytes.
  const endpointLabel=(endpoint:string)=>`${new URL(endpoint).origin} [configured endpoint ${rpc.endpoints.indexOf(endpoint)+1}]`;
  const hash=hex32.parse(txHash.toLowerCase());const expected=paymentExpectationsSchema.parse(options.expected??{});
  if(options.selectedLogIndex!==undefined)z.number().int().nonnegative().safe().parse(options.selectedLogIndex);
  for(const v of [expected.asset,expected.recipient,expected.sender])if(v!==undefined)address.parse(v);if(expected.amount!==undefined)atomic.parse(expected.amount);
  if(expected.decimals!==undefined)z.number().int().min(0).max(36).parse(expected.decimals);
  const assessment=()=>assessPaymentAttribution({chainId:rpc.chainId,transactionHash:hash,execution:result.transactionStatus,transfers:result.transfers,expected,trust:options.expectationTrust??'NOT_PROVIDED',tokenBehavior:options.tokenBehavior??'UNVERIFIED',...(options.selectedLogIndex===undefined?{}:{selectedLogIndex:options.selectedLogIndex}),contradicted:result.rpcAgreement==='DISAGREES'});
  const result:Reconciliation={chainId:rpc.chainId,environment:rpc.chainId===42220?'MAINNET':'TESTNET',transactionHash:hash,observedAt:new Date().toISOString(),financialStatus:'UNKNOWN',transactionStatus:'UNKNOWN',deliveryStatus:'UNKNOWN',authorityStatus:'NOT_PROVIDED',transferStatus:'UNKNOWN',attribution:assessPaymentAttribution({chainId:rpc.chainId,transactionHash:hash,execution:'UNKNOWN',transfers:[],expected}),transfers:[],selectedLogIndex:null,expectations:{chainId:expected.chainId??null,transactionHash:expected.transactionHash??null,asset:expected.asset??null,recipient:expected.recipient??null,sender:expected.sender??null,amount:expected.amount??null,decimals:expected.decimals??null},expectationsMatch:null,decimals:{value:null,source:'NOT_PROVIDED'},receipt:null,block:null,rpcAgreement:options.crossCheck?'UNAVAILABLE':'NOT_REQUESTED',observations:[],warnings:['Delivery unverified — no evidence imported','Observed execution and Transfer logs do not attribute a purchase without complete, trusted expectations and an explicitly selected log. Token behavior remains an application trust assumption.'],stale:false};
  result.attribution=assessment();
  let primary:string|undefined,raw:unknown;
  for(const endpoint of rpc.endpoints){
    try{await rpc.checkChain(options.signal,endpoint);raw=await rpc.call('eth_getTransactionReceipt',[hash],options.signal,endpoint);primary=endpoint;break;}
    catch{options.signal?.throwIfAborted();result.observations.push({endpoint:endpointLabel(endpoint),status:'RPC_UNAVAILABLE_OR_CHAIN_MISMATCH',commitment:null});}
  }
  if(!primary){result.stale=true;result.warnings.push('RPC unavailable or chain mismatch; retry read-only reconciliation later.');return result;}
  if(raw===null){
    result.transactionStatus='PENDING';result.financialStatus='PENDING';result.observations.push({endpoint:endpointLabel(primary),status:'RECEIPT_ABSENT',commitment:null});
    if(options.crossCheck){const secondary=rpc.endpoints.find(e=>e!==primary);if(secondary)try{await rpc.checkChain(options.signal,secondary);const second=await rpc.call('eth_getTransactionReceipt',[hash],options.signal,secondary);result.rpcAgreement=second===null?'AGREES':'DISAGREES';result.observations.push({endpoint:endpointLabel(secondary),status:result.rpcAgreement,commitment:second===null?null:commitment('rpc-receipt-v1',second)});}catch{options.signal?.throwIfAborted();result.rpcAgreement='UNAVAILABLE';}if(result.rpcAgreement!=='AGREES'){result.financialStatus='UNKNOWN';result.stale=true;result.warnings.push('Cross-check did not agree on receipt absence; reconcile first.');}}
    result.attribution=assessment();return result;
  }
  try{
    const receipt=receiptSchema.parse(raw);decodeTransfers(receipt,hash);
    const rawBlock=await rpc.call('eth_getBlockByHash',[receipt.blockHash,false],options.signal,primary);
    if(!rawBlock||typeof rawBlock!=='object')throw new EvidenceError('BLOCK','Missing containing block');const block=rawBlock as Record<string,unknown>;
    if(block.hash!==receipt.blockHash||block.number!==receipt.blockNumber||!quantity.safeParse(block.timestamp).success)throw new EvidenceError('BLOCK','Receipt and block disagree');
    if(!Array.isArray(block.transactions)||!block.transactions.includes(hash))throw new EvidenceError('BLOCK','Transaction is not included in the supplied block');
    const canonical=await rpc.call('eth_getBlockByNumber',[receipt.blockNumber,false],options.signal,primary);
    if(!canonical||typeof canonical!=='object'||(canonical as Record<string,unknown>).hash!==receipt.blockHash||(canonical as Record<string,unknown>).number!==receipt.blockNumber||!Array.isArray((canonical as Record<string,unknown>).transactions)||!((canonical as Record<string,unknown>).transactions as unknown[]).includes(hash))throw new EvidenceError('REORG','Receipt block is no longer canonical at its height');
    result.receipt=receipt;result.block={hash:receipt.blockHash,number:receipt.blockNumber,timestamp:String(block.timestamp),canonicalAtObservation:true,finality:'NOT_PROVEN'};
    result.transactionStatus=receipt.status==='0x1'?'SUCCESS':'REVERTED';result.financialStatus='UNKNOWN';
    result.transfers=decodeTransfers(receipt,hash);result.transferStatus=result.transfers.length?'OBSERVED':'NOT_OBSERVED';
    result.observations.push({endpoint:endpointLabel(primary),status:result.transactionStatus,commitment:commitment('rpc-receipt-v1',receipt)});
    if(options.crossCheck){
      const secondary=rpc.endpoints.find(e=>e!==primary);
      if(!secondary){result.rpcAgreement='UNAVAILABLE';result.warnings.push('A distinct second RPC endpoint is required for cross-check.');}
      else try{
        await rpc.checkChain(options.signal,secondary);const second=await rpc.call('eth_getTransactionReceipt',[hash],options.signal,secondary);
        result.rpcAgreement=second!==null&&canonicalize(receiptSchema.parse(second))===canonicalize(receipt)?'AGREES':'DISAGREES';
        result.observations.push({endpoint:endpointLabel(secondary),status:result.rpcAgreement,commitment:second===null?null:commitment('rpc-receipt-v1',second)});
      }catch{options.signal?.throwIfAborted();result.rpcAgreement='UNAVAILABLE';}
      if(result.rpcAgreement!=='AGREES'){result.financialStatus='UNKNOWN';result.attribution=assessment();result.stale=true;result.warnings.push('Cross-check did not agree. Reconcile first; never create a fresh payment automatically.');return result;}
    }
    result.transfers=decodeTransfers(receipt,hash);
    result.transferStatus=result.transfers.length?'OBSERVED':'NOT_OBSERVED';result.attribution=assessment();
    const selected=options.selectedLogIndex!==undefined?result.transfers.find(t=>t.logIndex===options.selectedLogIndex):undefined;
    if(!selected){result.warnings.push(result.transfers.length?'Explicitly select a Transfer log before attributing payment, including transactions with a single Transfer.':'No supported Transfer event; successful transaction execution is not a verified payment.');return result;}
    result.selectedLogIndex=selected.logIndex;
    result.expectationsMatch=result.attribution.status==='MATCHED'?true:result.attribution.status==='MISMATCHED'?false:null;
    if(result.attribution.status==='MATCHED')result.financialStatus='SETTLED';else result.warnings.push(`Purchase attribution ${result.attribution.status}: ${result.attribution.missingEvidence.join(', ')||result.attribution.mismatchedFields.join(', ')}.`);
    try{
      const data=await rpc.call('eth_call',[{to:selected.token,data:encodeFunctionData({abi:decimalsAbi,functionName:'decimals'})},receipt.blockNumber],options.signal,primary);
      if(typeof data!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(data))throw new EvidenceError('DECIMALS','Unsupported return data');
      const value=Number(decodeFunctionResult({abi:decimalsAbi,functionName:'decimals',data:data as Hex}));if(value>36)throw new EvidenceError('DECIMALS','Decimals outside supported display range');result.decimals={value,source:'RPC'};
      if(expected.decimals!==undefined&&value!==expected.decimals){result.financialStatus='UNKNOWN';result.expectationsMatch=false;result.attribution.status='MISMATCHED';result.attribution.mismatchedFields.push('decimals');result.warnings.push('Token decimals do not match the configured expectation.');}
    }catch{options.signal?.throwIfAborted();result.warnings.push('Decimals unavailable; display integer units only.');if(expected.decimals!==undefined){result.financialStatus='UNKNOWN';result.expectationsMatch=false;result.attribution.status='UNAVAILABLE';result.attribution.missingEvidence.push('expected decimals observation');}}
  }catch(e){options.signal?.throwIfAborted();result.financialStatus='UNKNOWN';result.transactionStatus='UNKNOWN';result.transferStatus='UNKNOWN';result.transfers=[];result.selectedLogIndex=null;result.attribution=assessment();result.stale=true;result.warnings.push(`${e instanceof EvidenceError&&/^[A-Z_]{1,50}$/.test(e.code)?e.code:'RPC_EVIDENCE_INVALID'}: RPC evidence did not pass the configured receipt/block checks.`);}
  return result;
}
export function formatUnitsExact(amount:string,decimals:number):string{
  atomic.parse(amount);z.number().int().min(0).max(36).parse(decimals);if(!decimals)return amount;const padded=amount.padStart(decimals+1,'0');return `${padded.slice(0,-decimals)}.${padded.slice(-decimals)}`;
}

export const identityRegistries={erc8004:{42220:'0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'},self:{42220:'0xaC3DF9ABf80d0F5c020C06B04Cced27763355944',11142220:'0x043DaCac8b0771DD5b444bCC88f2f8BBDBEdd379'}} as const;
const identityAbi=parseAbi(['function ownerOf(uint256) view returns (address)','function tokenURI(uint256) view returns (string)','function getAgentWallet(uint256) view returns (address)']);
const selfAbi=parseAbi(['function isVerifiedAgent(bytes32) view returns (bool)','function getAgentId(bytes32) view returns (uint256)','function hasHumanProof(uint256) view returns (bool)','function isProofFresh(uint256) view returns (bool)','function proofExpiresAt(uint256) view returns (uint256)']);
export async function inspectIdentity(rpc:ReadonlyRpc,input:{kind:'erc8004';agentId:string}|{kind:'self';agentKey:string},signal?:AbortSignal):Promise<Json>{
  await rpc.checkChain(signal);
  const registry=input.kind==='self'?identityRegistries.self[rpc.chainId]:rpc.chainId===42220?identityRegistries.erc8004[42220]:null;
  if(!registry)throw new EvidenceError('UNSUPPORTED','No verified ERC-8004 Sepolia registry configured');
  const code=await rpc.call('eth_getCode',[registry,'latest'],signal);if(typeof code!=='string'||code==='0x')throw new EvidenceError('UNSUPPORTED','Registry bytecode absent');
  const read=async(abi:Abi,name:string,args:readonly unknown[])=>{
    const raw=await rpc.call('eth_call',[{to:registry,data:encodeFunctionData({abi,functionName:name,args})},'latest'],signal);
    if(typeof raw!=='string'||raw.length>40000)throw new EvidenceError('UNSUPPORTED','Registry response invalid');return decodeFunctionResult({abi,functionName:name,data:raw as Hex});
  };
  if(input.kind==='erc8004'){
    atomic.parse(input.agentId);const id=BigInt(input.agentId);const [owner,uri,wallet]=await Promise.all([read(identityAbi,'ownerOf',[id]),read(identityAbi,'tokenURI',[id]),read(identityAbi,'getAgentWallet',[id])]);
    return {registry,chainId:rpc.chainId,kind:input.kind,agentId:input.agentId,owner:String(owner),declaredMetadataUri:String(uri),wallet:String(wallet),warning:'Metadata is declarative. URI is not fetched. Identity does not establish delivery.'};
  }
  const key=hex32.parse(input.agentKey);const [verified,id]=await Promise.all([read(selfAbi,'isVerifiedAgent',[key]),read(selfAbi,'getAgentId',[key])]);
  const [proof,fresh,expiry]=await Promise.all([read(selfAbi,'hasHumanProof',[id]),read(selfAbi,'isProofFresh',[id]),read(selfAbi,'proofExpiresAt',[id])]);
  return {registry,chainId:rpc.chainId,kind:'self',verified:verified===true,agentId:String(id),hasHumanProof:proof===true,fresh:fresh===true,expiresAt:String(expiry),warning:'Registry observation only; no passport data collected; identity does not establish delivery.'};
}
