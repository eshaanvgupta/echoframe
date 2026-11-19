import {loadPrivateConfig} from './config.js';
import {preflight,startLiveSeller} from './server.js';
import {EvidenceError} from '@echoframe/core';
async function main(){
  if(process.argv.includes('--preflight-only')){const config=loadPrivateConfig();console.log(JSON.stringify(await preflight(config.terms,config.apiKey),null,2));return;}
  const seller=await startLiveSeller();console.log(JSON.stringify({status:'REVIEW_REQUIRED_NO_PAYMENT_AUTHORIZED',url:seller.origin,terms:seller.terms,preflight:seller.preflight,evidenceDirectory:seller.directory},null,2));
  const close=()=>{void seller.close().then(()=>process.exit(0)).catch(()=>process.exit(1));};process.once('SIGINT',close);process.once('SIGTERM',close);
}
void main().catch(error=>{console.error(JSON.stringify({status:'LIVE_START_BLOCKED',code:error instanceof EvidenceError?error.code:'LOCAL_OR_UPSTREAM_FAILURE',noAutomaticPayment:true}));process.exitCode=1;});
