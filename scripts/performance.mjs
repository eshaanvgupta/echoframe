import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const server=spawn(process.execPath,[resolve(root,'apps/web/node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','4174','--strictPort'],{cwd:resolve(root,'apps/web'),stdio:'ignore',windowsHide:true});
try{
  let ready=false;
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error('Performance preview failed to start');try{const r=await fetch('http://127.0.0.1:4174/');if(r.ok){ready=true;break;}}catch{/* Wait for the owned preview. */}await new Promise(r=>setTimeout(r,100));}
  if(!ready)throw new Error('Performance preview readiness timeout');
  const auditScript=resolve(root,'scripts/lighthouse.mjs');
  const code=await new Promise((complete,reject)=>{const child=spawn(process.execPath,[auditScript],{cwd:root,stdio:'inherit',env:{...process.env,ECHOFRAME_AUDIT_URL:'http://127.0.0.1:4174/'},windowsHide:true});child.once('error',reject);child.once('exit',complete);});if(code!==0)throw new Error('Lighthouse audit failed');
}finally{server.kill();}
