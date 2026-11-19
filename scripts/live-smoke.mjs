import {writeFile} from 'node:fs/promises';
import {ReadonlyRpc,reconcile,networks} from '../packages/celo/dist/index.js';
// Explicit, bounded, public read-only network smoke test. Does not attribute a payment to ECHOFRAME.
const observations=[];
for(const network of Object.values(networks)){
  const rpc=new ReadonlyRpc({chainId:network.id,retries:0,timeoutMs:7000});
  try{
    await rpc.checkChain();
    const response=await fetch(network.rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBlockByNumber',params:['latest',false]}),signal:AbortSignal.timeout(7000),redirect:'error'});
    if(!response.ok)throw new Error(`Block query HTTP ${response.status}`);const data=await response.json();const block=data.result;if(!block||!Array.isArray(block.transactions))throw new Error('Block unavailable');
    let result=null;
    for(const hash of block.transactions.slice(0,8)){
      result=await reconcile(rpc,hash);if(result.transfers.length)break;
    }
    const transferCountBeforeSelection=result?.transfers.length??0;
    if(result&&result.transfers.length>1)result=await reconcile(rpc,result.transactionHash,{selectedLogIndex:result.transfers[0].logIndex});
    observations.push({network:network.name,chainId:network.id,checkedAt:new Date().toISOString(),chainMatched:true,latestBlock:block.number,transferCountBeforeSelection,explicitSmokeSelection:transferCountBeforeSelection>1?'First decoded log explicitly selected only for decoder smoke; no purchase attribution':null,transactionInspection:result,scope:'Public read-only observation, not ECHOFRAME adoption or a consenting ECHOFRAME payment.'});
  }catch(error){observations.push({network:network.name,chainId:network.id,checkedAt:new Date().toISOString(),error:error instanceof Error?error.message:'RPC unavailable',scope:'Network failure honestly retained; no synthetic replacement.'});}
}
await writeFile('docs/live-rpc-observations.json',JSON.stringify({clientDate:'2026-11-19',noTransactionsSent:true,observations},null,2));
console.log(JSON.stringify(observations.map(o=>({network:o.network,chainMatched:o.chainMatched??false,transaction:o.transactionInspection?.transactionHash??null,financialStatus:o.transactionInspection?.financialStatus??null,transferCount:o.transactionInspection?.transfers.length??null,error:o.error??null})),null,2));
