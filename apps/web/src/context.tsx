import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from 'react';
import {scenarioBundle,verifyBundle,importBundle,type EvidenceBundle,type VerificationReport} from '@echoframe/core';
import {ReadonlyRpc} from '@echoframe/celo';
import {errorText} from './utils.js';
interface AppState{bundle:EvidenceBundle|null;report:VerificationReport|null;load:(bundle:EvidenceBundle)=>Promise<void>;loadText:(text:string)=>Promise<void>;notify:(message:string,error?:boolean)=>void;network:string;checkNetwork:()=>Promise<void>;}
const Context=createContext<AppState|null>(null);
export function AppProvider({children}:{children:ReactNode}){
  const [bundle,setBundle]=useState<EvidenceBundle|null>(null),[report,setReport]=useState<VerificationReport|null>(null),[notice,setNotice]=useState({message:'',error:false}),[network,setNetwork]=useState('Checking Sepolia RPC');
  const notify=useCallback((message:string,error=false)=>setNotice({message,error}),[]);
  const load=useCallback(async(b:EvidenceBundle)=>{const r=await verifyBundle(b);if(r.integrity!=='VALID')throw new Error(r.errors.join('; '));setBundle(b);setReport(r);},[]);
  const loadText=useCallback(async(text:string)=>{const b=await importBundle(text);await load(b);notify('Bundle integrity verified. Imported claims remain self-reported unless reproduced.');},[load,notify]);
  const checkNetwork=useCallback(async()=>{setNetwork('Checking Sepolia RPC');try{await new ReadonlyRpc({chainId:11142220,retries:0,timeoutMs:4000}).checkChain();setNetwork('Sepolia RPC · chain matched');}catch{setNetwork('Sepolia RPC unavailable · offline tools ready');}},[]);
  useEffect(()=>{void scenarioBundle().then(load).catch(e=>notify(errorText(e),true));void checkNetwork();},[load,notify,checkNetwork]);
  return <Context.Provider value={{bundle,report,load,loadText,notify,network,checkNetwork}}>{children}<div className={`toast ${notice.error?'toast-error':''}`} role={notice.error?'alert':'status'} aria-live="polite">{notice.message&&<><span>{notice.error?'×':'✓'}</span><p>{notice.message}</p><button aria-label="Dismiss notification" onClick={()=>setNotice({message:'',error:false})}>×</button></>}</div></Context.Provider>;
}
export function useApp():AppState{const ctx=useContext(Context);if(!ctx)throw new Error('App context missing');return ctx;}
export function useTask(){
  const {notify}=useApp();const [busy,setBusy]=useState(false);
  const run=async(task:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);try{await task();}catch(e){notify(errorText(e),true);}finally{setBusy(false);}};
  return {busy,run};
}
