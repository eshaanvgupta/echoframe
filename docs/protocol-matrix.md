# Supported protocol profiles

Research date: 2026-11-19. Exact upstream sources and inconsistencies are in [x402/MPP research](research-x402-mpp.md) and [Celo/ERC research](research-celo-erc.md). Dependencies and lockfile are pinned.

| Protocol | Working adapter | Explicitly unsupported |
| --- | --- | --- |
| x402 `@x402/core` 2.31.0 | v2 HTTP base64 `PAYMENT-REQUIRED`, transient `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`; exact EVM EIP-3009; networks eip155:42220 and eip155:11142220; exact amount, asset, payee, time/quote consistency | v1/future versions, body fallback, permit2, erc7710, upto/batch/escrow/upfront, unknown extensions; no payment signature generation or production settlement |
| MPP `mppx` 0.21.0 | Separate `WWW-Authenticate: Payment` negotiation; official Challenge/Credential/Receipt codecs; `method=evm`, `intent=charge`; configured chain/decimals, flat authorization credential structure; receipt reference normalization | Tempo, sessions, subscriptions, card/Stripe, splits, permit2/transaction/hash credentials, server HMAC authenticity, production facilitator transport |
| ERC-8183 | Draft embedded reference snapshot a078cab5; configured address, matching chain, expected code keccak; `getJob(uint256)`, `paymentToken()`, exact indexed events in successful receipt | Universal deployed address, guessed ABI, automatic escrow calls, arbitrary hooks, evaluator trust and subjective quality |
| ERC-20 on Celo | Receipt/status/block inclusion; exact Transfer event topics/data/emitter/context; explicit single/multi-log selection; complete trusted chain/transaction/token/parties/atomic expectations; configured token semantics; optional historical decimals read | Native CELO value attribution, transfer tax/economic behavior, purchase context, automatic refund inference, consensus proof |
| ERC-8004/Self | Official configured registry read interfaces with runtime bytecode and chain check; no metadata URL fetch | Registration, passport/credential disclosure, delivery/reputation guarantee; no verified ERC-8004 Sepolia address is assumed |

MPP EVM credential payload is flat: `{type:"authorization",from,to,value,validAfter,validBefore,nonce,signature}`. This differs from x402's nested authorization object. Raw credentials are transient and excluded from normalized observations.

ERC-8183 prose and embedded reference disagree on funding ABI, budget-setting permission and some transitions. The adapter declares only its pinned reference read ABI. User-supplied code pins prove a bytecode match, not a verified deployment identity. No real ERC-8183 Celo address was provided, so live job behavior is an explicit prerequisite rather than a fabricated integration.

All local fixtures in `fixtures/` and `scenarios/` are SIMULATED. Tests include official library serialization, official HTTPFacilitatorClient over actual loopback HTTP, strict negative challenge alternatives and receipt corruption. SDK codec use does not itself validate payment signatures, server HMACs or real chain settlement.

The new `PaymentRecorder` uses these existing official codecs at a durable request boundary for Express and Hono. PaymentRecorder itself never calls a genuine settle API. The isolated default examples use synthetic facilitators; the separately authorized celo-x402-live example delegates a genuine Sepolia purchase to official SDK 2.31.0 and the hosted facilitator. The captured response header was rejected by the strict profile; its separately persisted actual transaction reference was reconciled read-only without fabricating a parsed response. Unknown extensions, duplicate JSON members and unsupported echoed MPP challenge fields fail closed. Result bytes are metadata/commitment only by default; explicit JSON projection policies are described in [integration.md](integration.md).

Durable MPP recording follows the selected challenge's advertised Payment-Authorization header or default Authorization; ambiguous dual credentials are rejected and never retained.
