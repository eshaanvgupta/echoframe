import {encodeAbiParameters,encodeEventTopics,toHex,padHex} from 'viem';
import {jobAbi,decodeJobLogs,PROFILE} from '@echoframe/erc8183';
import type {RpcReceipt} from '@echoframe/celo';
export const contract='0x0000000000000000000000000000000000000009';
const hash='0x'+'11'.repeat(32),block='0x'+'22'.repeat(32);
export const receipt:RpcReceipt={transactionHash:hash,blockHash:block,blockNumber:'0x10',from:contract,to:contract,status:'0x1',logs:[{address:contract,topics:encodeEventTopics({abi:jobAbi,eventName:'JobCompleted',args:{jobId:1n,evaluator:contract}}) as string[],data:encodeAbiParameters([{type:'bytes32'}],[padHex(toHex(1),{size:32})]),logIndex:'0x0',transactionHash:hash,blockHash:block,blockNumber:'0x10',removed:false}]};
export function runErcExample(){return {environment:'SIMULATED',events:decodeJobLogs(receipt,{chainId:11142220,address:contract,expectedCodeHash:hash,profile:PROFILE},'1'),deliveryStatus:'UNKNOWN'};}
if(process.argv[1]?.endsWith('index.ts'))console.log(JSON.stringify(runErcExample(),null,2));
