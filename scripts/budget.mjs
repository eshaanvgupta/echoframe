import {readdir,stat,readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
const assets='apps/web/dist/assets';const files=await readdir(assets);let js=0,css=0,total=0;
for(const file of files){const data=await readFile(`${assets}/${file}`);total+=data.length;const gz=gzipSync(data).length;if(file.endsWith('.js'))js+=gz;if(file.endsWith('.css'))css+=gz;if((await stat(`${assets}/${file}`)).size>25*1024*1024)throw new Error('Static asset exceeds Pages file limit');}
const report={javascriptGzipBytes:js,cssGzipBytes:css,totalAssetBytes:total,budgets:{javascriptGzipBytes:350000,cssGzipBytes:40000},reason:'Includes offline cryptography, safe DSL, strict adapters and IndexedDB. No network font or image dependencies.'};
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/bundle-budget.json',JSON.stringify(report,null,2));console.log(report);if(js>350000||css>40000)throw new Error('Bundle budget exceeded');
