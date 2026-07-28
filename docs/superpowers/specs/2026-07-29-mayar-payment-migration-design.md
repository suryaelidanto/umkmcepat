# Mayar payment migration — design

**Status:** approved, pending sandbox spike
**Author:** Claude + suryaelidanto
**Date:** 2026-07-29

## Context

UMKM Cepat currently processes Energy Booster top-ups via Pakasir
(`src/lib/pakasir.ts`), an Indonesian QRIS aggregator. The user wants to move
off Pakasir onto Mayar.id, which offers the same QRIS rails plus a broader
platform (invoicing, memberships, affiliate, etc. — unused here).

Account setup (outside this repo) is in progress in parallel with this work:

- Production Mayar account renamed YouClip → UMKM Cepat, KYC submitted as
  Individu, pending Mayar review (1–3 business days).
- A separate sandbox account (`web.mayar.club`, no KYC required) is fully
  configured: API key (Read & Write) and Webhook Token are in `.env` /
  `.env.example` as `MAYAR_API_KEY`, `MAYAR_API_BASE_URL`,
  `MAYAR_WEBHOOK_TOKEN`.
- A Cloudflare Tunnel (`umkmcepat-dev`, systemd-managed) maps
  `https://dev.umkmcepat.com` → `localhost:3000`, registered as the sandbox
  webhook URL in Mayar's dashboard.

This spec covers the code-side migration only.

## Key finding: Mayar's dynamic QRIS endpoint is unusable as-is

Mayar's literal QRIS analogue (`POST /qr-codes/create`) takes only `{ amount }`
and returns a hosted PNG — no order id, no reference, no `extraData`, no
expiry. Two users buying the same-priced pack would produce indistinguishable
webhooks. This endpoint is rejected for this integration.

The viable path is `POST /payments/create` (a "Payment Request") with
`paymentMethod: "QRIS"` and `extraData: { orderId }`. It returns
`{ id, transactionId, link }` — a durable handle at creation time, and a
hosted checkout link instead of a raw QR payload.

**Trade-off accepted:** the inline "scan this QR in the modal" experience is
lost. The checkout button now opens Mayar's hosted QRIS page in a new tab.
This is a real UX downgrade from Pakasir, accepted because the alternative
cannot reliably attribute payment to a specific order.

## Correction to an earlier assumption

Earlier research (public `.md` docs) suggested Mayar webhooks have no
signature verification, same as Pakasir. This is wrong: the account
dashboard (Integrasi → API Keys & Token) exposes a **Webhook Token**,
described as verifying "bahwa webhook yang datang berasal dari server mayar."
This is undocumented in the public docs but real in the product. The exact
mechanism (header name, algorithm — HMAC vs. shared-secret comparison) is
unconfirmed and is the first thing the sandbox spike must determine.

If a real signature exists, the webhook handler should verify it directly
instead of only relying on "never trust the payload, re-fetch from API"
(the fallback if the token turns out to be non-cryptographic or unusable).

## Decisions (from earlier brainstorming rounds in this conversation)

| Decision | Choice | Why |
|---|---|---|
| Checkout UX | Hosted link + polling | Reliable correlation via `extraData`; existing polling infra (`/api/payment/status/$orderId`) already supports this pattern — reuse, no new mechanism needed |
| Unknowns | Verify in sandbox before full build | Six items below are load-bearing; spike answers them cheaply before code depends on wrong assumptions |
| Cutover | Clean replace | `src/lib/pakasir.ts` deleted once Mayar production path is smoke-tested; no dual-provider abstraction to maintain |
| Channels | QRIS only | Cheapest channel (0.7%), matches current UX intent; other channels (VA, retail, card) not offered |
| Fee bearer | Merchant absorbs fee | Customer must pay the exact listed price (Rp 2.900–59.900); if the customer bore the fee, paid amount ≠ `payment.amount`, breaking the webhook's amount-match check |

## Architecture

### Provider client: `src/lib/mayar.ts` (replaces `src/lib/pakasir.ts`)

`BOOSTER_PACKS` and `getBoosterPack` carry over unchanged — never
Pakasir-specific.

```ts
createMayarPayment({ orderId, amount, packName })
  → POST {MAYAR_API_BASE_URL}/payments/create
    { name: packName, amount, paymentMethod: "QRIS", extraData: { orderId } }
  → { id, transactionId, link }

getMayarTransaction(transactionId)
  → GET {MAYAR_API_BASE_URL}/transactions/{transactionId}
  → { status, amount, paymentMethod, ... }

verifyMayarWebhookToken(request)
  → compares an incoming header against MAYAR_WEBHOOK_TOKEN
  → exact mechanism confirmed by spike
```

Env: `MAYAR_API_KEY`, `MAYAR_API_BASE_URL`, `MAYAR_WEBHOOK_TOKEN` (already
present in `.env` / `.env.example`, sandbox values). At cutover,
`MAYAR_API_BASE_URL` swaps from `https://api.mayar.club/hl/v2` (sandbox) to
`https://api.mayar.id/hl/v2` (production), and the API key / webhook token
swap to production values.

### Schema (Prisma `Payment` model)

```prisma
model Payment {
  // ...existing fields unchanged...
  providerTxnId         String? @unique   // Mayar transactionId — webhook correlation key
  providerPaymentLinkId String?           // Mayar `id` — reconciliation fallback
  paymentUrl            String?           // hosted QRIS checkout link
  paymentNumber         String?           // now legacy: populated only on old Pakasir rows
}
```

`paymentNumber` is kept (not dropped) so historical Pakasir rows remain
readable. New rows leave it null and populate `paymentUrl` instead.

### `POST /api/payment/create`

