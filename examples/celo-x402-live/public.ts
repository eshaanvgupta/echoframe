import {z} from 'zod';
import {address,canonicalize,commitment,EvidenceError,type ValidatorManifest} from '@echoframe/core';
import {parseX402Challenge,normalizeX402Offer} from '@echoframe/x402';
export const CHAIN_ID=11142220 as const;
export const NETWORK='eip155:11142220' as const;
export const TOKEN='0x01C5C0122039549AD1493B8220cABEdD739BC44E' as const;
export const FACILITATOR='https://api.x402.sepolia.celo.org';
export const RPC='https://forno.celo-sepolia.celo-testnet.org';
export const AMOUNT='10000';
export const CONTENT='this response cost $0.01';
export const TIMEOUT=300;
export const termsSchema=z.object({version:z.literal('1.0.0'),chainId:z.literal(CHAIN_ID),network:z.literal(NETWORK),token:z.literal(TOKEN),decimals:z.literal(6),amount:z.literal(AMOUNT),buyer:address,seller:address,facilitator:z.literal(FACILITATOR),resource:z.literal('/premium'),maxTimeoutSeconds:z.literal(TIMEOUT)}).strict();
export type Terms=z.infer<typeof termsSchema>;
export function makeTerms(buyer:string,seller:string):Terms{return termsSchema.parse({version:'1.0.0',chainId:CHAIN_ID,network:NETWORK,token:TOKEN,decimals:6,amount:AMOUNT,buyer,seller,facilitator:FACILITATOR,resource:'/premium',maxTimeoutSeconds:TIMEOUT});}
export const termsHash=(terms:Terms)=>commitment('celo-testnet-purchase-terms-v1',termsSchema.parse(terms));
export function checkChallenge(header:string,terms:Terms){
  const challenge=parseX402Challenge(header);if(challenge.accepts.length!==1)throw new EvidenceError('QUOTE','One exact offer is required');const requirement=challenge.accepts[0]!,offer=normalizeX402Offer(requirement);
  if(offer.chainId!==CHAIN_ID||offer.token.toLowerCase()!==TOKEN.toLowerCase()||offer.payee.toLowerCase()!==terms.seller.toLowerCase()||offer.amount!==AMOUNT||requirement.maxTimeoutSeconds!==TIMEOUT||requirement.extra.name!=='USDC'||requirement.extra.version!=='2')throw new EvidenceError('QUOTE','Challenge differs from reviewed testnet terms');return challenge;
}
export interface SigningRequest{domain:Record<string,unknown>;types:Record<string,unknown>;primaryType:string;message:Record<string,unknown>;}
export function checkSigningRequest(request:SigningRequest,terms:Terms,now=Math.floor(Date.now()/1000)):void{
  const d=request.domain,m=request.message;
  const expectedTypes={TransferWithAuthorization:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'}]};
  if(request.primaryType!=='TransferWithAuthorization'||canonicalize(request.types)!==canonicalize(expectedTypes)||Object.keys(d).sort().join(',')!=='chainId,name,verifyingContract,version'||d.name!=='USDC'||d.version!=='2'||Number(d.chainId)!==CHAIN_ID||String(d.verifyingContract).toLowerCase()!==TOKEN.toLowerCase())throw new EvidenceError('SIGNING_DOMAIN','Refusing an unexpected signing domain or type');
  if(Object.keys(m).sort().join(',')!=='from,nonce,to,validAfter,validBefore,value'||String(m.from).toLowerCase()!==terms.buyer.toLowerCase()||String(m.to).toLowerCase()!==terms.seller.toLowerCase()||BigInt(String(m.value))!==BigInt(AMOUNT)||BigInt(String(m.validAfter))!==0n||BigInt(String(m.validBefore))<=BigInt(now+10)||BigInt(String(m.validBefore))>BigInt(now+TIMEOUT)||!/^0x[0-9a-fA-F]{64}$/.test(String(m.nonce)))throw new EvidenceError('SIGNING_TERMS','Refusing changed amount/parties/nonce or expired/excessive authorization');
}
export const outcomePolicy=(now:string):ValidatorManifest=>({version:'1.0.0',name:'Official Celo seller response contract',now,rules:[{kind:'http',min:200,max:200},{kind:'presence'},{kind:'schema',schema:{type:'object',required:['data'],additionalProperties:false,properties:{data:{type:'string',const:CONTENT}}}},{kind:'equals',path:'data',value:CONTENT}]});
