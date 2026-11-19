import {parseAbi,decodeEventLog,decodeFunctionResult,encodeFunctionData,keccak256,type Hex,type AbiEvent,toHex,padHex} from 'viem';
import {ReadonlyRpc,type RpcReceipt} from '@echoframe/celo';
import {address,hex32,atomic,EvidenceError,type Json} from '@echoframe/core';

export const PROFILE='erc8183-reference-a078cab5' as const;
export const jobStates=['Open','Funded','Submitted','Completed','Rejected','Expired'] as const;
export const jobAbi=parseAbi([
  'function paymentToken() view returns (address)',
  'function getJob(uint256 jobId) view returns ((uint256 id,address client,address provider,address evaluator,string description,uint256 budget,uint256 expiredAt,uint8 status,address hook))',
  'event JobCreated(uint256 indexed jobId,address indexed client,address indexed provider,address evaluator,uint256 expiredAt,address hook)',
  'event ProviderSet(uint256 indexed jobId,address indexed provider)',
  'event BudgetSet(uint256 indexed jobId,uint256 amount)',
  'event JobFunded(uint256 indexed jobId,address indexed client,uint256 amount)',
  'event JobSubmitted(uint256 indexed jobId,address indexed provider,bytes32 deliverable)',
  'event JobCompleted(uint256 indexed jobId,address indexed evaluator,bytes32 reason)',
  'event JobRejected(uint256 indexed jobId,address indexed rejector,bytes32 reason)',
  'event JobExpired(uint256 indexed jobId)',
  'event PaymentReleased(uint256 indexed jobId,address indexed provider,uint256 amount)',
  'event EvaluatorFeePaid(uint256 indexed jobId,address indexed evaluator,uint256 amount)',
  'event Refunded(uint256 indexed jobId,address indexed client,uint256 amount)'
]);
export interface JobContractConfig{chainId:42220|11142220;address:string;expectedCodeHash:string;profile:typeof PROFILE;}
export function decodeJobLogs(receipt:RpcReceipt,config:JobContractConfig,jobId:string):Json[]{
  if(config.profile!==PROFILE)throw new EvidenceError('UNSUPPORTED_ERC8183','Unsupported ABI profile');
  address.parse(config.address);atomic.parse(jobId);
  if(receipt.status!=='0x1')throw new EvidenceError('ERC8183_RECEIPT','Job events require successful containing receipt');
  const seen=new Set<string>();const result:Json[]=[];
  for(const log of receipt.logs){
    if(log.address.toLowerCase()!==config.address.toLowerCase())continue;
    if(log.removed||log.blockHash!==receipt.blockHash||log.transactionHash!==receipt.transactionHash||log.blockNumber!==receipt.blockNumber)throw new EvidenceError('ERC8183_CONTEXT','Inconsistent job log context');
    if(seen.has(log.logIndex))throw new EvidenceError('ERC8183_DUPLICATE','Repeated job log');seen.add(log.logIndex);
    let decoded:ReturnType<typeof decodeEventLog>;
    try{decoded=decodeEventLog({abi:jobAbi,data:log.data as Hex,topics:log.topics as [Hex,...Hex[]],strict:true});}catch{throw new EvidenceError('UNSUPPORTED_ERC8183','Event does not match pinned reference ABI');}
    const abi=jobAbi.find(e=>e.type==='event'&&e.name===decoded.eventName) as AbiEvent;
    const indexed=abi.inputs.filter(i=>i.indexed).length;
    if(log.topics.length!==indexed+1||log.data.length!==2+(abi.inputs.length-indexed)*64)throw new EvidenceError('UNSUPPORTED_ERC8183','Unexpected job event data/topic length');
    const args=decoded.args as Record<string,unknown>;
    if(String(args.jobId)!==jobId)continue;
    result.push({event:String(decoded.eventName),args:Object.fromEntries(Object.entries(args).map(([k,v])=>[k,String(v)])),logIndex:log.logIndex,transactionHash:log.transactionHash,provenance:'RPC_OBSERVED'});
  }return result;
}
export async function inspectJob(rpc:ReadonlyRpc,config:JobContractConfig,jobId:string,signal?:AbortSignal):Promise<Json>{
  if(config.profile!==PROFILE||config.chainId!==rpc.chainId)throw new EvidenceError('UNSUPPORTED_ERC8183','Explicit pinned reference profile and matching chain are required');
  address.parse(config.address);hex32.parse(config.expectedCodeHash);atomic.parse(jobId);await rpc.checkChain(signal);
  const code=await rpc.call('eth_getCode',[config.address,'latest'],signal);
  if(typeof code!=='string'||!/^0x(?:[0-9a-fA-F]{2})+$/.test(code)||keccak256(code as Hex)!==config.expectedCodeHash)throw new EvidenceError('UNSUPPORTED_ERC8183','Configured code commitment does not match deployed code');
  try{
    const read=async(name:'getJob'|'paymentToken')=>{
      const data=encodeFunctionData({abi:jobAbi,functionName:name,...(name==='getJob'?{args:[BigInt(jobId)]}:{})});
      const result=await rpc.call('eth_call',[{to:config.address,data},'latest'],signal);if(typeof result!=='string'||result.length>100000)throw new Error('Invalid return data');
      return decodeFunctionResult({abi:jobAbi,functionName:name,data:result as Hex});
    };
    const [raw,token]=await Promise.all([read('getJob'),read('paymentToken')]);
    if(!raw||typeof raw!=='object'||!('id'in raw)||!('status'in raw))throw new Error('Invalid job tuple');
    const job=raw as {id:bigint;client:Hex;provider:Hex;evaluator:Hex;description:string;budget:bigint;expiredAt:bigint;status:number;hook:Hex};
    if(job.id!==BigInt(jobId)||!jobStates[job.status])throw new Error('Unknown job/status');
    return {profile:PROFILE,contract:config.address,chainId:rpc.chainId,codeMatch:true,codeTrust:'USER_CONFIGURED_PIN_NOT_AN_AUDIT',jobId,status:jobStates[job.status]!,client:job.client,provider:job.provider,evaluator:job.evaluator,token:String(token),budget:job.budget.toString(),expiredAt:job.expiredAt.toString(),description:job.description,deliveryStatus:'UNKNOWN',warning:'Completed is an evaluator statement, not independently verified delivery. Proxies can change implementation behind unchanged proxy bytecode.'};
  }catch(e){signal?.throwIfAborted();throw new EvidenceError('UNSUPPORTED_ERC8183',e instanceof Error?e.message:'Contract does not expose the pinned job interface');}
}
export function jobLogFilter(config:JobContractConfig,jobId:string,fromBlock:string,toBlock:string):Json{
  atomic.parse(jobId);address.parse(config.address);const range=/^0x[0-9a-f]+$/;
  if(!range.test(fromBlock)||!range.test(toBlock)||BigInt(toBlock)<BigInt(fromBlock)||BigInt(toBlock)-BigInt(fromBlock)>10000n)throw new EvidenceError('LOG_RANGE','Use a bounded range of at most 10000 blocks');
  return {address:config.address,fromBlock,toBlock,topics:[null,padHex(toHex(BigInt(jobId)),{size:32})]};
}
