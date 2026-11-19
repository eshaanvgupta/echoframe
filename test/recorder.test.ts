import {it,expect} from 'vitest';
import {encodePaymentRequiredHeader} from '@x402/core/http';
import {recorderMiddleware,type RecorderResponse} from '../packages/node/src/index.js';
import {verifyBundle,type EvidenceBundle} from '../packages/core/src/index.js';
import {requirements} from '../examples/express-x402/index.js';
function record(networks:string[],chainId?:42220|11142220){
  const bundles:EvidenceBundle[]=[],errors:Error[]=[];let finish:()=>void=()=>{};
  const response:RecorderResponse={statusCode:402,getHeaders:()=>({'PAYMENT-REQUIRED':encodePaymentRequiredHeader({x402Version:2,resource:{url:'https://example.invalid'},accepts:networks.map(network=>({...requirements,network:network as `${string}:${string}`}))})}),on:(_event,callback)=>{finish=callback;}};
  recorderMiddleware(b=>bundles.push(b),e=>errors.push(e),chainId===undefined?{}:{chainId})({method:'GET',url:'/confidential/path',headers:{authorization:'Bearer no-store'}},response,()=>{});finish();return {bundles,errors};
}
it('records a mainnet challenge without inventing a payment',async()=>{const r=record(['eip155:42220']);expect(r.errors).toHaveLength(0);expect(r.bundles[0]!.chainId).toBe(42220);expect((await verifyBundle(r.bundles[0]!)).integrity).toBe('VALID');expect((await verifyBundle(r.bundles[0]!)).financialStatus).toBe('NOT_INITIATED');expect(JSON.stringify(r)).not.toContain('no-store');});
it('requires an explicit chain for multi-chain recording',()=>{const r=record(['eip155:42220','eip155:11142220']);expect(r.bundles).toHaveLength(0);expect(r.errors[0]!.message).toContain('MULTI_CHAIN');});
it('records only explicitly selected chain offers after validating every alternative',async()=>{const r=record(['eip155:42220','eip155:11142220'],11142220);expect(r.bundles[0]!.paymentOffers).toHaveLength(1);expect((await verifyBundle(r.bundles[0]!)).integrity).toBe('VALID');});
