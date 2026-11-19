import lighthouse from 'lighthouse';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({args:['--remote-debugging-port=9224','--remote-debugging-address=127.0.0.1']});
try{
  const result=await lighthouse(process.env.ECHOFRAME_AUDIT_URL??'http://127.0.0.1:4173/',{port:9224,output:'json',onlyCategories:['performance','accessibility','best-practices','seo'],logLevel:'error',blockedUrlPatterns:['*forno.celo*','*forno.celo-sepolia*']});
  if(!result)throw new Error('Lighthouse did not return a report');await mkdir('artifacts',{recursive:true});await writeFile('artifacts/lighthouse.json',result.report);
  const scores=Object.fromEntries(Object.entries(result.lhr.categories).map(([k,v])=>[k,v.score]));await writeFile('artifacts/lighthouse-summary.json',JSON.stringify({scope:'Local production static build, mobile simulated throttling; RPC health URLs blocked for repeatability',scores},null,2));console.log(scores);
  if(scores.performance<.8||scores.accessibility<.95)throw new Error('Lighthouse release budget missed');
}finally{await browser.close();}
