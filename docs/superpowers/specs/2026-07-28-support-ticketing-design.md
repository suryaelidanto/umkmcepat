# Support Ticketing (User → Admin) — Design

**Date:** 2026-07-28
**Topic:** New feature — in-app customer support between signed-in UMKM users and the single-maintainer admin.
**Status:** Spec approved 2026-07-28. Plan not yet written.

## Goal

Give a signed-in UMKM user a clear way to ask for help with the product (bug, payment issue, general question), and give the maintainer (admin) an inbox under `/admin/tickets` to read and reply. Replies on the admin side fire a Resend email to the user with a deep link back to the thread. Attachments are images only, both directions, via the existing RustFS (local) / R2 (prod) pipeline.

## Why

There is currently no way for a real user to ask the maintainer a question inside the product. The platform is gated (waitlist + per-account daily energy quota), users occasionally hit friction (OTP credit exhaustion, payment webhooks, generator quirks), and the maintainer has no inbox — only the `/admin` tabs that look at users, waitlist, and transactions. This adds a small, opinionated support thread model that fits the existing admin surface and the existing storage/email infra, without inventing new abstractions.

## Decisions (locked during brainstorming)

1. **Signed-in users only.** Entry points: profile dropdown item "Dukungan", and (when inside a project) a "Dukungan" item in the workspace header. No public `/dukung` page in v1.
2. **Three categories, no priority.** Category enum: `TEKNIS`, `PEMBAYARAN`, `UMUM` (Indonesian). Priority is intentionally absent — admin inbox is just `OPEN` / `RESOLVED`. YAGNI.
3. **Image attachments, both directions.** User and admin can each attach up to 3 images per message. Stored via the existing `object-storage` helper under a `support/{ticketId}/{messageId}/...` prefix, served via the existing `/media/<assetId>` route. Max 5 MB per image; image MIME whitelist enforced server-side. No PDFs/videos in v1.
4. **Notifications.** User gets an in-app badge (count of own OPEN tickets) on the navbar support entry + a Resend email when the admin replies. Admin gets an in-app badge on the new AdminTabs "Tiket" tab — count of OPEN tickets whose latest message is from a user (i.e., needs a reply). No admin email; single maintainer watches `/admin`.
5. **Multi-admin = no claiming.** Both admins (env-allowlist) can reply on the same thread. Replies land chronologically. Each message carries `authorRole` so the thread is self-explanatory. No "claimed/assigned" state in v1.
6. **Badge model = open-ticket count.** No per-ticket `lastSeenSupportAt` on `User`. User badge = count of own tickets with `status=OPEN`. Admin badge = count of OPEN tickets where the latest message's `authorRole` is `user`.
7. **Admin = env-allowlist (`ADMIN_EMAILS`).** No `Role` column, no RBAC. Reuses the existing `requireAdmin()` helper. Same fail-safe model as the waitlist admin spec.
8. **Email fires only on the first admin reply after a user message.** Trigger condition for sending the Resend email: `previous.message.authorRole === 'user'` OR there is no previous message. Admin/admin exchanges or admin/user-after-admin replies do NOT email — avoids spamming the user.
9. **Resolve paths.** User can resolve their own ticket (when `status=OPEN` and the latest message is from the user). Admin can resolve at any time. Resolve does NOT send an email. Resolve sets `resolvedAt` and `resolvedBy` (admin userId when admin-resolved; null when user-resolved).
10. **Single-process in-memory cache for unread counts.** 30s TTL, keyed by `(userId)` for users and `(admin|global)` for the admin badge. YAGNI — no AppSetting/Redis. Re-evaluate when we go multi-instance in prod.

## Architecture

### Prisma additions

