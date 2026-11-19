import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {parseJson,redact,field,canonicalize,utf8,EvidenceError,type Json} from '@echoframe/core';

export interface JsonCapture{mode:'json-allowlist';paths:readonly string[];maxBytes?:number;}
export interface BodyObservation{byteCount:number;contentHash:string|null;complete:boolean;reason:string|null;capture:Uint8Array|null;}
export class BodyObserver{
  private readonly hash=createHash('sha256');private size=0;private limited=false;private finalized=false;private readonly chunks:Uint8Array[]=[];
  constructor(private readonly maxBytes:number,private readonly retain:boolean){}
  add(chunk:unknown,encoding?:BufferEncoding):void{
    if(this.finalized||chunk===undefined||chunk===null)return;
    const count=typeof chunk==='string'?Buffer.byteLength(chunk,encoding):chunk instanceof Uint8Array?chunk.byteLength:0;this.size+=count;
    if(!count)return;if(this.size>this.maxBytes){this.limited=true;for(const c of this.chunks)c.fill(0);this.chunks.length=0;return;}
    const bytes=typeof chunk==='string'?Buffer.from(chunk,encoding):chunk as Uint8Array;
    if(!this.limited){this.hash.update(bytes);if(this.retain)this.chunks.push(new Uint8Array(bytes));}
  }
  finish(complete:boolean):BodyObservation{
    if(this.finalized)throw new EvidenceError('BODY_OBSERVATION','Response observation was already finalized');this.finalized=true;
    if(this.limited||!complete){for(const c of this.chunks)c.fill(0);this.chunks.length=0;return {byteCount:this.size,contentHash:null,complete:false,reason:this.limited?'BODY_LIMIT':'RESPONSE_LOST',capture:null};}
    let capture:Uint8Array|null=null;
    if(this.retain){capture=new Uint8Array(this.size);let offset=0;for(const chunk of this.chunks){capture.set(chunk,offset);offset+=chunk.length;chunk.fill(0);}this.chunks.length=0;}
    return {byteCount:this.size,contentHash:'0x'+this.hash.digest('hex'),complete:true,reason:null,capture};
  }
}
const forbidden=/authorization|cookie|credential|signature|nonce|password|secret|private.?key|api.?key|seed|mnemonic|passport/i;
export function validateCapture(capture:JsonCapture):void{
  if(capture.mode!=='json-allowlist'||capture.paths.length<1||capture.paths.length>64)throw new EvidenceError('CAPTURE_CONFIG','Use an explicit allowlist of 1–64 JSON fields');
  for(const path of capture.paths)if(!/^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*){0,12}$/.test(path)||path.split('.').some(p=>['__proto__','prototype','constructor'].includes(p)||forbidden.test(p)))throw new EvidenceError('CAPTURE_CONFIG','Sensitive or unsafe capture path is prohibited');
  if(capture.maxBytes!==undefined&&(!Number.isInteger(capture.maxBytes)||capture.maxBytes<1||capture.maxBytes>2_000_000))throw new EvidenceError('CAPTURE_CONFIG','Capture limit must be between 1 and 2000000 bytes');
}
export function captureProjection(bytes:Uint8Array,capture:JsonCapture):Json{
  validateCapture(capture);if(!bytes.length)return '';
  const parsed=parseJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes),capture.maxBytes??65536),projected:Record<string,Json>={};
  for(const path of capture.paths){const value=field(parsed,path);if(value===undefined)continue;const parts=path.split('.');let target=projected;
    for(const part of parts.slice(0,-1)){if(target[part]===undefined)target[part]={};const next=target[part];if(!next||typeof next!=='object'||Array.isArray(next))throw new EvidenceError('CAPTURE_CONFIG','Overlapping capture paths');target=next;}
    target[parts.at(-1)!]=redact(value);
  }
  if(utf8(canonicalize(projected)).length>(capture.maxBytes??65536))throw new EvidenceError('CAPTURE_LIMIT','Projected JSON exceeds the configured limit');return projected;
}
export function safeMime(value:unknown):string{if(typeof value!=='string')return 'application/octet-stream';const mime=value.split(';')[0]!.trim().toLowerCase();return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mime)&&mime.length<=100?mime:'application/octet-stream';}
