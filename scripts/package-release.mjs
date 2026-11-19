import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version,output=join(root,'artifacts'),web=join(root,'apps/web/dist');
const names=['core','celo','x402','mpp','erc8183','node','react','cli','mcp'];await mkdir(output,{recursive:true});
// Deterministic ZIP/store output. This only archives trusted build files; it never extracts imported archives.
const files=[];async function walk(directory){for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const path=join(directory,entry.name);if(entry.isDirectory())await walk(path);else if(entry.isFile())files.push({name:relative(web,path).replaceAll('\\','/'),bytes:await readFile(path)});}}await walk(web);
if(!files.some(f=>f.name==='_headers')||!files.some(f=>f.name==='_redirects')||!files.some(f=>f.name==='sw.js'))throw new Error('Static deployment assets are incomplete');
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes)crc=table[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;};
const locals=[],central=[];let offset=0;
for(const file of files){const name=Buffer.from(file.name),crc=crc32(file.bytes),size=file.bytes.length,header=Buffer.alloc(30),directory=Buffer.alloc(46);if(size>25*1024*1024)throw new Error('Pages asset exceeds 25MiB');
  header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(0x5d73,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(size,18);header.writeUInt32LE(size,22);header.writeUInt16LE(name.length,26);
  directory.writeUInt32LE(0x02014b50,0);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(0x5d73,14);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(size,20);directory.writeUInt32LE(size,24);directory.writeUInt16LE(name.length,28);directory.writeUInt32LE(offset,42);
  locals.push(header,name,file.bytes);central.push(directory,name);offset+=header.length+name.length+size;
}
const centralBytes=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(centralBytes.length,12);end.writeUInt32LE(offset,16);
const webName=`echoframe-web-${version}.zip`;await writeFile(join(output,webName),Buffer.concat([...locals,centralBytes,end]));
const assets=[];for(const name of [...names.map(n=>`echoframe-${n}-${version}.tgz`),webName]){const bytes=await readFile(join(output,name));assets.push({name,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile(join(output,`SHA256SUMS-${version}.txt`),assets.map(a=>`${a.sha256}  ${a.name}`).join('\n')+'\n');
await writeFile(join(output,`release-${version}.json`),JSON.stringify({version,packageCount:names.length,staticFiles:files.length,publication:{npm:false,website:false},assets},null,2)+'\n');console.log(JSON.stringify({version,packages:names.length,staticFiles:files.length,assets:assets.length,noPublication:true}));
