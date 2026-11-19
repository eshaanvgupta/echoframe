# x402 and MPP official-interface research

Research date: 2026-11-19. These notes describe upstream interfaces and implementation recommendations; they do not claim that ECHOFRAME has implemented every interface below. All sample identifiers are synthetic. No payment was signed, submitted, or settled during this research.

## x402 v2

The authoritative HTTP transport carries base64-encoded JSON in three headers: `PAYMENT-REQUIRED` on the HTTP 402 response, `PAYMENT-SIGNATURE` on the client's retry, and `PAYMENT-RESPONSE` on the server result. Header names are case insensitive. The v2 challenge belongs in its header; response-body parsing is not an alternative v2 transport. Cross-origin browser clients need the appropriate exposed response headers and allowed request headers.

Source: [official HTTP transport specification](https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md).

The challenge has `x402Version: 2`, `resource: {url, ...}`, and `accepts: PaymentRequirements[]`. Requirements include `scheme`, CAIP-2 `network`, atomic-unit string `amount`, `asset`, `payTo`, and numeric `maxTimeoutSeconds`; `extra` is optional. A payment payload has `x402Version: 2`, `accepted` requirements and scheme-specific `payload`, plus optional resource/extensions. A settlement response requires boolean `success`, string `transaction`, and CAIP-2 `network`; optional fields include payer, amount, errorReason and errorMessage. `settlement_pending` means broadcast with unknown confirmation and requires a nonempty transaction hash: reconcile before retrying. `/verify` is read-only; `/settle` commits state and must never be called by this recorder.

Source: [official core specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md).

For the supported EIP-3009 subset, require `scheme: exact`, EVM network, an explicit supported chain, integer amounts, valid asset/payee addresses and timeout. Resolve omitted assetTransferMethod to `eip3009`; reject `permit2`, `erc7710`, unknown methods and unsupported payment flows explicitly. For EIP-3009, `extra.name` and `extra.version` supply the token's EIP-712 domain metadata. The transient payment payload includes a signature and authorization with `from`, `to`, `value`, `validAfter`, `validBefore`, `nonce`. Compare accepted requirements to the original selected challenge, then compare authorization recipient/value/window. Structural consistency alone does not verify a signature. Never persist the replay-risky signature. Plain EIP-3009 does not bind arbitrary request IDs; do not claim universal request binding.

Source: [official exact EVM scheme](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md).

Official SDK primitives in `@x402/core/http` include `encodePaymentRequiredHeader`, `decodePaymentRequiredHeader`, `encodePaymentSignatureHeader`, `decodePaymentSignatureHeader`, `encodePaymentResponseHeader`, and `decodePaymentResponseHeader`. Decoding is not complete schema/security validation: ECHOFRAME must add strict constraints and size bounds. Avoid higher-level automatic-payment clients.

Source: [official HTTP SDK source](https://github.com/x402-foundation/x402/blob/main/typescript/packages/core/src/http/index.ts).

## MPP one-shot charge

MPP uses a separate Payment authentication negotiation. Challenge: `WWW-Authenticate: Payment id="...", realm="...", method="evm", intent="charge", request="..."`. Required auth parameters are id, realm, method, intent and request. Request and opaque use base64url JCS JSON; expires is an optional ISO timestamp outside the request object. Optional header selects the Credential header, otherwise Authorization. Opaque must be echoed unchanged. The server must bind the challenge ID to its terms; a recorder without the server's binding secret cannot independently establish its HMAC authenticity.

Source: [official challenges documentation](https://mpp.dev/protocol/challenges).

Credentials are `Authorization: Payment <base64url JSON>` or the advertised `Payment-Authorization` field. The wire JSON has challenge, method-specific payload and optional source. Within wire credentials, challenge.request and challenge.opaque retain their encoded strings. Never retain raw payment credentials. A consumed Tempo charge Credential receives HTTP 403 without a fresh challenge, avoiding a second payment.

Sources: [official credentials documentation](https://mpp.dev/protocol/credentials), [HTTP status documentation](https://mpp.dev/protocol/http-402).

`Payment-Receipt` is base64url JSON, not x402's PAYMENT-RESPONSE. It acknowledges payment with method, reference, status success and timestamp; it is optional in current general MPP documentation. Missing receipt is missing evidence. A self-reported receipt or reference is not chain proof or delivery proof.

Source: [official receipts documentation](https://mpp.dev/protocol/receipts).

The generic charge request contains amount/currency and optional recipient, description, externalId. Method details extend it. Native EVM charge uses EIP-3009 in current mppx; documented known networks include Celo 42220 and Celo Sepolia 11142220. The broader draft defines permit2, authorization, transaction and hash Credential types, while the researched SDK EVM schema supports authorization. Declare SDK coverage precisely; do not imply every draft rail is operationally supported.

Sources: [charge intent](https://mpp.dev/intents/charge), [EVM method](https://mpp.dev/payment-methods/evm), [EVM charge draft](https://paymentauth.org/draft-evm-charge-00), [SDK EVM types](https://github.com/wevm/mppx/blob/main/src/evm/Types.ts).

Use `import {Challenge, Credential, Receipt} from 'mppx'` for non-signing normalization. `Challenge.deserialize(header)` returns a challenge with decoded request object. `Credential.deserialize(header)` similarly normalizes echoed request. `Receipt.deserialize(header)` parses a receipt. Corresponding serialize methods produce wire values. Do not initialize Mppx/Fetch automatic-payment handlers for instrumentation.

Sources: [Challenge.deserialize](https://mpp.dev/sdk/typescript/core/Challenge.deserialize), [Credential source](https://github.com/wevm/mppx/blob/main/src/Credential.ts), [Receipt.deserialize](https://mpp.dev/sdk/typescript/core/Receipt.deserialize).

## Synthetic fixture and independent research smoke tests

Registry versions observed with `npm.cmd view`: mppx **0.21.0**, @x402/core **2.31.0**. Installed those exact versions in a separate temporary research directory with lifecycle scripts disabled. Six assertions passed on Node 24.16.0: native EVM charge challenge decode, challenge serialize/decode round trip, Credential round trip, Receipt round trip, x402 challenge round trip, and non-terminal settlement_pending response round trip. These are serialization compatibility checks only; no upstream network, token contract, signature correctness, or settlement was tested.

Synthetic normalized MPP request tested:

```json
{
  "amount": "1000",
  "currency": "0x0000000000000000000000000000000000000001",
  "recipient": "0x0000000000000000000000000000000000000001",
  "methodDetails": {
    "chainId": 11142220,
    "decimals": 6,
    "credentialTypes": ["authorization"]
  }
}
```

Recommended compatibility/security tests: reject v1/future x402 versions; absent canonical header; malformed alternative offer with missing/changed amount/payee; chain/asset/recipient/quote mismatch; unsupported ATM/flow; noninteger amounts; oversized encodings; future/expired authorization; MPP non-charge intent; unsupported method/credential type; conflicting duplicate auth parameters; changed echoed challenge; mismatched receipt method; pending response with absent hash. All ambiguous network outcomes remain UNKNOWN/PENDING and never recommend a fresh authorization.
