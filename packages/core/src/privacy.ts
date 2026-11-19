import {canonicalize,commitment} from './crypto.js';
import {type Json,EvidenceError} from './types.js';

const denied=/authorization|cookie|jwt|password|secret|signature|seed|mnemonic|private.?key|api.?key|passport|e.?mail|phone|address|tokenvalue|credential|rawtransaction|signeddata|^path$|^url$/i;
const secretValue=/\bBearer\s+\S+|\bPayment\s+[A-Za-z0-9_-]{16,}|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|-----BEGIN .*PRIVATE KEY-----|\b0x(?:[0-9a-f]{64}|[0-9a-f]{128}|[0-9a-f]{130})\b/i;
export function redact(value:unknown,depth=0):Json {
  if(depth>40)throw new EvidenceError('LIMIT','Redaction nesting limit');
  if(value===null||typeof value==='boolean'||typeof value==='number')return value;
  if(typeof value==='string')return secretValue.test(value)?'[REDACTED]':value.slice(0,100000);
  if(Array.isArray(value))return value.slice(0,5000).map(v=>redact(v,depth+1));
  if(typeof value==='object'){
    const result:Record<string,Json>={};
    for(const [k,v]of Object.entries(value)){
      if(['__proto__','constructor','prototype'].includes(k))continue;
      result[k]=denied.test(k)?'[REDACTED]':redact(v,depth+1);
    }
    return result;
  }
  return '[UNSUPPORTED]';
}
/** Recorder boundary: never persist arbitrary HTTP headers, URLs, bodies, or credentials. */
export function safeHttpMetadata(input:{method:string;status?:number;requestId:string;url?:string;headers?:Record<string,string>}):Json {
  return {method:input.method.slice(0,16),requestIdHash:commitment('request-id',input.requestId),status:input.status??null,routeHash:commitment('route',input.url??''),headers: Object.fromEntries(Object.entries(input.headers??{}).filter(([k])=>['content-type','content-length','retry-after'].includes(k.toLowerCase())).map(([k,v])=>[k.toLowerCase(),redact(v)]))};
}
export function deterministicDiff(expected:Json,observed:Json,path='$'):Array<{path:string;expected:Json;observed:Json}>{
  if(canonicalize(expected)===canonicalize(observed))return [];
  if(expected&&observed&&typeof expected==='object'&&typeof observed==='object'&&!Array.isArray(expected)&&!Array.isArray(observed)){
    return [...new Set([...Object.keys(expected),...Object.keys(observed)])].sort().flatMap(k=>deterministicDiff(expected[k]??null,observed[k]??null,`${path}.${k}`)).map(d=>({...d,expected:redact(d.expected),observed:redact(d.observed)}));
  }
  return [{path,expected:denied.test(path)?'[REDACTED]':redact(expected),observed:denied.test(path)?'[REDACTED]':redact(observed)}];
}
export async function encryptFile(bytes:Uint8Array,passphrase:string):Promise<string>{
  if(bytes.length>8_000_000)throw new EvidenceError('LIMIT','Plaintext exceeds 8MB');
  if(passphrase.length<12)throw new EvidenceError('PASSPHRASE','Use at least 12 characters');
  if(passphrase.length>1024)throw new EvidenceError('PASSPHRASE','Passphrase exceeds 1024 characters');
  const {encodeBase64}=await import('./crypto.js');
  const salt=crypto.getRandomValues(new Uint8Array(16));const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveKey(passphrase,salt);
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('ECHOFRAME:1')},key,new Uint8Array(bytes));
  return JSON.stringify({format:'echoframe-encrypted-v1',kdf:'PBKDF2-SHA256',iterations:310000,salt:encodeBase64(salt),iv:encodeBase64(iv),ciphertext:encodeBase64(new Uint8Array(encrypted))});
}
async function deriveKey(pass:string,salt:Uint8Array){
  const raw=new TextEncoder().encode(pass);try{const material=await crypto.subtle.importKey('raw',raw,'PBKDF2',false,['deriveKey']);return await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:new Uint8Array(salt),iterations:310000},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}finally{raw.fill(0);}
}
export async function decryptFile(text:string,passphrase:string):Promise<Uint8Array>{
  if(passphrase.length>1024)throw new EvidenceError('PASSPHRASE','Passphrase exceeds 1024 characters');
  const {parseJson,decodeBase64}=await import('./crypto.js');const parsed=parseJson(text,11_000_000);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed).some(k=>!['format','kdf','iterations','salt','iv','ciphertext'].includes(k)))throw new EvidenceError('ENCRYPTION','Unsupported encrypted envelope');const data=parsed;
  if(data.format!=='echoframe-encrypted-v1'||data.kdf!=='PBKDF2-SHA256'||data.iterations!==310000||typeof data.salt!=='string'||typeof data.iv!=='string'||typeof data.ciphertext!=='string')throw new EvidenceError('ENCRYPTION','Unsupported encrypted file');
  const salt=decodeBase64(data.salt,16),iv=decodeBase64(data.iv,12);if(salt.length!==16||iv.length!==12)throw new EvidenceError('ENCRYPTION','Invalid encryption parameters');
  try{return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(iv),additionalData:new TextEncoder().encode('ECHOFRAME:1')},await deriveKey(passphrase,salt),new Uint8Array(decodeBase64(data.ciphertext,8_000_016))));}catch{throw new EvidenceError('DECRYPT','Wrong passphrase or altered file');}
}
