import {mkdir,writeFile,readFile,access} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const version=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version,names=['core','celo','x402','mpp','erc8183','node','react','cli','mcp'];
if(!process.argv[2])throw new Error('Usage: node scripts/install-release.mjs <new-consumer-directory>');
if(Number(process.versions.node.split('.')[0])<24)throw new Error('Node 24+ required');
const target=resolve(process.argv[2]),base=`https://github.com/eshaanvgupta/echoframe/releases/download/v${version}/`;
async function download(name){const r=await fetch(base+name);if(!r.ok)throw new Error(`Release download failed (${r.status}): ${name}`);return Buffer.from(await r.arrayBuffer());}
const sums=new Map((await download(`SHA256SUMS-${version}.txt`)).toString('utf8').trim().split('\n').map(line=>{const m=/^([a-f0-9]{64}) {2}([\w.-]+)$/.exec(line);if(!m)throw new Error('Invalid checksum manifest');return [m[2],m[1]];}));
// Refuse to replace an existing consumer or its files.
await mkdir(target);await mkdir(join(target,'artifacts'));
const tarballs=[];for(const name of names){const file=`echoframe-${name}-${version}.tgz`,bytes=await download(file);if(createHash('sha256').update(bytes).digest('hex')!==sums.get(file))throw new Error(`Checksum mismatch: ${file}`);const path=join(target,'artifacts',file);await writeFile(path,bytes,{flag:'wx'});tarballs.push(path);}
await writeFile(join(target,'package.json'),JSON.stringify({name:'independent-echoframe-consumer',private:true,type:'module'},null,2)+'\n',{flag:'wx'});
let npmCli;for(const candidate of [join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),join(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js'),'/usr/share/nodejs/npm/bin/npm-cli.js'])try{await access(candidate);npmCli=candidate;break;}catch{/* Try conventional runtime layouts. */}
if(!npmCli)throw new Error('npm CLI not found; install the nine downloaded archives together manually');
const result=spawnSync(process.execPath,[npmCli,'install','--ignore-scripts','--no-audit','--no-fund',...tarballs,'react@19.3.1','vitest@5.1.1'],{cwd:target,stdio:'inherit',windowsHide:true});if(result.status!==0)throw new Error('Independent npm install failed');
console.log(JSON.stringify({status:'installed',version,packages:names.length,directory:target,checksums:'SHA-256 matched the public release manifest',npmPublicationClaimed:false}));
