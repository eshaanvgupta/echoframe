import './style.css';
import type {ClientEvmSigner} from '@x402/evm';
import {encodePaymentSignatureHeader} from '@x402/core/http';
import type {PaymentRequired} from '@x402/core/types';
import {createWalletClient,custom,formatUnits,type EIP1193Provider,type Hex,type Address} from 'viem';
import {celoSepolia} from 'viem/chains';
import {CHAIN_ID,checkChallenge,checkSigningRequest,termsSchema,termsHash,type Terms,type SigningRequest} from './public.js';
import {createBuyerClient} from './client.js';
type Plan={terms:Terms;termsHash:string;sessionToken:string;requestId:string;selfPayment:boolean;state:string;facilitatorCreditPolicy:string;preflight:{buyerAtomicBalance:string;sufficientFunds:boolean}};
type Provider=EIP1193Provider&{isMetaMask?:boolean;providers?:Provider[]};
declare global{interface Window{ethereum?:Provider;}}
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const button=(id:string)=>el<HTMLButtonElement>(id),checked=(id:string)=>el<HTMLInputElement>(id).checked;
const status=(message:string)=>{el('state').textContent=message;};
const rows=(id:string,values:Array<[string,string]>)=>{const target=el(id);target.replaceChildren();for(const [key,value]of values){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;target.append(dt,dd);}};
let plan:Plan,provider:Provider|undefined,connected=false,signaturesRequested=0,submitted=false,payload:string|undefined;
let pending:{request:SigningRequest;resolve:(signature:Hex)=>void;reject:(error:Error)=>void}|undefined;
const headers=()=>({'X-Echoframe-Session':plan.sessionToken,'X-Echoframe-Request-Id':plan.requestId});
async function api(path:string,body?:unknown){const response=await fetch(path,{method:body?'POST':'GET',headers:{...headers(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});if(!response.ok)throw new Error('Local request could not complete safely; review the existing attempt.');return response.json();}
function update(){button('prepare').disabled=!connected||!!pending||!!payload||submitted||plan?.state!=='PREPARED'||!plan?.preflight.sufficientFunds;button('sign').disabled=!pending||!checked('sign-consent')||signaturesRequested>0;button('submit').disabled=!payload||submitted||!checked('credit-consent')||!checked('submit-consent')||(plan?.selfPayment&&!checked('self-consent'));}
async function confirmWallet(){if(!provider)throw new Error('MetaMask is not connected');const accounts=await provider.request({method:'eth_accounts'});const chain=await provider.request({method:'eth_chainId'});if(Number(BigInt(chain))!==CHAIN_ID||accounts[0]?.toLowerCase()!==plan.terms.buyer.toLowerCase())throw new Error('Select the reviewed buyer and Celo Sepolia in MetaMask.');}
button('connect').addEventListener('click',()=>{void(async()=>{
  const injected=window.ethereum;provider=injected?.providers?.find(p=>p.isMetaMask)??(injected?.isMetaMask?injected:undefined);if(!provider)throw new Error('Open this local URL in a browser with MetaMask installed.');
  await provider.request({method:'eth_requestAccounts'});button('switch').disabled=false;await confirmWallet();connected=true;el('wallet').textContent='Connected buyer matches the reviewed address on Celo Sepolia. No signature requested.';status('Wallet connected. Prepare and review the unsigned message.');update();
})().catch(()=>{status('Select the reviewed buyer in MetaMask and switch to Celo Sepolia using the explicit button.');update();});});
button('switch').addEventListener('click',()=>{void(async()=>{if(!provider)return;await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x'+CHAIN_ID.toString(16)}]});await confirmWallet();connected=true;el('wallet').textContent='Reviewed buyer / Celo Sepolia confirmed.';update();})().catch(()=>status('Network switch was declined or Celo Sepolia is not configured in MetaMask. No payment was signed.'));});
button('prepare').addEventListener('click',()=>{void(async()=>{
  button('prepare').disabled=true;await confirmWallet();const discovery=await fetch('/premium',{headers:headers()});if(discovery.status!==402)throw new Error('Expected an unpaid x402 challenge');const required=checkChallenge(discovery.headers.get('PAYMENT-REQUIRED')??'',plan.terms);await discovery.text();
  const signer:ClientEvmSigner={address:plan.terms.buyer as Address,signTypedData:async request=>{
    checkSigningRequest(request,plan.terms);if(pending||signaturesRequested)throw new Error('Only one signing request is supported');
    const auth=request.message;rows('authorization',[['Typed-data domain','USDC / version 2'],['Primary type',request.primaryType],['From',String(auth.from)],['To',String(auth.to)],['Atomic value',String(auth.value)],['Valid after',String(auth.validAfter)+' (already valid; no allowance)'],['Expires at',new Date(Number(auth.validBefore)*1000).toISOString()],['One-use nonce',String(auth.nonce)]]);
    el('typed-data').textContent=JSON.stringify(request,(_key,value)=>typeof value==='bigint'?value.toString():value,2);status('Exact unsigned message prepared. No wallet signature prompt has opened.');
    return new Promise<Hex>((resolve,reject)=>{pending={request,resolve,reject};update();});
  }};
  const client=createBuyerClient(signer);
  const signed=await client.createPaymentPayload(required as PaymentRequired);payload=encodePaymentSignatureHeader(signed);pending=undefined;status('Signed locally in MetaMask. Nothing submitted. Review and approve the separate submit action.');update();
})().catch(()=>{pending=undefined;status('Authorization preparation/signing stopped. No automatic retry or payment submission occurred. Refresh only if you intend to prepare again.');update();});});
button('sign').addEventListener('click',()=>{void(async()=>{
  if(!pending||!checked('sign-consent')||signaturesRequested)return;await confirmWallet();const job=pending;checkSigningRequest(job.request,plan.terms);signaturesRequested++;update();
  const wallet=createWalletClient({account:plan.terms.buyer as Address,chain:celoSepolia,transport:custom(provider!)});
  try{const signature=await wallet.signTypedData(job.request as Parameters<typeof wallet.signTypedData>[0]);job.resolve(signature);}catch{job.reject(new Error('Wallet signature declined'));}
})().catch(()=>{pending?.reject(new Error('Wallet or terms changed'));status('Wallet, network or authorization changed. No payment submitted.');});});
button('submit').addEventListener('click',()=>{void(async()=>{
  if(!payload||submitted||!checked('submit-consent')||!checked('credit-consent'))return;await confirmWallet();submitted=true;update();const signed=payload;payload=undefined;
  await api('/api/approve-submit',{termsHash:plan.termsHash,approve:true,acknowledgeSelfPayment:checked('self-consent'),acknowledgeFacilitatorCredit:true});
  status('Submitting the single approved payment. Do not repeat or refresh to pay again.');
  const response=await fetch('/premium',{headers:{...headers(),'PAYMENT-SIGNATURE':signed},signal:AbortSignal.timeout(60000)});const bytes=await response.text();
  if(response.status!==200){status('Merchant did not return HTTP 200. Preserve this attempt and reconcile; no second payment will be made.');void poll();return;}
  await api('/api/received',{status:200,body:JSON.parse(bytes)});status('Response received. Reproducing outcome and matching the genuine receipt read-only.');void poll();
})().catch(()=>{status('Submission or response is uncertain. Do not pay again. Inspect the existing transaction/attempt.');void poll();});});
async function poll(){try{const current=await api('/api/status') as {state:string;details:{transaction?:string;transactionHash?:string};error:string|null};el('result').textContent=JSON.stringify(current,null,2);if(current.state==='VERIFIED'){
  status('Genuine Sepolia receipt matched and the outcome independently reproduced. No further payment is possible in this session.');const target=el('exports');target.replaceChildren();for(const name of ['complete-redacted.echoframe.json','outcome-proof.json','payment-match.json','verification-report.json','purchase.regression.test.ts']){const a=document.createElement('a');a.href='/api/export/'+name;a.textContent='Download '+name;a.download=name;target.append(a);}return;
}if(current.error||current.state==='UNKNOWN')return;if(submitted)setTimeout(()=>{void poll();},2500);}catch{status('Status unavailable. Reconcile the existing attempt; never submit a new payment automatically.');}}
for(const id of ['sign-consent','submit-consent','credit-consent','self-consent'])el(id).addEventListener('change',update);
void(async()=>{
  const response=await fetch('/api/plan');if(!response.ok)throw new Error('Plan unavailable');plan=await response.json() as Plan;termsSchema.parse(plan.terms);if(termsHash(plan.terms)!==plan.termsHash)throw new Error('Plan commitment changed');
  rows('terms',[['Buyer',plan.terms.buyer],['Seller',plan.terms.seller],['Token contract',plan.terms.token],['Amount','0.01 test-USDC / 10000 atomic units / 6 decimals'],['Network','Celo Sepolia / chain ID 11142220'],['Facilitator',plan.terms.facilitator],['Maximum validity','300 seconds from SDK message creation'],['Balance observed',formatUnits(BigInt(plan.preflight.buyerAtomicBalance),6)+' test-USDC'],['Terms commitment',plan.termsHash],['Session state',plan.state]]);
  el('credit-policy').textContent=plan.facilitatorCreditPolicy;el('self-warning').hidden=!plan.selfPayment;el('self-warning').textContent='Buyer and seller are identical. This is a self-payment protocol test and cannot demonstrate independent adoption.';el('self-consent-label').hidden=!plan.selfPayment;button('connect').disabled=plan.state!=='PREPARED';status(plan.state==='PREPARED'?(plan.preflight.sufficientFunds?'Public terms loaded. No signing or payment authorized.':'Buyer token balance is insufficient. Signing is disabled; fund the reviewed wallet token, then refresh the read-only preflight.'):'An earlier attempt exists. Reconcile it; another payment is locked.');update();if(plan.state!=='PREPARED')void poll();
})().catch(()=>status('Public testnet terms could not be verified. All payment actions remain disabled.'));
