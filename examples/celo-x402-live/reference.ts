import {hex32} from '@echoframe/core';
/** Reference observations remain APP_REPORTED; this does not verify settlement or the protocol header. */
export function referenceForFinalization(hashes:readonly string[],details:unknown):{transactionHash:string;facilitatorReference?:{transaction:string;success:true}}|undefined{
  if(hashes.length>1)return undefined;
  const d=details!==null&&typeof details==='object'?details as {success?:unknown;transaction?:unknown}:{};
  const persisted=d.success===true&&hex32.safeParse(d.transaction).success?{transaction:d.transaction as string,success:true as const}:undefined;
  const recorded=hashes[0];
  if(recorded&&(!hex32.safeParse(recorded).success||persisted&&persisted.transaction!==recorded))return undefined;
  const transactionHash=recorded??persisted?.transaction;
  return transactionHash?{transactionHash,...(persisted?{facilitatorReference:persisted}:{})}:undefined;
}
