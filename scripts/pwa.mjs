import {readdir,readFile,writeFile,cp,mkdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),dist=resolve(root,'apps/web/dist');
await mkdir(resolve(dist,'docs'),{recursive:true});
await cp(resolve(root,'THIRD_PARTY_NOTICES.txt'),resolve(dist,'THIRD_PARTY_NOTICES.txt'));
for(const file of await readdir(resolve(root,'docs')))if(file.endsWith('.md'))await cp(resolve(root,'docs',file),resolve(dist,'docs',file));
for(const file of ['grant-evidence.json','release-verification.json']){
  try{await cp(resolve(root,'docs',file),resolve(dist,file));}catch{await writeFile(resolve(dist,file),JSON.stringify({status:'not_yet_recorded'}));}
}
const entries=[];
async function walk(path){for(const file of await readdir(path,{withFileTypes:true})){const p=resolve(path,file.name);if(file.isDirectory())await walk(p);else if(!['_headers','_redirects','sw.js'].includes(file.name))entries.push('/'+relative(dist,p).replaceAll('\\','/'));}}
await walk(dist);const version=createHash('sha256').update((await Promise.all(entries.map(file=>readFile(resolve(dist,'.'+file))))).map(b=>b.toString('base64')).join('')).digest('hex').slice(0,16);
await writeFile(resolve(dist,'sw.js'),`const CACHE='echoframe-${version}';const ASSETS=${JSON.stringify(entries)};self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('echoframe-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/index.html')));return;}if(ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(c=>c.match(url.pathname).then(r=>r||fetch(event.request))));});`);
console.log(`Offline shell ${version}: ${entries.length} static assets. RPC/evidence requests are never cached by the service worker.`);
