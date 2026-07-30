# Transactional Email System

## Motivation

UMKM Cepat has a working Resend-based email adapter (`src/lib/email.ts`) and one consumer (admin support reply). All other transactional emails — signup welcome, waitlist decisions, payment receipts, ban/unban notifications, ticket resolved — are documented as "future" or left unaddressed. This spec designs the complete transactional email system: consistent templates, every trigger point identified, and each email wired to its code location.

## Design

### Architecture

```
┌─────────────────────────────────────────────────────┐
│  src/lib/email/templates/                           │
│                                                     │
│  wrapper.ts       ← shared HTML wrapper             │
│                     (header, footer, branding,       │
│                      auto-email disclaimer)          │
│                                                     │
│  welcome.ts       ← sendWelcomeEmail()              │
│  waitlist.ts      ← sendWaitlistAccepted/Rejected() │
│  payment.ts       ← sendPaymentReceipt()            │
│  ban.ts           ← sendBanned/Unbanned()           │
│  support.ts       ← sendSupportResolved()           │
│                                                     │
│  index.ts         ← re-exports                      │
└──────────────────────┬──────────────────────────────┘
                       │ calls
┌──────────────────────▼──────────────────────────────┐
│  src/lib/email.ts                                   │
│  sendEmail({ to, subject, html, text })             │
│  → Resend API (or mock in dev)                      │
└─────────────────────────────────────────────────────┘
```

### Shared Wrapper (`wrapper.ts`)

A single `wrapEmail(contentHtml, options?)` function that produces the full HTML document with:

- **Header**: "UMKM Cepat" branding
- **Body**: the caller's content HTML injected
- **Footer**: "Terima kasih, Tim UMKM Cepat" + small "Jangan balas email ini" disclaimer
- **CTA button helper**: a function that generates a styled `<a>` button for calls-to-action

The wrapper produces both `html` and `text` variants via a single call, returning `{ html, subject }` that the caller passes to `sendEmail()`.

### Template Emails

#### 1. Welcome Email — signup completed

| Field | Value |
|---|---|
| **Trigger** | `events.linkAccount()` fires in Auth.js config |
| **To** | `user.email` |
| **Subject** | `Selamat Datang di UMKM Cepat, {name}!` |
| **Body** | Welcome message, what they can do (build website, manage), CTA to start |
| **CTA** | "Mulai Bangun Website" → `/` |

#### 2. Waitlist Accepted

| Field | Value |
|---|---|
| **Trigger** | Admin approves `api.admin.waitlist` POST |
| **To** | `entry.email` |
| **Subject** | `Pendaftaran Anda Diterima — Selamat Bergabung!` |
| **Body** | Congratulatory, can now log in and start building |
| **CTA** | "Masuk ke UMKM Cepat" → `/` |

#### 3. Waitlist Rejected

| Field | Value |
|---|---|
| **Trigger** | Admin rejects `api.admin.waitlist` POST |
| **To** | `entry.email` |
| **Subject** | `Pendaftaran Anda Belum Bisa Diproses` |
| **Body** | Empathetic rejection, reason included if provided, invite to contact hello@umkmcepat.com |
| **CTA** | None (just contact email) |

#### 4. Payment Receipt — webhook + admin verify

| Field | Value |
|---|---|
| **Trigger** | Webhook `api.payment.webhook` or admin `api.admin.transactions/{id}/verify` |
| **To** | `user.email` (fetched from `payment.userId`) |
| **Subject** | `Pembayaran Berhasil — {packageName}` |
| **Body** | Package name, amount, energy granted, date, invoice ID |
| **CTA** | "Lihat Transaksi" → `/profile/transactions` |

#### 5. Account Banned

| Field | Value |
|---|---|
| **Trigger** | Admin bans user `api.admin.users/{id}?action=ban` |
| **To** | `user.email` (fetched before ban) |
| **Subject** | `Akun Anda Diblokir — UMKM Cepat` |
| **Body** | Notification of ban, contact hello@umkmcepat.com for details |
| **CTA** | None |

