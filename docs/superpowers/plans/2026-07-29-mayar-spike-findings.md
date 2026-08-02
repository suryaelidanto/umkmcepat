# Mayar sandbox spike findings

Date: 2026-07-29
Sandbox base: https://api.mayar.club/hl/v2

## Key correction from spec: wrong create endpoint

The spec assumed `POST /payments/create` with `paymentMethod: "QRIS"` would work.
**Result: 400 "Payment channel configuration not found"** — the sandbox account has no
QRIS channel configured (`GET /payment-channels` returns `data: null`).

The spec notes this as an open question. The resolution:

- `paymentMethod: "QRIS"` must be **omitted** until QRIS is activated on production.
  For sandbox testing and production (once activated), the hosted checkout page shows
  all available payment methods. The QRIS-only restriction the spec wanted is not
  enforceable at create-time without account configuration.
- `POST /payments/create` **without** `paymentMethod` works (HTTP 200).
- `POST /invoices/create` also works (returns more fields but requires `mobile`).

**Decision for Tasks 3–10:** Use `POST /payments/create` without `paymentMethod` field.
The spec's QRIS restriction is noted in the global constraints ("QRIS only") but cannot
be enforced at API call time for sandbox; on production, it will work once Mayar
activates QRIS for the merchant account. Document this in `mayar.ts`.

## 1. Webhook Token mechanism

**Mechanism: query parameter, not a header.**

Per authoritative Mayar integration documentation:
- Webhook URL is registered with `?token=<MAYAR_WEBHOOK_TOKEN>` appended.
- Mayar does not sign the body (no HMAC, no X-Signature header).
- Verification: compare `new URL(request.url).searchParams.get("token")` against
  `process.env.MAYAR_WEBHOOK_TOKEN`.
- MAYAR_WEBHOOK_TOKEN is 128 characters (not a UUID, not HMAC secret — a raw token).

**Webhook route URL that should be registered in Mayar dashboard:**
`https://dev.umkmcepat.com/api/payment/webhook?token=<MAYAR_WEBHOOK_TOKEN>`
(already registered in sandbox dashboard per Global Constraints — confirm token is appended)

**Verification approach for Task 5:**
```ts
const token = new URL(request.url).searchParams.get("token");
if (!token || token !== process.env.MAYAR_WEBHOOK_TOKEN) {
  return Response.json({ message: "Unauthorized." }, { status: 401 });
}
```

## 2. transactionId correlation

**Finding: `payments/create` returns `transactionId: null`.**

Response from `POST /payments/create`:
```json
{
  "id": "7587454c-67e4-4d96-8589-e459f6aea2e2",
  "transactionId": null,
  "paymentLinkId": "7587454c-67e4-4d96-8589-e459f6aea2e2",
  "link": "https://umkmcepat.mayar.shop/pl/nugcromhj/",
  "amount": 2900,
  "status": "unpaid",
  "extraData": { "orderId": "SPIKE-TEST-005" }
}
```

`transactionId` is null at creation time. A transaction UUID is only assigned when
a customer actually pays the link. The webhook carries the transaction's `id` and
`transactionId` fields.

**Correlation strategy (replaces spec assumption):**

At create time, store:
- `providerPaymentLinkId` = `data.id` (the payment link UUID)
- `paymentUrl` = `data.link` (the hosted checkout URL)
- `providerTxnId` = null at create time; populate from webhook `data.transactionId`

In the webhook:
- Primary correlation: `data.extraData.orderId` → look up `Payment` by `orderId`.
- Secondary/audit: verify `data.id` matches `payment.providerPaymentLinkId`.
- After verification: set `providerTxnId` = `data.transactionId` on the payment row.

The re-fetch reconciliation in Task 6 (`GET /transactions/$transactionId`) uses the
`providerTxnId` written by the webhook handler.

**Impact on schema (Task 2):** No change needed — `providerTxnId String? @unique`
is still correct; it just won't be populated until the webhook fires (not at create time).

## 3. extraData echoed?

**Yes.** Confirmed from `payments/create` response:
```json
"extraData": { "orderId": "SPIKE-TEST-005" }
```
The `extraData` object is returned in the create response **and** will appear in the
webhook `data.extraData`. This is the load-bearing correlation key.

**Webhook payload shape (from docs):**
```json
{
  "event": "payment.received",
  "data": {
    "id": "<payment-link-uuid>",
    "transactionId": "<transaction-uuid>",
    "transactionStatus": "paid",
    "status": "SUCCESS",
    "amount": 2900,
    "paymentMethod": "qris",
    "extraData": { "orderId": "<our orderId>" },
    "customerName": "...",
    "customerEmail": "...",
    "customerMobile": "..."
  }
}
```

## 4. paymentMethod: "QRIS" restricts channel?

**Result: 400 "Payment channel configuration not found" when `paymentMethod: "QRIS"` is set.**

The sandbox account has no QRIS channel configured. Omitting `paymentMethod` works fine.
On the hosted checkout page for the payment link, the customer sees whatever payment
methods are available to the merchant. Once QRIS is activated on production, including
`paymentMethod: "QRIS"` will restrict the hosted page to QRIS only.

