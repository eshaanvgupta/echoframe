import {keccak256,toBytes,verifyTypedData,type Hex} from 'viem';
import {EvidenceError,type Json} from './types.js';

/** RFC 8785 JSON subset: finite I-JSON values, ECMAScript number serialization, UTF-16 sorted keys. */
export function canonicalize(value:unknown,depth=0):string {
  if(depth>48)throw new EvidenceError('LIMIT','JSON nesting exceeds 48');
  if(value===null)return 'null';
  if(typeof value==='string'){
    for(let i=0;i<value.length;i++){
      const c=value.charCodeAt(i);
      if(c>=0xd800&&c<=0xdbff){const n=value.charCodeAt(++i);if(!(n>=0xdc00&&n<=0xdfff))throw new EvidenceError('UNICODE','Unpaired surrogate');}
      else if(c>=0xdc00&&c<=0xdfff)throw new EvidenceError('UNICODE','Unpaired surrogate');
    }
    return JSON.stringify(value);
  }
  if(typeof value==='number'){if(!Number.isFinite(value))throw new EvidenceError('NUMBER','Non-finite JSON number');return JSON.stringify(value);}
  if(typeof value==='boolean')return String(value);
  if(Array.isArray(value))return '['+value.map(v=>canonicalize(v,depth+1)).join(',')+']';
  if(typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype){
    const record=value as Record<string,unknown>;
    const keys=Object.keys(record).sort();
    if(keys.length>10000)throw new EvidenceError('LIMIT','Too many keys');
    if(keys.some(k=>['__proto__','prototype','constructor'].includes(k)))throw new EvidenceError('KEY','Unsafe object key');
    return '{'+keys.map(k=>canonicalize(k)+':'+canonicalize(record[k],depth+1)).join(',')+'}';
  }
  throw new EvidenceError('JSON','Only plain JSON data is supported');
}
export function commitment(domain:string,value:unknown):Hex {
  return keccak256(toBytes(`ECHOFRAME\u0000${domain}\u0000${canonicalize(value)}`));
}
export async function sha256(bytes:Uint8Array):Promise<Hex>{
  const hash=await globalThis.crypto.subtle.digest('SHA-256',new Uint8Array(bytes));
  return ('0x'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')) as Hex;
}
export const utf8=(text:string):Uint8Array=>new TextEncoder().encode(text);
export function encodeBase64(bytes:Uint8Array):string {
  let s='';for(const byte of bytes)s+=String.fromCharCode(byte);return btoa(s);
}
export function decodeBase64(text:string,max=2_000_000):Uint8Array {
  const padding=text.endsWith('==')?2:text.endsWith('=')?1:0;
  if(text.length>Math.ceil(max/3)*4+4||text.length%4!==0||/[^A-Za-z0-9+/=]/.test(text)||text.slice(0,text.length-padding).includes('='))throw new EvidenceError('BASE64','Invalid or oversized encoding');
  let raw:string;try{raw=atob(text);}catch{throw new EvidenceError('BASE64','Invalid encoding');}
  if(raw.length>max)throw new EvidenceError('LIMIT','Decoded data exceeds limit');
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
export function parseJson(text:string,max=8_000_000):Json {
  if(utf8(text).length>max)throw new EvidenceError('LIMIT','JSON exceeds maximum bytes');
  let value:unknown;try{value=JSON.parse(text);}catch{throw new EvidenceError('JSON','Invalid JSON');}
  canonicalize(value);return value as Json;
}
export function bundleTypedData(chainId:number,rootHash:Hex){
  return {domain:{name:'ECHOFRAME',version:'1',chainId},types:{Evidence:[{name:'rootHash',type:'bytes32'}]},primaryType:'Evidence',message:{rootHash}} as const;
}
export async function verifyCommitmentSignature(chainId:number,rootHash:Hex,signer:Hex,signature:Hex):Promise<boolean>{
  try{return await verifyTypedData({...bundleTypedData(chainId,rootHash),address:signer,signature});}catch{return false;}
}