```prisma
enum SupportCategory { TEKNIS PEMBAYARAN UMUM }
enum SupportTicketStatus { OPEN RESOLVED }

model SupportTicket {
  id         String              @id @default(cuid())
  userId     String
  subject    String              @db.VarChar(140)
  category   SupportCategory
  status     SupportTicketStatus @default(OPEN)
  createdAt  DateTime            @default(now())
  updatedAt  DateTime            @updatedAt
  resolvedAt DateTime?
  resolvedBy String?
  user       User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages   SupportMessage[]
  @@index([status, updatedAt])
  @@index([userId, updatedAt])
}

model SupportMessage {
  id         String        @id @default(cuid())
  ticketId   String
  authorId   String
  authorRole String        @db.VarChar(16) // 'user' | 'admin'
  body       String        @db.Text
  createdAt  DateTime      @default(now())
  ticket     SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  assetIds   String[]
  @@index([ticketId, createdAt])
}
```

Add `supportTickets SupportTicket[]` to `User.relations`. No new env vars. Migration: `20260728000000_add_support_ticket`.

### Routes

- `src/routes/_main.support.tsx` — user list + inline new-ticket form.
- `src/routes/_main.support.$ticketId.tsx` — user thread view + reply form.
- `src/routes/_main.admin.tickets.tsx` — admin list with filter chips.
- `src/routes/_main.admin.tickets.$ticketId.tsx` — admin thread view + reply form.
- New tab "Tiket" in `src/components/admin/AdminTabs.tsx` (between Antrean and Transaksi).
- New "Dukungan" item in the profile dropdown (`src/components/profile/ProfileMenu.tsx` or equivalent — match existing structure).
- New "Dukungan" entry in the workspace header (inside the project shell), shown only when signed-in.

### API endpoints

| Method + Path | Purpose | Auth |
|---|---|---|
| `GET /api/support/tickets` | List own tickets (any status). | session |
| `POST /api/support/tickets` | Create ticket + first user message. | session |
| `GET /api/support/tickets/{ticketId}` | Get own thread. | session + ownership |
| `POST /api/support/tickets/{ticketId}` | Reply as user. | session + ownership + status=OPEN |
| `POST /api/support/tickets/{ticketId}/resolve` | User-resolve. | session + ownership + status=OPEN + last-message-from-user |
| `GET /api/support/unread-count` | User badge: count of own OPEN tickets. | session |
| `GET /api/admin/tickets` | List all (filter by `status`, `category`). | `requireAdmin` |
| `GET /api/admin/tickets/{ticketId}` | Get any thread. | `requireAdmin` |
| `POST /api/admin/tickets/{ticketId}/reply` | Admin reply (triggers email conditionally). | `requireAdmin` + status=OPEN |
| `POST /api/admin/tickets/{ticketId}/resolve` | Admin-resolve. | `requireAdmin` + status=OPEN |
| `GET /api/admin/tickets/unread-count` | Admin badge: OPEN tickets whose latest message is from a user. | `requireAdmin` |

All POSTs accept JSON `{subject?, body, category?, assetIds?}` shaped per endpoint. Image upload itself goes through the existing `/api/projects/$id/assets` (or a new `POST /api/support/assets` that wraps `object-storage.put` with a `support/{ticketId}/{messageId}/` key prefix — pick the smallest surface in implementation; current default: dedicated `api.support.assets.ts` to keep policy in one place).

### Domain logic (new `src/lib/support/`)

- `src/lib/support/create-ticket.ts` — validates subject/category/body/assetIds, uploads images, inserts ticket + first message in one transaction. Returns `{ticketId, firstMessageId}`.
- `src/lib/support/add-user-message.ts` — ownership + OPEN checks, insert, bump `updatedAt`. No email.
- `src/lib/support/add-admin-message.ts` — `requireAdmin`, OPEN check, insert, bump `updatedAt`, conditionally call `sendSupportReplyEmail`.
- `src/lib/support/resolve-ticket.ts` — paths: user-resolve (status=OPEN + last-from-user) and admin-resolve (`requireAdmin`, status=OPEN).
- `src/lib/support/email.ts` — `sendSupportReplyEmail({toEmail, ticketShortId, subject, body, ticketId})`. Subject: `Balasan untuk tiket #{short} — UMKM Cepat`. Body: rendered from `src/lib/email/templates/support-admin-replied.tsx` (matches existing template style). Uses existing `sendEmail` in `src/lib/email.ts`.
- `src/lib/support/unread-count.ts` — `userUnreadCount(userId)` and `adminUnreadCount()`. The admin variant returns the count of OPEN tickets where the latest message's `authorRole === 'user'` (or there are no messages — vacuously false, no badge).
- `src/lib/support/cache.ts` — tiny `Map`-based TTL cache, 30s. Keyed by `'user:' + userId` and `'admin:badge'`. Best-effort; never throws.