Same shape as today: authenticate, resolve booster pack, mint `orderId`,
call `createMayarPayment`, persist `Payment` with `status: PENDING`,
`providerTxnId`, `paymentUrl`. Response includes `paymentUrl` instead of
`paymentNumber`.

### `POST /api/payment/webhook`

```
1. verify request via Webhook Token (mechanism per spike finding)
   → fails verification: 401, log, do not process
2. parse { event, data }
3. event !== "payment.received"        → 200 ack, no-op
4. find Payment by providerTxnId = data.transactionId
5. not found                           → 404 + log
6. status !== PENDING                  → 200 idempotent ack
7. VERIFY: GET /transactions/{providerTxnId}
     ├─ assert status is paid
     └─ assert amount === payment.amount   ← explicit; was implicit via
                                              Pakasir's query-param verify call
8. atomic updateMany PENDING→COMPLETED      ← existing race guard, unchanged
9. grant credits                            ← unchanged
```

Step 7's amount assertion becomes explicit code (Mayar's transaction lookup
is by ID alone, unlike Pakasir which took amount as a verify parameter).

### `POST /api/admin/transactions/$orderId/verify`

Switches from `verifyPakasirTransaction` to `getMayarTransaction`, looked up
via `providerTxnId`. Rows without a `providerTxnId` (legacy Pakasir payments)
return a clear "cannot verify — pre-migration payment" error rather than
attempting a Mayar lookup.

### Reconciliation for dropped webhooks

Webhook delivery reliability is unconfirmed for Mayar (undocumented retry
policy). `/api/payment/status/$orderId` — already polled by the client every
few seconds — gains a time-gated reconciliation: if a payment has been
PENDING beyond a threshold (e.g. 2 minutes), the route calls
`getMayarTransaction` directly and settles from that authoritative read,
instead of waiting indefinitely for a webhook that may never arrive.

**Rate-limit constraint:** Mayar allows 50 req/min per API key. The
reconciliation call must only fire past the time threshold, not on every
poll tick, or concurrent checkouts will 429.

### UI: `EnergyBoosterModal.tsx`

Inline `<img src={qrserver.com...} />` (line ~292) is replaced with a
"Bayar Sekarang (QRIS)" button opening `paymentUrl` in a new tab. Existing
polling loop, success, and failure states are unchanged. This removes the
third-party `api.qrserver.com` call — the app no longer ships payment
payloads to an external image-rendering service.

Storybook story for this component is updated in the same change per the
project's UI-pattern contract.

## Blast radius

| File | Change |
|---|---|
| `src/lib/pakasir.ts` | Deleted (after production smoke test) |
| `src/lib/mayar.ts` | New |
| `src/routes/api.payment.create.ts` | Mayar client, `paymentUrl` response |
| `src/routes/api.payment.webhook.ts` | Token verification, `providerTxnId` correlation, explicit amount check |
| `src/routes/api.payment.status.$orderId.ts` | Time-gated reconciliation |
| `src/routes/api.admin.transactions.$orderId.verify.ts` | `getMayarTransaction`, legacy-row guard |
| `src/components/payment/EnergyBoosterModal.tsx` | Hosted-link button replaces inline QR |
| `prisma/schema.prisma` | New `Payment` columns + migration |
| `.env`, `.env.example` | Already updated (Mayar vars present); Pakasir vars removed at cutover |
| `scripts/simulate-payment.ts` | Retarget Mayar sandbox |
| `src/lib/user-facing-error.ts` | Regex `/pakasir\|.../` → `/mayar\|.../` |
| `tests/routes/payment.test.ts` | Mock Mayar instead of Pakasir; add amount-mismatch and unknown-event coverage |
| `tests/integration/payment-webhook-race.itest.ts` | Race-condition guard logic unchanged; update payload shape |

## Cutover sequence

1. Sandbox spike (open questions below) confirms assumptions.
2. Full implementation against sandbox, tests green.
3. Wait for production KYC to clear.
4. Drain in-flight Pakasir `PENDING` rows (verify manually via admin route
   before deploy, or let them expire naturally).
5. Swap `.env` sandbox → production Mayar credentials; register production
   webhook URL (`https://umkmcepat.com/api/payment/webhook`) in Mayar
   dashboard.
6. Deploy. Smoke-test one small real payment end-to-end.
7. Delete `src/lib/pakasir.ts` and remove `PAKASIR_*` from both env files.

## Open questions — must be answered by the sandbox spike before full build

1. **Webhook Token mechanism** — which header carries it, and is it a
   direct shared-secret match or an HMAC signature? (Corrects the earlier
   "no webhook verification" assumption.)
2. Does the webhook's `data.transactionId` equal the `transactionId`
   returned by `/payments/create`? (Load-bearing for correlation — if not,
   fall back to matching on `extraData.orderId`.)
3. Is `extraData` echoed back in the webhook payload at all?
4. Does `paymentMethod: "QRIS"` on `/payments/create` actually restrict the
   hosted page to QRIS only, or still show other channels?
5. What are the observed `status` values on a paid transaction over time
   (`paid`, `settled`, both)?
6. Does the hosted link honor an expiry, and is `expiredAt` a real,
   respected field on `/payments/create`?

## Testing

- Unit: `src/lib/mayar.ts` — request shaping, error handling on non-2xx.
- Route tests: `payment.test.ts` covers create/webhook/status/admin-verify
  against a mocked Mayar client; new cases for amount mismatch, unknown
  webhook event, and invalid/missing webhook token.
- Integration: existing `payment-webhook-race.itest.ts` race guard adapted
  to Mayar payload shape, behavior unchanged.
- Manual: sandbox spike is itself the first manual test pass, run before
  the automated suite is written against confirmed behavior.