#### 6. Account Unbanned

| Field | Value |
|---|---|
| **Trigger** | Admin unbans user `api.admin.users/{id}?action=unban` |
| **To** | `user.email` |
| **Subject** | `Akun Anda Sudah Aktif Kembali — UMKM Cepat` |
| **Body** | Account reinstated, can log in again |
| **CTA** | "Masuk ke UMKM Cepat" → `/` |

#### 7. Ticket Resolved

| Field | Value |
|---|---|
| **Trigger** | Admin resolves ticket `api.admin.tickets/{id}/resolve` |
| **To** | `ticket.user.email` (via ticket → user relation) |
| **Subject** | `Tiket Dukungan #{shortId} Telah Selesai` |
| **Body** | Ticket has been resolved, thanks for patience |
| **CTA** | "Lihat Tiket" → `/support/{ticketId}` |

### Integration Points (8 triggers)

| # | Trigger | File | Line | What to add |
|---|---|---|---|---|
| 1 | Auth signup | `src/lib/auth-config.ts` | 84 (`linkAccount`) | Call `sendWelcomeEmail()` after `linkApprovedWaitlistOnSignup` |
| 2 | Waitlist accept | `src/routes/api.admin.waitlist.ts` | 50-53 | After `approveWaitlistEntry()`, fetch entry email, call `sendWaitlistAccepted()` |
| 3 | Waitlist reject | `src/routes/api.admin.waitlist.ts` | 55-62 | After `rejectWaitlistEntry()`, fetch entry email, call `sendWaitlistRejected()` |
| 4 | Payment webhook | `src/routes/api.payment.webhook.ts` | 172-187 | After grant energy succeeds (`result`), fetch user email, call `sendPaymentReceipt()` |
| 5 | Payment admin verify | `src/routes/api.admin.transactions.$orderId.verify.ts` | 63-95 | After transaction grant succeeds, fetch user email, call `sendPaymentReceipt()` |
| 6 | Ban user | `src/routes/api.admin.users.$id.ts` | 19-24 | Before/after ban, fetch user email, call `sendBannedNotification()` |
| 7 | Unban user | `src/routes/api.admin.users.$id.ts` | 26-31 | Before/after unban, fetch user email, call `sendUnbannedNotification()` |
| 8 | Resolve ticket | `src/routes/api.admin.tickets.$ticketId.resolve.ts` | 19-24 | After `resolveTicket()` succeeds, fetch ticket user email, call `sendTicketResolved()` |

### Error Handling

Email sending is **always non-fatal**. If sending fails:
- Log the error via `devLog` / `console.error`
- Return success to the caller (don't block the primary action)
- Follow the existing pattern in `support/email.ts`

Rationale: a payment should complete even if the receipt email bounces.

### Dev Mock Mode

All emails work in dev without a Resend key. `sendEmail()` already mocks in dev (logs to console). No changes needed there.

### Testing

- Each template builder function gets a unit test (asserts subject, HTML structure, CTA link)
- Integration tests for the senders mock `sendEmail` and assert it's called with correct args
- Pattern follows `src/lib/support/email.test.ts`

### Files to Create

```
src/lib/email/templates/
├── wrapper.ts
├── welcome.ts
├── waitlist.ts
├── payment.ts
├── ban.ts
├── support.ts
├── index.ts
```

### Files to Modify

```
src/lib/auth-config.ts               ← insert welcome email
src/routes/api.admin.waitlist.ts      ← insert waitlist emails
src/routes/api.payment.webhook.ts     ← insert payment receipt
src/routes/api.admin.transactions.$orderId.verify.ts ← insert payment receipt
src/routes/api.admin.users.$id.ts     ← insert ban/unban emails
src/routes/api.admin.tickets.$ticketId.resolve.ts    ← insert ticket resolved email
```

### Non-Goals

- Unsubscribe / opt-out (not needed at current scale; Resend handles bounces)
- Email tracking DB table (Resend dashboard suffices)
- HTML email design polish beyond existing brand-consistent wrapper