### Storage

Reuse `src/lib/object-storage.ts` + `src/lib/storage-provider.ts`. New prefix: `support/{ticketId}/{messageId}/{n}.{ext}`. Server enforces:

- max 3 images per message,
- MIME whitelist: `image/png`, `image/jpeg`, `image/webp`, `image/gif`,
- max 5 MB per image.

Existing `/media/{assetId}` route serves them back. No new public bucket; assets stay in the same private bucket as project assets.

### Email

Template lives at `src/lib/email/templates/support-admin-replied.tsx` and follows the same React-email-style shape as the existing waitlist templates. Uses `resend` via `src/lib/email.ts`. `from: 'UMKM Cepat <onboarding@resend.dev>'` (per the email-credit-budgets memory — dev onboarding domain delivers only to your own account email).

Trigger logic, in `add-admin-message`:

```ts
const last = await prisma.supportMessage.findFirst({
  where: { ticketId },
  orderBy: { createdAt: "desc" },
  skip: 1, // skip the message we just inserted
});
const shouldEmail = !last || last.authorRole === "user";
if (shouldEmail) {
  await sendSupportReplyEmail({ ... }).catch((err) =>
    logger.warn({ err, ticketId }, "support email failed (non-fatal)")
  );
}
```

### Badges

- New hook `src/lib/support/use-badge.ts` (client) — calls `/api/support/unread-count` (user) or `/api/admin/tickets/unread-count` (admin) on mount + on focus.
- User-side: badge rendered next to the "Dukungan" item in the profile dropdown and in the workspace header. Source of truth: server-side `userUnreadCount(userId)`. Cached 30s.
- Admin-side: badge in `AdminTabs` next to "Tiket" label. Source of truth: `adminUnreadCount()`. Cached 30s.

Streamer mode: existing `SensitiveText` already redacts in admin chrome; the new admin thread page uses it for user email/phone. No new streamer-mode work.

### Mobile

Both `/support` and `/admin/tickets` are stacked-list + bottom-sticky compose surfaces. `h-dvh`, safe-area insets, bottom action bar (resolve / reply button). Same mobile bar the waitlist admin set — no new design language.

## Data flow

**User creates a ticket:**

1. User signs in → clicks profile dropdown "Dukungan" (or workspace header item) → lands on `/support`.
2. Form expanded with subject, category dropdown, body, optional image attachments.
3. Client POSTs to `/api/support/tickets`. Server validates, uploads images to `support/{newTicketId}/{newMessageId}/`, inserts ticket + first user-message in one transaction.
4. Client redirects to `/support/{ticketId}`. Toast "Tiket dibuat".

**Admin replies (email fires):**

1. Admin opens `/admin/tickets`. Tab badge shows N (open tickets needing a reply).
2. Click into a thread → `/admin/tickets/{ticketId}`.
3. Types reply (text + optional images) → `POST /api/admin/tickets/{ticketId}/reply`.
4. Server inserts admin-message, bumps `updatedAt`, evaluates email trigger.
5. If trigger fires: `sendSupportReplyEmail` runs; on failure, log warn and continue (admin reply already succeeded).
6. Thread re-renders; user receives email; user-side badge decrements when they reload.

**User replies (no email):**

1. User opens `/support/{ticketId}` → thread renders.
2. Types reply → `POST /api/support/tickets/{ticketId}` → inserts user-message, bumps `updatedAt`, NO email.
3. Admin badge increments on next read.

**User resolves:**

