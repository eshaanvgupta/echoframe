import {readdir,lstat,readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),store=join(root,'node_modules/.pnpm'),records=new Map();let notices='ECHOFRAME third-party dependency notices\nGenerated from exact installed package manifests and license files.\n\n';
for(const entry of await readdir(store,{withFileTypes:true})){
  if(!entry.isDirectory()||entry.name==='node_modules')continue;const modules=join(store,entry.name,'node_modules');let dirs;try{dirs=await readdir(modules);}catch{continue;}
  const candidates=[];for(const name of dirs){if(name.startsWith('@')){for(const child of await readdir(join(modules,name)))candidates.push(join(modules,name,child));}else if(!name.startsWith('.'))candidates.push(join(modules,name));}
  for(const path of candidates){if((await lstat(path)).isSymbolicLink())continue;let pkg;try{pkg=JSON.parse(await readFile(join(path,'package.json'),'utf8'));}catch{continue;}const key=`${pkg.name}@${pkg.version}`;if(records.has(key))continue;const license=typeof pkg.license==='string'?pkg.license:pkg.license?.type??'UNDECLARED';records.set(key,{name:pkg.name,version:pkg.version,license});
    const files=(await readdir(path)).filter(f=>/^licen[sc]e(?:\.|$)|^copying$/i.test(f));for(const file of files){try{notices+=`\n===== ${key} (${license}) : ${file} =====\n${await readFile(join(path,file),'utf8')}\n`;}catch{/* Non-file notices are represented by the manifest license. */}}
  }
}
const packages=[...records.values()].sort((a,b)=>a.name.localeCompare(b.name));const incompatible=packages.filter(p=>/BUSL|SSPL|UNLICENSED|proprietary/i.test(p.license));const unknown=packages.filter(p=>p.license==='UNDECLARED');
await mkdir(join(root,'artifacts'),{recursive:true});const report={status:incompatible.length||unknown.length?'review_required':'passed',packageCount:packages.length,incompatible,unknown,packages};await writeFile(join(root,'artifacts/license-audit.json'),JSON.stringify(report,null,2));await writeFile(join(root,'THIRD_PARTY_NOTICES.txt'),notices);
for(const name of ['core','celo','x402','mpp','erc8183','node','react','cli','mcp'])await cp(join(root,'LICENSE'),join(root,'packages',name,'LICENSE'));
console.log(JSON.stringify({status:report.status,packageCount:packages.length,incompatible,unknown}));if(incompatible.length||unknown.length)process.exitCode=1;
