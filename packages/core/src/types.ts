import {z} from 'zod';

export type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
export const hex32 = z.string().regex(/^0x[0-9a-f]{64}$/);
export const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const atomic = z.string().regex(/^(0|[1-9][0-9]{0,77})$/).refine(value=>/^(0|[1-9][0-9]{0,77})$/.test(value)&&BigInt(value)<(1n<<256n),'Integer exceeds uint256 or is malformed');
export const chain = z.union([z.literal(42220),z.literal(11142220)]);
export const financial = z.enum(['NOT_INITIATED','AUTHORIZED','SUBMITTED','PENDING','SETTLED','REVERTED','REFUNDED','FAILED','UNKNOWN']);
export const authority = z.enum(['NOT_PROVIDED','DECLARED','SIGNED_VERIFIED','EXPIRED','REVOKED','INVALID','UNKNOWN']);
export const delivery = z.enum(['NOT_EXPECTED','NOT_STARTED','STARTED','RETURNED_UNVERIFIED','TESTED_PASS','TESTED_FAIL','NOT_DELIVERED','UNKNOWN']);
export const quality = z.enum(['CHAIN_PROVEN','SIGNATURE_VERIFIED','TEST_REPRODUCED','APP_REPORTED','INFERRED','MISSING']);
export type FinancialStatus = z.infer<typeof financial>;
export type EvidenceQuality = z.infer<typeof quality>;
export const jsonValue: z.ZodType<Json> = z.lazy(()=>z.union([z.null(),z.boolean(),z.number().finite(),z.string().max(1_000_000),z.array(jsonValue).max(10000),z.record(z.string(),jsonValue)]));
const iso = z.iso.datetime();
export const offerSchema = z.object({id:z.string().max(100),chainId:chain,scheme:z.literal('exact'),token:address,payer:address.optional(),payee:address,amount:atomic,decimals:z.number().int().min(0).max(36).optional(),decimalsSource:z.enum(['RPC','CONFIGURED','NOT_PROVIDED']),quoteHash:hex32}).strict();
export type PaymentOffer = z.infer<typeof offerSchema>;
export const eventSchema = z.object({id:z.string().min(1).max(100),index:z.number().int().nonnegative(),type:z.string().min(1).max(100),at:iso,timestampProvenance:z.enum(['LOCAL_CLOCK','RPC_BLOCK','REMOTE_REPORTED','VIRTUAL_CLOCK']),data:jsonValue,previousHash:hex32.nullable(),hash:hex32}).strict();
export type EvidenceEvent = z.infer<typeof eventSchema>;
export const artifactSchema = z.object({id:z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/),mime:z.string().max(100),algorithm:z.literal('SHA-256'),size:z.number().int().min(0).max(2_000_000),sha256:hex32,bytesBase64:z.string().max(2_700_000)}).strict();
export type Artifact = z.infer<typeof artifactSchema>;
export const bundleSchema = z.object({
  schemaVersion:z.literal('1.0.0'),verificationAlgorithm:z.literal('echoframe-jcs-keccak-v1'),
  bundleId:hex32,chainId:chain,protocolKind:z.enum(['x402','mpp','erc8183','erc20','local']),
  environment:z.enum(['SIMULATED','TESTNET','MAINNET']),createdAt:iso,observedAt:iso,
  redactionProfile:z.enum(['boundary-allowlist-v1','public-minimal-v1']),title:z.string().min(1).max(180),
  claims:z.array(z.object({id:z.string().max(100),statement:z.string().max(500),quality,sourceEventId:z.string().max(100).optional()}).strict()).max(1000),
  actors:z.array(z.object({id:z.string().max(100),role:z.enum(['buyer','merchant','facilitator','evaluator','verifier']),address:address.optional()}).strict()).max(100),
  events:z.array(eventSchema).max(5000),paymentOffers:z.array(offerSchema).max(100),requestContextHash:hex32,
  mandate:z.object({expiresAt:iso,revoked:z.boolean(),descriptionHash:hex32}).strict().optional(),
  facilitatorResponse:jsonValue,transactionHashes:z.array(hex32).max(100),rpcObservations:z.array(jsonValue).max(100),
  contentHashes:z.array(z.object({artifactId:z.string(),algorithm:z.enum(['SHA-256','KECCAK-256']),hash:hex32}).strict()).max(1000),
  outcomes:z.array(jsonValue).max(100),warnings:z.array(z.string().max(500)).max(100),policyVersion:z.literal('1.0.0'),
  recoveryState:financial,artifacts:z.array(artifactSchema).max(100),
  rootHash:hex32,
  signature:z.object({signer:address,value:z.string().regex(/^0x[0-9a-fA-F]{130}$/)}).strict().optional()
}).strict();
export type EvidenceBundle = z.infer<typeof bundleSchema>;
export interface VerificationReport {
  algorithm:string; bundleId:string|null; integrity:'VALID'|'INVALID'; errors:string[]; warnings:string[];
  authorityStatus:z.infer<typeof authority>; financialStatus:FinancialStatus; deliveryStatus:z.infer<typeof delivery>;
  environment:string; claims:Array<{statement:string;quality:EvidenceQuality;reason:string}>;
  checks:{passed:number;failed:number}; signatureVerified:boolean;
}
export class EvidenceError extends Error {
  constructor(public readonly code:string,message:string){super(`${code}: ${message}`);this.name='EvidenceError';}
}
