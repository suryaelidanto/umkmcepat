# Support Ticketing (User → Admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a support ticketing feature where signed-in users can report tickets (with up to 3 image attachments), and admins can see and answer user tickets via a dedicated admin tab. Admin replies trigger email notifications.

**Architecture:** Add Prisma schemas for `SupportTicket` and `SupportMessage`. Create core backend domain services under `src/lib/support/` for ticket lifecycle operations, email rendering, and badge counts. Scaffold user-facing routes (`/support`, `/support/$ticketId`) and admin-facing routes (`/admin/tickets`, `/admin/tickets/$ticketId`), along with their APIs.

**Tech Stack:** React, TypeScript, TanStack Start, TanStack Router, Prisma, Resend (emails), local S3 dev mirror (storage).

## Global Constraints

- Indonesian language for all user-facing UI copy.
- English for developer docs, code, tests, and backend logs.
- Absolute YAGNI: no ticket priority, no assignee fields, no per-ticket read tracking.
- Test-driven: write unit and component tests first.

---

### Task 1: Prisma Migration & Schema Definition

**Files:**
- Modify: `prisma/schema.prisma`
- Create: Migration directory and SQL file (via prisma CLI)

**Interfaces:**
- Consumes: None
- Produces: `SupportTicket` and `SupportMessage` Prisma models on the DB client.

- [ ] **Step 1: Write the schema changes**
Modify `prisma/schema.prisma` to add:
```prisma
enum SupportCategory {
  TEKNIS
  PEMBAYARAN
  UMUM
}

enum SupportTicketStatus {
  OPEN
  RESOLVED
}

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
And add `supportTickets SupportTicket[]` to the `User` model.

- [ ] **Step 2: Generate and run migration**
Run: `bun prisma migrate dev --name add_support_ticket`
Expected: Successfully applied migration.

- [ ] **Step 3: Commit**
```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "db: add support ticketing models"
```

---

### Task 2: Core Domain Logic & Unit Tests

**Files:**
- Create: `src/lib/support/service.ts`
- Create: `src/lib/support/service.test.ts`

**Interfaces:**
- Consumes: Prisma Client
- Produces: `createTicket`, `addMessage`, `resolveTicket`, `getUnreadCounts` helper functions.

- [ ] **Step 1: Write the failing tests first**
Create `src/lib/support/service.test.ts` to assert logic for:
- Validation rules (subject size, content length, asset counts).
- Ticket creation returning new ticket ID.
- Message appending.
- Resolve rules (admin can always resolve, user can resolve only if status=OPEN and last message is from user).
- Unread count badges (user unread count = count of open tickets; admin unread count = count of open tickets with latest message by user).

- [ ] **Step 2: Run tests to verify failure**
Run: `bun vitest run src/lib/support/service.test.ts`
Expected: Tests fail because service is not implemented.

- [ ] **Step 3: Implement core service**
Create `src/lib/support/service.ts` implementing `createTicket`, `addMessage`, `resolveTicket`, and `getUnreadCounts` checking role and status restrictions.

- [ ] **Step 4: Verify tests pass**
Run: `bun vitest run src/lib/support/service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/lib/support/
git commit -m "feat(support): core support ticketing service logic and tests"
```

---

### Task 3: Support Asset Upload API & Email Notification

**Files:**
- Create: `src/lib/support/email.ts`
- Create: `src/lib/email/templates/support-admin-replied.tsx`
- Create: `src/routes/api.support.assets.ts`

**Interfaces:**
- Consumes: `src/lib/object-storage.ts`, `src/lib/email.ts`
- Produces: Endpoint for image uploads under `support/` prefix; email trigger on admin reply.

- [ ] **Step 1: Write email template and sending function**
Create the email template in React-email style at `src/lib/email/templates/support-admin-replied.tsx` and the sending function `sendSupportReplyEmail` in `src/lib/support/email.ts` that wraps Resend's client.

- [ ] **Step 2: Write asset upload endpoint**
Create `src/routes/api.support.assets.ts` to receive `multipart/form-data` with images, validate file counts (max 3), types (PNG, JPEG, WEBP, GIF), and size (max 5MB), then upload via `putStoredObject` under the `support/` prefix.

- [ ] **Step 3: Add unit tests for email and upload verification**
Create corresponding tests to verify validation rules and email trigger conditional checks.

- [ ] **Step 4: Run tests**
Run: `bun vitest run src/lib/support/`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/routes/api.support.assets.ts src/lib/support/email.ts src/lib/email/templates/
git commit -m "feat(support): support assets upload and email reply triggers"
```

