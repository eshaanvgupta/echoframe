import {EvidenceError} from '@echoframe/core';
import {FACILITATOR,RPC} from './public.js';
/** Dedicated example-process guard: official testnet only, no redirects and at most one settlement POST. */
export function restrictedFetch(base:typeof fetch,creditAccount?:string):typeof fetch{
  let settled=false;
  return async(input,init)=>{
    const request=new Request(input,init),url=new URL(request.url);
    const accountRead=url.origin===FACILITATOR&&url.pathname==='/api/account'&&request.method==='GET'&&!!creditAccount&&url.searchParams.get('address')?.toLowerCase()===creditAccount.toLowerCase()&&[...url.searchParams.keys()].length===1;
    if(url.username||url.password||url.hash||url.search&&!accountRead)throw new EvidenceError('NETWORK_GUARD','Unexpected URL configuration');
    if(url.origin===FACILITATOR){
      if(!accountRead&&!(['/supported'].includes(url.pathname)&&request.method==='GET')&&!(['/verify','/settle'].includes(url.pathname)&&request.method==='POST'))throw new EvidenceError('NETWORK_GUARD','Unexpected facilitator operation');
      if(url.pathname==='/settle'){if(settled)throw new EvidenceError('ONE_SETTLEMENT','A second settlement request is forbidden');settled=true;}
    }else if(url.origin===RPC){
      if(request.method!=='POST'||request.headers.has('X-API-Key'))throw new EvidenceError('NETWORK_GUARD','Invalid RPC request');
      const payload=await request.clone().json() as {method?:string};if(!['eth_chainId','eth_call','eth_getCode','eth_getTransactionReceipt','eth_getBlockByHash','eth_getBlockByNumber','eth_blockNumber'].includes(payload.method??''))throw new EvidenceError('READ_ONLY','Only explicit public read RPC methods are allowed');
    }else throw new EvidenceError('TESTNET_ONLY','Network destination is outside official Sepolia infrastructure');
    return base(request,{redirect:'error',credentials:'omit',cache:'no-store'});
  };
}
