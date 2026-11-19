import {x402Client} from '@x402/fetch';
import {ExactEvmScheme} from '@x402/evm/exact/client';
import type {ClientEvmSigner} from '@x402/evm';
import {NETWORK,TOKEN,AMOUNT} from './public.js';
/** Construction never signs. The injected signer is called only by explicit createPaymentPayload. */
export const createBuyerClient=(signer:ClientEvmSigner)=>new x402Client().register(NETWORK,new ExactEvmScheme(signer,{rpcUrl:'https://forno.celo-sepolia.celo-testnet.org'})).setSpendControls({maxAmountPerPayment:'$0.01',allowedAssets:[{network:NETWORK,asset:TOKEN,maxAmountPerPayment:AMOUNT}]});