---

### Task 4: API Endpoints for Support & Admin

**Files:**
- Create: `src/routes/api.support.tickets.ts`
- Create: `src/routes/api.support.tickets.$ticketId.ts`
- Create: `src/routes/api.support.tickets.$ticketId.resolve.ts`
- Create: `src/routes/api.support.unread-count.ts`
- Create: `src/routes/api.admin.tickets.ts`
- Create: `src/routes/api.admin.tickets.$ticketId.ts`
- Create: `src/routes/api.admin.tickets.$ticketId.reply.ts`
- Create: `src/routes/api.admin.tickets.$ticketId.resolve.ts`
- Create: `src/routes/api.admin.tickets.unread-count.ts`

**Interfaces:**
- Consumes: `src/lib/support/service.ts`
- Produces: Full routing and JSON endpoints for support.

- [ ] **Step 1: Write route handlers**
Implement TanStack Start API handlers parsing input parameters, checking `auth` / `requireAdmin`, and delegating execution to the support service functions.

- [ ] **Step 2: Add integration tests**
Add API integration tests mock-calling these endpoints and asserting expected statuses and results.

- [ ] **Step 3: Run verify command to generate routes and check builds**
Run: `bun run verify`
Expected: PASS and generated routes updated.

- [ ] **Step 4: Commit**
```bash
git add src/routes/api.support.* src/routes/api.admin.tickets*
git commit -m "feat(support): API endpoints for tickets and administrative replies"
```

---

### Task 5: User Support Interface

**Files:**
- Create: `src/routes/_main.support.tsx`
- Create: `src/routes/_main.support.$ticketId.tsx`
- Modify: `src/components/profile/ProfileMenu.tsx` (Add Support link)

**Interfaces:**
- Consumes: User support APIs
- Produces: Interactive customer-facing ticketing pages.

- [ ] **Step 1: Implement ticketing list page**
Scaffold `/support` displaying user's ticket list, a category pill filter, and an expandable form to create a new ticket (allowing image drops/uploads).

- [ ] **Step 2: Implement ticket thread page**
Scaffold `/support/$ticketId` styling user/admin messages as a chat thread, showing attached images, allowing inline replies, and a "Tandai Selesai" button.

- [ ] **Step 3: Write component tests**
Write tests for rendering state, pagination/list, error states, and image thumbnail previews.

- [ ] **Step 4: Commit**
```bash
git add src/routes/_main.support* src/components/profile/
git commit -m "feat(support): user interface pages for support list and details"
```

---

### Task 6: Admin Tickets Dashboard

**Files:**
- Create: `src/routes/_main.admin.tickets.tsx`
- Create: `src/routes/_main.admin.tickets.$ticketId.tsx`
- Modify: `src/components/admin/AdminTabs.tsx` (Add tickets tab)

**Interfaces:**
- Consumes: Admin ticket APIs, `requireAdmin` checks
- Produces: Administrative ticket resolution console.

- [ ] **Step 1: Add administrative tickets tab**
Update `AdminTabs.tsx` to include "Tiket" route mapping to `/admin/tickets`. Wire the admin unread count badge to show count of open user tickets waiting.

- [ ] **Step 2: Implement Admin tickets list**
Create list dashboard at `/admin/tickets` showing active tickets sorted by update date. Include status filtering and category markers. Apply `SensitiveText` helper for user emails if streamer mode is enabled.

- [ ] **Step 3: Implement Admin reply thread**
Create administrative reply workspace at `/admin/tickets/$ticketId` showing history, reply entry box, and action options to resolve.

- [ ] **Step 4: Run verify script to validate build**
Run: `bun run verify`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/routes/_main.admin.tickets* src/components/admin/
git commit -m "feat(support): admin dashboard interface for support resolution"
```
