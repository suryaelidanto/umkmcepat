# Payment create reuse + Mayar 429 resilience — design

**Status:** approved for implementation  
**Author:** agent + suryaelidanto  
**Date:** 2026-08-02

## Context

`POST /api/payment/create` always calls Mayar `POST /invoices/create`. Mayar
returns **429** when it detects a duplicate create within ~1 minute:

```json
{"statusCode":429,"messages":"Duplicate request detected. Please wait 1 minute before trying again."}
```

Our route maps that to HTTP 500 + `"Pembayaran gagal. Coba lagi."`. Symptom is
intermittent on `dev.umkmcepat.com` (shared Mayar key + rapid retries); local
often looks fine because creates are spaced further apart.

Root cause is **not** Cloudflare tunnel config. Mayar rejects near-identical
creates; we keep sending them.

## Goals

1. Reuse an existing open PENDING invoice for the **same pack** instead of
   creating a new Mayar invoice.
2. Surface Mayar 429 as a clear wait message (not a generic payment failure).
3. Harden the client against double-submit before React re-renders.

## Non-goals

- Prisma migration / new columns (`expiresAt`, `CANCELLED`)
- Cancel-payment API or UI
- Force-new invoice for the same pack within the reuse window
- Mark old PENDING as FAILED when changing pack
- Live Mayar status/expiry check on every create (optional later)
- Retry-with-backoff on 429 (worsens the problem)

## Product rules (decided)

| Case | Behavior |
|------|----------|
| Buy pack X again while PENDING for X within reuse window | Return existing `orderId` + `paymentUrl`; **no** Mayar call |
| PENDING pack A, buy pack B | Leave A PENDING; create new Mayar invoice for B |
| Abandon A, want fresh invoice for A | Not supported this round — reuse A until window ends |
| Mayar 429 with no reusable PENDING | HTTP 429 + Indonesian wait copy |

## Data already available (no migration)

`Payment` already stores:

- `paymentUrl`
- `status` (`PENDING` / `COMPLETED` / `FAILED`)
- `metadata` JSON (includes `packageId` at create)
- `createdAt`
- `orderId`, `amount`, `energyGranted`

Reuse is a **read** of that row.

## Reuse window

Create path already sets Mayar `expiredAt = now + 24h`. Reuse window matches
**our** create TTL, not Mayar's undocumented default (~1h without `expiredAt`):

```ts
const PAYMENT_LINK_TTL_MS = 24 * 60 * 60 * 1000;
// reusable if createdAt > now - PAYMENT_LINK_TTL_MS
```

Local clock only for v1. No Mayar GET on create.

## Server algorithm (`POST /api/payment/create`)

After auth, ban check, and pack validation:

1. `findFirst` Payment where:
   - `userId` = session user
   - `status` = `"PENDING"`
   - `paymentUrl` is not null
   - `createdAt` > `now - PAYMENT_LINK_TTL_MS`
   - `metadata.packageId` equals requested `packageId`
   - order by `createdAt` desc
2. If found → return `{ success, orderId, amount, paymentUrl, status }` from DB.
   Skip Mayar. Skip `payment.create`.
3. Else → existing create path (Mayar → insert PENDING → return).
4. On Mayar error:
   - If message matches `429` or `Duplicate request` → HTTP **429**, message
     `"Permintaan sama terdeteksi. Tunggu sekitar 1 menit, lalu coba lagi."`
   - Else → HTTP 500 + existing `mapToUserFacingError` mapping

## Client (`EnergyBoosterModal`)

- Keep `disabled={isCreating}` on CTA.
- Add a `useRef` lock so a second click before re-render cannot fire a second
  `POST`. Clear lock in `finally` and when modal closes.

## Error copy

| Condition | Status | User message |
|-----------|--------|--------------|
| Mayar 429 / Duplicate request | 429 | `Permintaan sama terdeteksi. Tunggu sekitar 1 menit, lalu coba lagi.` |
| Other Mayar / payment errors | 500 | `Pembayaran gagal. Coba lagi.` (existing) |

Prefer mapping in the create route (status code matters). Optional helper in
`user-facing-error.ts` only if it stays a pure string mapper; do not force 429
through a function that returns only message.

## Out of scope edge cases (accepted)

- Two tabs race with no PENDING yet: both may hit Mayar; second can 429.
  Client lock reduces single-tab doubles. No advisory lock this round.
- User pays abandoned PENDING later: energy still granted (correct).
- Local TTL says reusable but Mayar already closed/expired early: rare; user
  may open a dead link until TTL ends. Fix later with optional invoice GET.

## Verification

- Unit: reuse same pack skips Mayar; different pack creates; expired PENDING
  creates; 429 mapping.
- Manual: buy max → close → buy max again → same `paymentUrl`, no Mayar 429
  in logs; buy max then pocket → new invoice.

## Docs

This design is the canonical note for create-reuse behavior. Mayar migration
design is not rewritten; this is additive resilience on top of invoices create.