**Decision:** Omit `paymentMethod` in `createMayarPayment()`. Document that QRIS will
be enforced at the UI layer (the hosted page) once production QRIS is activated.
The spec's "QRIS only" requirement is maintained in intent but not in the API call.

## 5. Observed status values

| Source | Field | Value |
|---|---|---|
| Create response | `status` | `"unpaid"` |
| Transaction GET | `status` | `"created"` (before payment), `"SUCCESS"` (after) |
| Webhook event | `event` | `"payment.received"` |
| Webhook data | `transactionStatus` | `"paid"` |
| Webhook data | `status` | `"SUCCESS"` |

**For Task 5 webhook handler:** trigger processing when `data.transactionStatus === "paid"`
or `data.status === "SUCCESS"` (check both for resilience).

**For Task 6 status re-fetch:** `GET /transactions/{transactionId}` returns `status`
field, confirmed `"created"` while unpaid, `"SUCCESS"` after payment.

## 6. Link expiry

**`expiredAt` is supported** — confirmed returned in `payments/create` response
(`"expiredAt": "2026-07-28T19:56:31.572Z"` in the test call).

Without `expiredAt`, Mayar sets a short default expiry (~1 hour observed in test).
**The production create call should always set `expiredAt`** to a meaningful window
(e.g., 24 hours from now) so customers can complete payment without time pressure.

**Impact on Task 3 (`mayar.ts`):** Add `expiredAt` as a required parameter in
`createMayarPayment()`. The route (Task 4) computes it based on a configurable
duration (e.g., 24 hours from `Date.now()`).

## Summary of adjustments to downstream tasks

| Task | Spec assumption | Actual | Impact |
|---|---|---|---|
| Task 3 | `paymentMethod: "QRIS"` | Omit — 400 without QRIS config | Remove `paymentMethod` field from create call |
| Task 3 | Store `transactionId` from create | `transactionId: null` at create | Store `providerPaymentLinkId` = `id`; `providerTxnId` stays null until webhook |
| Task 3 | `extraData.orderId` correlation | Confirmed working | No change |
| Task 3 | `expiredAt` optional | Use always | Add `expiredAt` param (24h window) |
| Task 5 | Header-based token verification | Query-param `?token=` | `searchParams.get("token")` comparison |
| Task 5 | Correlate via `transactionId` | Correlate via `extraData.orderId` | Look up `Payment` by `orderId` from `data.extraData.orderId` |
| Task 5 | Trigger on any status | Trigger on `data.transactionStatus === "paid"` | Check `transactionStatus` or `status === "SUCCESS"` |
| Task 6 | Re-fetch via `transactionId` (stored at create) | `providerTxnId` null until webhook fires it | Guard: if `providerTxnId` is null, return status from DB only |
| Task 10 | Simulate via `paymentMethod: QRIS` | Omit `paymentMethod` | No `paymentMethod` in simulate script |

## Raw API responses (evidence)

### payments/create (no paymentMethod)
```
HTTP 200
id: 7587454c-67e4-4d96-8589-e459f6aea2e2
transactionId: None
paymentLinkId: 7587454c-67e4-4d96-8589-e459f6aea2e2
link: https://umkmcepat.mayar.shop/pl/nugcromhj/
amount: 2900
status: unpaid
expiredAt: 2026-07-28T19:56:31.572Z
extraData: {orderId: SPIKE-TEST-005}
```

### transactions/{id} (invoice, pre-payment)
```
HTTP 200
id: 2877cfc3-90e0-48a6-ab50-a7490903e4cf
extraData: None
amount: 2900
status: created
paymentLinkId: 873e6f1e-049e-42e3-b0b2-765a90e9be9f
paymentMethod: None
```

### payment-channels
```
HTTP 200
data: null   ← no channels configured on sandbox account
```

## 7. Sandbox hosted checkout broken (2026-07-31)

**Symptom:** Create invoice/payment returns 200 with
`link: https://umkmcepat.mayar.shop/invoices/<slug>`, but:

- `https://umkmcepat.mayar.shop/` → plain `404 page not found` (entire host)
- `https://umkmcepat.myr.id/invoices/<slug>` → SPA shell 200, then **"Invoice Not Found"**
  (`myr.id` is the **production** storefront; sandbox invoices live only on
  `api.mayar.club` and are not visible there)
- `paymentMethod: "qris"` → 400 `Payment channel configuration not found`
- `GET /payment-channels` → `data: null`
- Dynamic QR (`POST /qr-codes/create`) returns an image URL only — **no**
  `transactionId` / order correlation, so it cannot replace invoice checkout
  for our webhook flow

**Conclusion:** Not an app bug. Mayar sandbox storefront host for this
merchant is down / unrouted, and payment channels are not enabled. Paid rows
from 2026-07-29–30 show checkout worked briefly before; it does not now.

**What we can do in-app:** nothing that restores hosted sandbox checkout.
Options: (1) Mayar support fix `*.mayar.shop` + enable channels on sandbox,
(2) test against production Mayar keys, (3) local flow via
`scripts/simulate-payment.ts` + admin verify / webhook with tunnel.

**Do not** rewrite `*.mayar.shop` → `*.myr.id` on sandbox: wrong environment.
