import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const runner=process.env.npm_execpath;if(!runner)throw new Error('Run through pnpm release:check');
await mkdir('artifacts',{recursive:true});
let gates=[];
if(process.argv.includes('--resume')){const previous=JSON.parse(await readFile('artifacts/gate-results.json','utf8'));for(const gate of previous.gates){if(gate.exitCode!==0)break;gates.push(gate);}console.log(`Retaining ${gates.length} successful gates; use resume only when those inputs are unchanged.`);}
const commands=[['install','--frozen-lockfile'],['typecheck'],['lint'],['test'],['audit:licenses'],['build'],['test:consumer'],['test:e2e'],['test:performance'],['audit','--audit-level','moderate','--json']];
for(const args of commands.slice(gates.length)){
  const started=Date.now();console.log(`Checking ${args.join(' ')}`);let output='';
  const exitCode=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[runner,...args],{stdio:['ignore','pipe','pipe'],windowsHide:true});child.stdout.on('data',b=>{const text=b.toString();output+=text;process.stdout.write(text);});child.stderr.on('data',b=>{output+=b.toString();process.stderr.write(b);});child.once('error',reject);child.once('exit',resolve);});
  await writeFile(`artifacts/gate-${args[0].replaceAll(':','-')}.log`,output);
  if(args[0]==='audit')await writeFile('artifacts/dependency-audit.json',output.trim());
  gates.push({command:`pnpm ${args.join(' ')}`,exitCode,elapsedMs:Date.now()-started,status:exitCode===0?'passed':'failed'});
  await writeFile('artifacts/gate-results.json',JSON.stringify({node:process.version,platform:process.platform,checkedAt:new Date().toISOString(),gates},null,2));
  if(exitCode!==0)throw new Error(`Release gate failed: ${args.join(' ')}`);
}
const unit=JSON.parse(await readFile('artifacts/unit-results.json','utf8')),e2e=JSON.parse(await readFile('artifacts/e2e-results.json','utf8'));
console.log(JSON.stringify({status:'passed',unitTests:unit.numPassedTests,e2e:e2e.stats,gates:gates.length}));
