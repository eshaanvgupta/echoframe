import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {EvidenceError} from '@echoframe/core';
import {FACILITATOR,makeTerms} from './public.js';
export const workspace=resolve(fileURLToPath(new URL('../..',import.meta.url)));
/** Private environment is loaded only by server entrypoints. Never imported by the browser. */
export function loadPrivateConfig(){
  try{process.loadEnvFile(resolve(workspace,'.env'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new EvidenceError('ENV','Cannot load private environment');}
  if(process.env.X402_NETWORK&&!['testnet','sepolia','celo-sepolia','eip155:11142220'].includes(process.env.X402_NETWORK))throw new EvidenceError('TESTNET_ONLY','Only Celo Sepolia is permitted');
  if(process.env.X402_FACILITATOR_URL&&process.env.X402_FACILITATOR_URL!==FACILITATOR)throw new EvidenceError('TESTNET_ONLY','Only the official Sepolia facilitator is permitted');
  const apiKey=process.env.X402_API_KEY;if(!apiKey||/[\r\n]/.test(apiKey))throw new EvidenceError('ENV','X402_API_KEY must be set privately');
  const buyer=process.env.BUYER_ADDRESS,seller=process.env.SELLER_PAY_TO;
  if(!seller||!buyer)throw new EvidenceError('ENV','Public SELLER_PAY_TO and BUYER_ADDRESS must be configured');
  return {apiKey,terms:makeTerms(buyer,seller),directory:resolve(workspace,'local-evidence/celo-x402-live'),port:4390};
}
