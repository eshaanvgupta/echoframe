import {readdir,readFile,writeFile,cp,mkdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),pages=process.argv.includes('--pages'),base=pages?'/echoframe/':'/',dist=resolve(root,'apps/web',pages?'dist-pages':'dist');
await mkdir(resolve(dist,'docs'),{recursive:true});
await cp(resolve(root,'THIRD_PARTY_NOTICES.txt'),resolve(dist,'THIRD_PARTY_NOTICES.txt'));
for(const file of await readdir(resolve(root,'docs')))if(file.endsWith('.md'))await cp(resolve(root,'docs',file),resolve(dist,'docs',file));
await cp(resolve(root,'docs/evidence'),resolve(dist,'docs/evidence'),{recursive:true});
for(const file of ['grant-evidence.json','release-verification.json','publication.json']){
  try{await cp(resolve(root,'docs',file),resolve(dist,file));await cp(resolve(root,'docs',file),resolve(dist,'docs',file));}catch{await writeFile(resolve(dist,file),JSON.stringify({status:'not_yet_recorded'}));}
}
// Pages ignores Cloudflare _headers. frame-ancestors must remain a response header there.
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://forno.celo.org https://forno.celo-sepolia.celo-testnet.org; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";
const index=(await readFile(resolve(dist,'index.html'),'utf8')).replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+csp+'"><meta name="referrer" content="no-referrer">');
await writeFile(resolve(dist,'index.html'),index);await writeFile(resolve(dist,'404.html'),index);await writeFile(resolve(dist,'.nojekyll'),'');
// Physical documents give supported deep links HTTP 200 on GitHub Pages.
for(const route of ['explorer','lab','studio','journal','vault','developers','grant','about/methodology','story']){
  await mkdir(resolve(dist,route),{recursive:true});await writeFile(resolve(dist,route,'index.html'),index);
}
const manifest=JSON.parse(await readFile(resolve(dist,'manifest.webmanifest'),'utf8'));
Object.assign(manifest,{id:base,start_url:base,scope:base});manifest.icons=manifest.icons.map(icon=>({...icon,src:base+icon.src.replace(/^\//,'')}));await writeFile(resolve(dist,'manifest.webmanifest'),JSON.stringify(manifest));
try{await cp(resolve(root,'artifacts/echoframe-grant-1.1.0.html'),resolve(dist,'docs/grant-presentation.html'));}catch(error){if(error.code!=='ENOENT')throw error;}
const entries=[];
async function walk(path){for(const file of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=resolve(path,file.name);if(file.isDirectory())await walk(p);else if(!['_headers','_redirects','sw.js','.nojekyll'].includes(file.name))entries.push(base+relative(dist,p).replaceAll('\\','/'));}}
await walk(dist);const version=createHash('sha256').update(base).update((await Promise.all(entries.map(file=>readFile(resolve(dist,file.slice(base.length)))))).map(b=>b.toString('base64')).join('')).digest('hex').slice(0,16);
const prefix='echoframe-'+createHash('sha256').update(base).digest('hex').slice(0,8)+'-';
await writeFile(resolve(dist,'sw.js'),`const BASE=${JSON.stringify(base)};const PREFIX=${JSON.stringify(prefix)};const CACHE=PREFIX+'${version}';const ASSETS=${JSON.stringify(entries)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match(BASE+'index.html')));return;}if(ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(c=>c.match(url.pathname).then(r=>r||fetch(event.request))));});`);
console.log(`Offline shell ${version}: ${entries.length} static assets at ${base}. RPC and private evidence requests are never cached.`);
