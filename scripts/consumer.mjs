import {spawnSync} from 'node:child_process';
import {mkdir,writeFile,readFile,mkdtemp,rm,cp,access} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve(import.meta.dirname,'..'),artifacts=join(root,'artifacts'),names=['core','celo','x402','mpp','erc8183','node','react','cli','mcp'];
const runner=process.env.npm_execpath;if(!runner)throw new Error('Run this check with pnpm test:consumer');
await mkdir(artifacts,{recursive:true});
function run(args,cwd){const r=spawnSync(process.execPath,args,{cwd,encoding:'utf8',maxBuffer:8_000_000,env:{...process.env,CI:'1'}});if(r.status!==0)throw new Error((r.stdout??'')+'\n'+(r.stderr??''));return r.stdout;}
for(const name of names){await cp(join(root,'LICENSE'),join(root,'packages',name,'LICENSE'));run([runner,'pack','--pack-destination',artifacts],join(root,'packages',name));}
const consumer=await mkdtemp(join(tmpdir(),'echoframe-consumer-'));
if(dirname(consumer)!==resolve(tmpdir())||!consumer.includes('echoframe-consumer-'))throw new Error('Unexpected temporary cleanup target');
try{
  await writeFile(join(consumer,'package.json'),JSON.stringify({name:'independent-echoframe-consumer',private:true,type:'module',packageManager:'pnpm@10.34.9'}));
  const versions=Object.fromEntries(await Promise.all(names.map(async name=>[name,JSON.parse(await readFile(join(root,'packages',name,'package.json'),'utf8')).version])));
  const tarballs=names.map(name=>join(artifacts,`echoframe-${name}-${versions[name]}.tgz`));
  let npmCli;
  for(const candidate of [join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),join(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js'),'/usr/share/nodejs/npm/bin/npm-cli.js']){try{await access(candidate);npmCli=candidate;break;}catch{/* Try the next conventional Node installation layout. */}}
  if(!npmCli)throw new Error('Cannot locate the Node installation npm CLI');
  run([npmCli,'install','--ignore-scripts','--no-audit','--no-fund',...tarballs,'react@19.3.1','vitest@5.1.1'],consumer);
  const smoke=`import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';\n${names.map(n=>`import * as ${n==='node'?'nodeSdk':n} from '@echoframe/${n}';`).join('\n')}\nconst b=await core.scenarioBundle();assert.equal((await core.verifyBundle(b)).integrity,'VALID');assert.equal(typeof celo.reconcile,'function');assert.equal(typeof x402.parseX402Challenge,'function');assert.equal(typeof mpp.parseMppChallenge,'function');assert.equal(typeof erc8183.decodeJobLogs,'function');const j=new nodeSdk.SqliteAttemptJournal(':memory:');assert.equal((await j.list()).length,0);j.close();const instrumentation=await nodeSdk.runRecorderSelfTest();assert.equal(instrumentation.passed,true);await writeFile('trace-regression.test.ts',await core.generateTraceRegression(b,{includeCompleteEvidence:true}));assert.equal(typeof react.StatusBadge,'function');assert.equal(typeof cli.runCli,'function');assert.equal(mcp.toolNames.length,6);await writeFile('independent.echoframe.json',JSON.stringify(b));console.log('All nine installed ESM packages imported and exercised.');`;
  await writeFile(join(consumer,'smoke.mjs'),smoke);console.log(run([join(consumer,'smoke.mjs')],consumer).trim());
  const output=run([join(consumer,'node_modules/@echoframe/cli/dist/index.js'),'verify','independent.echoframe.json','--json'],consumer);if(JSON.parse(output).integrity!=='VALID')throw new Error('Installed CLI verification failed');
  await cp(join(root,'scenarios'),join(consumer,'scenarios'),{recursive:true});
  await cp(join(root,'docs/evidence'),join(consumer,'evidence'),{recursive:true});
  run([join(root,'node_modules/vitest/vitest.mjs'),'run','--reporter=json','--outputFile=regression-results.json'],consumer);
  const tests=JSON.parse(await readFile(join(consumer,'regression-results.json'),'utf8'));if(tests.numFailedTests!==0||tests.numPassedTests<18)throw new Error('Installed regression tests did not all pass');
  const report={status:'passed',packages:names.map(n=>`@echoframe/${n}`),installedCliVerdict:'VALID',installedGeneratedRegressionTests:tests.numPassedTests,installedRecorderSelfTest:true,temporaryConsumer:true,noNpmPublication:true};await writeFile(join(artifacts,'consumer-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await rm(consumer,{recursive:true,force:true});}