1. Resolve button visible only if `status=OPEN` AND last message's `authorRole === 'user'`.
2. `POST /api/support/tickets/{ticketId}/resolve` → status=RESOLVED, `resolvedAt=now`, `resolvedBy=null`.
3. Card leaves OPEN list. Badge decrements.

**Admin resolves:**

1. Resolve button always visible to admin on `OPEN` tickets.
2. `POST /api/admin/tickets/{ticketId}/resolve` → status=RESOLVED, `resolvedAt=now`, `resolvedBy=admin.userId`.

## Error handling

| Surface | Failure | Behavior |
|---|---|---|
| Create ticket | empty subject/body, subject >140, bad category, >3 images, image MIME/size violation | 400 with field errors; form re-renders inline |
| Create ticket | object-storage upload failure | transaction rolled back; toast "Upload gagal, coba lagi" |
| User reply | not own ticket (403) / status != OPEN (409) / image policy | toast + leave form |
| Admin reply | not admin (401/403) / status != OPEN (409) | redirect to `/` (admin) or toast |
| Email send | Resend 4xx/5xx | logged at warn; reply still succeeds |
| User resolve | not own / not OPEN / last message not from user | 403/409; toast |
| Admin resolve | not admin / not OPEN | 403/409; toast |
| Unread-count | DB slow | in-memory 30s cache absorbs; UI shows last known value |
| Streamer mode | admin viewing user email | redacted via existing `SensitiveText` |

## Testing (TDD)

1. Unit — `createTicket`: subject length, body required, category enum, image count cap, MIME whitelist, size cap, transaction atomicity (failed upload rolls back ticket).
2. Unit — `addUserMessage`: ownership, status=OPEN, `updatedAt` bumped, no email.
3. Unit — `addAdminMessage`: `requireAdmin`, status=OPEN, email fires iff previous is user/none.
4. Unit — `resolveTicket`: user path (own + OPEN + last-from-user) and admin path (`requireAdmin` + OPEN). `resolvedBy` set correctly.
5. Unit — `sendSupportReplyEmail`: subject contains short ticket id; body contains reply text + deep-link to `/support/{ticketId}`; uses `sendEmail` from `src/lib/email.ts`.
6. Unit — `userUnreadCount` / `adminUnreadCount`: counts open tickets; admin variant excludes threads whose latest message is from admin.
7. Component — `/support`: lists own tickets; "Buat tiket baru" toggles form; optimistic create → redirect to thread.
8. Component — `/support/{ticketId}`: thread bubbles left/right by role; reply with 0–3 images; user-resolve button visibility rule.
9. Component — `/admin/tickets`: filter chips (Semua/OPEN/RESOLVED × kategori); tab badge updates.
10. Component — `/admin/tickets/{ticketId}`: admin reply triggers email (mocked), resolve always works, streamer-mode redaction applied.
11. Integration (env-gated): user creates → admin replies (assert email mock fired, thread updated) → admin resolves → user sees resolved in list; admin badge decrements.

## Out of scope (deferred to v2 if needed)

- Per-ticket read tracking / `lastSeenSupportAt`.
- Canned responses / macros.
- Auto-assignment / claiming.
- Non-image attachments (PDF, video).
- Public `/dukung` form for non-signed-in visitors.
- In-thread internal notes (admin-only messages hidden from user).
- SLA timers / priority.
- Email on resolve (only on reply in v1).
- External helpdesk sync / webhooks.
- Multi-instance cache (in-memory is enough for the current single-instance dev server; revisit when prod scales).

## Open questions for implementation

- Confirm the asset-upload endpoint shape: a new dedicated `POST /api/support/assets` (keeps policy co-located with `src/lib/support/`) vs reusing the existing project-asset endpoint. **Current default: new dedicated endpoint** — keeps the `support/{ticketId}/{messageId}/` prefix policy in one place and avoids leaking project-asset semantics.
- Confirm the "Dukungan" entry point in the profile dropdown doesn't already exist; if it does, reuse the slot.