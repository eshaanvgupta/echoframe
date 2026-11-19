import {mkdir,writeFile} from 'node:fs/promises';
import {scenarios,scenarioBundle,runScenario,fixAndRerun,generateRegression} from '../packages/core/src/index.js';
import {xHeader,mHeader,mReceipt,responseHeader,receipt} from '../test/fixtures.js';
await mkdir('scenarios',{recursive:true});await mkdir('fixtures',{recursive:true});await mkdir('apps/web/public/examples',{recursive:true});
for(const scenario of scenarios){
  const before=runScenario(scenario.id),after=fixAndRerun(before);
  await writeFile(`scenarios/${scenario.id}.json`,JSON.stringify({environment:'SIMULATED',before,after},null,2));
  await writeFile(`scenarios/${scenario.id}.test.ts`,generateRegression(before));
  await writeFile(`fixtures/${scenario.id}.echoframe.json`,JSON.stringify(await scenarioBundle(scenario.id),null,2));
}
await writeFile('fixtures/protocol-headers.json',JSON.stringify({environment:'SIMULATED',x402:{paymentRequired:xHeader(),paymentResponse:responseHeader()},mpp:{challenge:mHeader(),receipt:mReceipt()}},null,2));
await writeFile('fixtures/erc20-receipt.json',JSON.stringify({environment:'SIMULATED',receipt:receipt()},null,2));
await writeFile('apps/web/public/examples/paid-but-not-delivered.echoframe.json',JSON.stringify(await scenarioBundle(),null,2));
console.log('Generated 16 synthetic case bundles, replay comparisons and executable regression tests.');
