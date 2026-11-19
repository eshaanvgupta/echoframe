import {z} from 'zod';
import {verifyMessage,type Hex} from 'viem';
import {address,hex32,jsonValue,type Json,EvidenceError} from './types.js';
import {canonicalize,commitment,decodeBase64,sha256,utf8,verifyCommitmentSignature} from './crypto.js';

const path=z.string().regex(/^(\$|[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*|\.[0-9]+)*)$/).max(200);
export const ruleSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('presence')}).strict(),
  z.object({kind:z.literal('http'),min:z.number().int().min(100).max(599),max:z.number().int().min(100).max(599)}).strict(),
  z.object({kind:z.literal('required'),paths:z.array(path).min(1).max(100)}).strict(),
  z.object({kind:z.literal('type'),path,type:z.enum(['string','number','boolean','object','array','null'])}).strict(),
  z.object({kind:z.literal('equals'),path,value:jsonValue}).strict(),
  z.object({kind:z.literal('range'),path,min:z.number().finite(),max:z.number().finite()}).strict(),
  z.object({kind:z.literal('freshness'),path,maxAgeSeconds:z.number().int().min(0).max(31536000)}).strict(),
  z.object({kind:z.literal('schema'),schema:z.record(z.string(),jsonValue)}).strict(),
  z.object({kind:z.literal('file'),mime:z.string().max(100),maxBytes:z.number().int().min(0).max(2_000_000)}).strict(),
  z.object({kind:z.literal('sha256'),expected:hex32}).strict(),
  z.object({kind:z.literal('crossCheck'),path,tolerance:z.number().min(0).max(1e12)}).strict(),
  z.object({kind:z.literal('math'),operation:z.enum(['sum','difference','product','ratio']),paths:z.array(path).min(2).max(20),expected:z.number().finite(),tolerance:z.number().min(0).max(1e6)}).strict(),
  z.object({kind:z.literal('sourceSignature'),signer:address}).strict(),
  z.object({kind:z.literal('regex'),path,pattern:z.string().max(100)}).strict(),
  z.object({kind:z.literal('subjective'),question:z.string().min(1).max(500)}).strict()
]);
export const manifestSchema=z.object({version:z.literal('1.0.0'),name:z.string().min(1).max(120),now:z.iso.datetime(),rules:z.array(ruleSchema).min(1).max(100)}).strict();
export type ValidatorManifest=z.infer<typeof manifestSchema>;
export const outcomeInputSchema=z.object({body:jsonValue,status:z.number().int().min(100).max(599),file:z.object({mime:z.string().max(100),bytesBase64:z.string().max(2_700_000)}).strict().optional(),crossCheck:jsonValue.optional(),sourceSignature:z.string().regex(/^0x[0-9a-fA-F]{130}$/).optional()}).strict();
export type OutcomeInput=z.infer<typeof outcomeInputSchema>;
export interface CheckResult{index:number;kind:string;status:'PASS'|'FAIL'|'NOT_MACHINE_VERIFIABLE';detail:string;}
export interface OutcomeResult{verdict:'TESTED_PASS'|'TESTED_FAIL'|'NOT_MACHINE_VERIFIABLE';checks:CheckResult[];manifestHash:Hex;contentHash:Hex;inputHash:Hex;}
export interface OutcomeProof{version:'1.0.0';eventId:string;chainId:42220|11142220;manifest:ValidatorManifest;input:OutcomeInput;result:OutcomeResult;proofHash:Hex;signature?:{signer:Hex;value:Hex};}
export const field=(value:Json,key:string):Json|undefined=>{
  if(key==='$')return value;let current:Json|undefined=value;
  for(const part of key.split('.')){
    if(['__proto__','prototype','constructor'].includes(part))return undefined;
    if(current===null||typeof current!=='object')return undefined;
    current=Array.isArray(current)?current[Number(part)]:(current as Record<string,Json>)[part];
  }return current;
};
const typeOf=(v:unknown)=>v===null?'null':Array.isArray(v)?'array':typeof v;
const schemaKeys=new Set(['type','properties','required','additionalProperties','items','minimum','maximum','minLength','maxLength','minItems','maxItems','enum','const']);
function validateSchemaDefinition(schema:Record<string,Json>,depth=0):void{
  if(depth>12)throw new EvidenceError('SCHEMA_LIMIT','Schema nesting exceeds 12');
  for(const key of Object.keys(schema))if(!schemaKeys.has(key))throw new EvidenceError('UNSUPPORTED_SCHEMA',`Keyword ${key} is outside the safe subset`);
  const props=schema.properties;
  if(props!==undefined){if(!props||typeof props!=='object'||Array.isArray(props))throw new EvidenceError('SCHEMA','properties must be an object');for(const sub of Object.values(props)){if(!sub||typeof sub!=='object'||Array.isArray(sub))throw new EvidenceError('SCHEMA','Property definition must be a schema');validateSchemaDefinition(sub,depth+1);}}
  if(schema.items!==undefined){if(!schema.items||typeof schema.items!=='object'||Array.isArray(schema.items))throw new EvidenceError('SCHEMA','items must be a schema');validateSchemaDefinition(schema.items,depth+1);}
}
export function testSafeSchema(schema:Record<string,Json>,value:Json):boolean{validateSchemaDefinition(schema);return checkSchema(schema,value);}
export function hasResponse(value:Json):boolean{return value!==null&&value!==''&&(!Array.isArray(value)||value.length>0);}
function checkSchema(schema:Record<string,Json>,value:Json,depth=0):boolean {
  if(depth>12)throw new EvidenceError('SCHEMA_LIMIT','Schema nesting exceeds 12');
  for(const key of Object.keys(schema))if(!schemaKeys.has(key))throw new EvidenceError('UNSUPPORTED_SCHEMA',`Keyword ${key} is outside the safe subset`);
  if(schema.type!==undefined&&(!['object','array','number','integer','string','boolean','null'].includes(String(schema.type))))throw new EvidenceError('UNSUPPORTED_SCHEMA','Invalid type');
  if(schema.type!==undefined&&(schema.type==='integer'?!(typeof value==='number'&&Number.isSafeInteger(value)):typeOf(value)!==schema.type))return false;
  if(schema.enum!==undefined&&(!Array.isArray(schema.enum)||!schema.enum.some(v=>canonicalize(v)===canonicalize(value))))return false;
  if(schema.const!==undefined&&canonicalize(schema.const)!==canonicalize(value))return false;
  for(const key of ['minimum','maximum','minLength','maxLength','minItems','maxItems'])if(schema[key]!==undefined&&(typeof schema[key]!=='number'||!Number.isFinite(schema[key])))throw new EvidenceError('SCHEMA','Constraint must be a finite number');
  if(typeof value==='number'&&((typeof schema.minimum==='number'&&value<schema.minimum)||(typeof schema.maximum==='number'&&value>schema.maximum)))return false;
  if(typeof value==='string'&&((typeof schema.minLength==='number'&&[...value].length<schema.minLength)||(typeof schema.maxLength==='number'&&[...value].length>schema.maxLength)))return false;
  if(Array.isArray(value)){
    if((typeof schema.minItems==='number'&&value.length<schema.minItems)||(typeof schema.maxItems==='number'&&value.length>schema.maxItems))return false;
    if(schema.items!==undefined){if(!schema.items||typeof schema.items!=='object'||Array.isArray(schema.items))throw new EvidenceError('SCHEMA','items must be a schema');if(!value.every(v=>checkSchema(schema.items as Record<string,Json>,v,depth+1)))return false;}
  }
  if(value&&typeof value==='object'&&!Array.isArray(value)){
    const props=schema.properties??{};
    if(!props||typeof props!=='object'||Array.isArray(props))throw new EvidenceError('SCHEMA','properties must be an object');
    if(schema.required!==undefined&&(!Array.isArray(schema.required)||!schema.required.every(k=>typeof k==='string')))throw new EvidenceError('SCHEMA','required must be strings');
    if(Array.isArray(schema.required)&&!schema.required.every(k=>typeof k==='string'&&Object.hasOwn(value,k)))return false;
    if(schema.additionalProperties!==undefined&&typeof schema.additionalProperties!=='boolean')throw new EvidenceError('SCHEMA','Only boolean additionalProperties is supported');
    if(schema.additionalProperties===false&&Object.keys(value).some(k=>!Object.hasOwn(props,k)))return false;
    for(const [key,sub]of Object.entries(props)){
      if(!sub||typeof sub!=='object'||Array.isArray(sub))throw new EvidenceError('SCHEMA','Property definition must be schema');
      if(Object.hasOwn(value,key)&&!checkSchema(sub,value[key]!,depth+1))return false;
    }
  }
  return true;
}
export async function runOutcome(manifestInput:unknown,inputValue:unknown):Promise<OutcomeResult>{
  canonicalize(manifestInput);canonicalize(inputValue);
  const manifest=manifestSchema.parse(manifestInput),input=outcomeInputSchema.parse(inputValue);
  if(utf8(canonicalize(input)).length>3_000_000)throw new EvidenceError('LIMIT','Outcome input too large');
  const bytes=input.file?decodeBase64(input.file.bytesBase64):utf8(canonicalize(input.body));
  const contentHash=await sha256(bytes);const checks:CheckResult[]=[];
  for(const [index,rule]of manifest.rules.entries()){
    let ok=false;let detail='Deterministic condition not satisfied';
    const get=(p:string)=>field(input.body,p);
    switch(rule.kind){
      case 'presence':ok=hasResponse(input.body);break;
      case 'http':ok=input.status>=rule.min&&input.status<=rule.max;break;
      case 'required':ok=rule.paths.every(p=>get(p)!==undefined);break;
      case 'type':ok=typeOf(get(rule.path))===rule.type;break;
      case 'equals':ok=get(rule.path)!==undefined&&canonicalize(get(rule.path))===canonicalize(rule.value);break;
      case 'range':{const v=get(rule.path);ok=typeof v==='number'&&v>=rule.min&&v<=rule.max;break;}
      case 'freshness':{const v=get(rule.path);const time=typeof v==='string'?Date.parse(v):NaN;const age=(Date.parse(manifest.now)-time)/1000;ok=Number.isFinite(age)&&age>=0&&age<=rule.maxAgeSeconds;break;}
      case 'schema':ok=testSafeSchema(rule.schema,input.body);break;
      case 'file':ok=!!input.file&&input.file.mime===rule.mime&&bytes.length<=rule.maxBytes;detail='Declared MIME and exact byte count only; MIME is not content authenticity';break;
      case 'sha256':ok=contentHash===rule.expected;detail='Bytes match the selected commitment; quality is not established';break;
      case 'crossCheck':{const v=get(rule.path),other=input.crossCheck===undefined?undefined:field(input.crossCheck,rule.path);ok=typeof v==='number'&&typeof other==='number'&&Math.abs(v-other)<=rule.tolerance;detail='Compared supplied independent input; independence is not established';break;}
      case 'math':{const values=rule.paths.map(get);if(values.every(v=>typeof v==='number')){const ns=values as number[];let n=ns[0]!;for(const v of ns.slice(1))n=rule.operation==='sum'?n+v:rule.operation==='difference'?n-v:rule.operation==='product'?n*v:n/v;ok=Number.isFinite(n)&&Math.abs(n-rule.expected)<=rule.tolerance;}break;}
      case 'sourceSignature':ok=!!input.sourceSignature&&await verifyMessage({address:rule.signer as Hex,message:{raw:contentHash},signature:input.sourceSignature as Hex}).catch(()=>false);detail='Personal-sign signature over SHA-256 bytes; signer identity/trust remains external';break;
      case 'regex':{
        // Deliberately narrow: literal strings, or one alphanumeric class with a bounded quantifier.
        if(!/^\^[A-Za-z0-9 _.-]{1,80}\$$/.test(rule.pattern)&&!/^\^\[[A-Za-z0-9\\d\\s-]{1,40}\]\{[0-9]{1,2},[0-9]{1,2}\}\$$/.test(rule.pattern))throw new EvidenceError('REGEX','Only anchored literal or single bounded character class is supported');
        const v=get(rule.path);ok=typeof v==='string'&&v.length<=4096&&new RegExp(rule.pattern,'u').test(v);break;
      }
      case 'subjective':checks.push({index,kind:rule.kind,status:'NOT_MACHINE_VERIFIABLE',detail:rule.question});continue;
    }
    checks.push({index,kind:rule.kind,status:ok?'PASS':'FAIL',detail:ok?(detail==='Deterministic condition not satisfied'?'Condition satisfied':detail):detail});
  }
  return {verdict:checks.some(c=>c.status==='FAIL')?'TESTED_FAIL':checks.some(c=>c.status==='NOT_MACHINE_VERIFIABLE')?'NOT_MACHINE_VERIFIABLE':'TESTED_PASS',checks,manifestHash:commitment('validator-manifest-v1',manifest),contentHash,inputHash:commitment('outcome-input-v1',input)};
}
export async function createOutcomeProof(eventId:string,chainId:42220|11142220,manifest:ValidatorManifest,input:OutcomeInput):Promise<OutcomeProof>{
  if(!/^[\w.-]{1,100}$/.test(eventId))throw new EvidenceError('EVENT','Invalid event identifier');
  const base={version:'1.0.0' as const,eventId,chainId,manifest:manifestSchema.parse(manifest),input:outcomeInputSchema.parse(input),result:await runOutcome(manifest,input)};
  return {...base,proofHash:commitment('outcome-proof-v1',base)};
}
export async function verifyOutcomeProof(value:unknown):Promise<{valid:boolean;errors:string[]}>{
  const errors:string[]=[];
  try{
    canonicalize(value);const p=value as OutcomeProof;
    if(p.version!=='1.0.0'||![42220,11142220].includes(p.chainId))throw new EvidenceError('PROOF','Unsupported version or chain');
    const fresh=await createOutcomeProof(p.eventId,p.chainId,p.manifest,p.input);
    if(canonicalize(fresh.result)!==canonicalize(p.result)||fresh.proofHash!==p.proofHash)errors.push('Outcome proof does not reproduce');
    if(p.signature&&!await verifyCommitmentSignature(p.chainId,p.proofHash,p.signature.signer,p.signature.value))errors.push('Invalid verifier signature');
  }catch(e){errors.push(e instanceof Error?e.message:String(e));}
  return {valid:errors.length===0,errors};
}
export const outcomeExamples:Record<string,{manifest:ValidatorManifest;input:OutcomeInput}>={
  rates:{manifest:{version:'1.0.0',name:'Structured market rate',now:'2026-01-01T12:00:00.000Z',rules:[{kind:'presence'},{kind:'http',min:200,max:299},{kind:'schema',schema:{type:'object',required:['pair','rate','asOf'],additionalProperties:false,properties:{pair:{type:'string'},rate:{type:'number',minimum:0.0001,maximum:1000000},asOf:{type:'string'}}}},{kind:'freshness',path:'asOf',maxAgeSeconds:3600}]},input:{status:200,body:{pair:'CELO/USD',rate:0.41,asOf:'2026-01-01T11:59:00.000Z'}}},
  weather:{manifest:{version:'1.0.0',name:'Weather structure',now:'2026-01-01T12:00:00.000Z',rules:[{kind:'required',paths:['temperatureC','location']},{kind:'range',path:'temperatureC',min:-90,max:60},{kind:'subjective',question:'Does this report accurately describe the weather at the claimed location?'}]},input:{status:200,body:{temperatureC:23,location:'Bengaluru'}}},
  job:{manifest:{version:'1.0.0',name:'Job totals',now:'2026-01-01T12:00:00.000Z',rules:[{kind:'required',paths:['completed','failed']},{kind:'math',operation:'sum',paths:['completed','failed'],expected:10,tolerance:0}]},input:{status:200,body:{completed:9,failed:1}}},
  content:{manifest:{version:'1.0.0',name:'Content envelope',now:'2026-01-01T12:00:00.000Z',rules:[{kind:'file',mime:'text/plain',maxBytes:1024},{kind:'presence'}]},input:{status:200,body:'hello',file:{mime:'text/plain',bytesBase64:'aGVsbG8='}}}
};
