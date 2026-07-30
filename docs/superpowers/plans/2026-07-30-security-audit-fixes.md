# Security Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two audit findings: authenticated mutation CSRF risk and support attachment asset ID laundering.

**Architecture:** Reuse the existing global request middleware in `src/start.ts` and `src/lib/security-headers.ts`; do not add per-route CSRF boilerplate. Add a small canonical `SupportAsset` DB model so support attachment authorization depends on upload ownership/binding, not user-controlled `SupportMessage.assetIds` alone.

**Tech Stack:** TanStack Start middleware/routes, Auth.js cookie sessions, Prisma/Postgres, Bun/Vitest.

## Global Constraints

- No worktree usage.
- Bun only.
- No new dependencies.
- Keep changes small and security-focused.
- User-facing copy stays Indonesian; developer-facing errors/tests stay English.
- Do not print secrets or env values.
- Prefer deletion/reuse; no speculative abstractions.

---

## File Structure

- Modify `src/lib/security-headers.ts`: harden unsafe API request classification.
- Modify or create test near existing security tests, preferred `src/lib/security-headers.test.ts`: prove cross-site, malformed, missing metadata cases.
- Modify `prisma/schema.prisma`: add `SupportAsset` model and relations.
- Create `prisma/migrations/20260730000001_add_support_assets/migration.sql`: support asset table/indexes.
- Modify `src/routes/api.support.assets.ts`: record uploaded support asset owner.
- Modify `src/lib/support/service.ts`: validate and bind support assets before storing `assetIds` on messages.
- Modify `src/routes/api.support.assets.$assetId.ts`: authorize downloads through `SupportAsset` binding.
- Modify `src/routes/api.admin.tickets.$ticketId.reply.ts`: pass admin user ID into same binding path.
- Add focused tests for support service if current test harness already mocks Prisma cleanly; otherwise add route-independent helper tests.

---

### Task 1: Harden unsafe API CSRF guard

**Files:**
- Modify: `src/lib/security-headers.ts`
- Test: `src/lib/security-headers.test.ts`

**Interfaces:**
- Consumes existing `isCrossSiteMutation(input)`.
- Produces same function signature; behavior becomes stricter for unsafe `/api/*` calls.

- [ ] **Step 1: Write failing tests**

Create/extend `src/lib/security-headers.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { isCrossSiteMutation } from "./security-headers";

const base = {
  method: "POST",
  origin: "https://evil.test",
  pathname: "/api/projects/p1/publish",
  requestOrigin: "https://app.test",
};

describe("isCrossSiteMutation", () => {
  it("blocks unsafe API requests with a foreign Origin", () => {
    expect(isCrossSiteMutation({ ...base, fetchSite: "same-origin" })).toBe(true);
  });

  it("blocks unsafe API requests marked cross-site by Fetch Metadata", () => {
    expect(
      isCrossSiteMutation({
        ...base,
        fetchSite: "cross-site",
        origin: "https://app.test",
      }),
    ).toBe(true);
  });

  it("allows same-origin unsafe API requests", () => {
    expect(
      isCrossSiteMutation({
        ...base,
        fetchSite: "same-origin",
        origin: "https://app.test",
      }),
    ).toBe(false);
  });

  it("keeps Auth.js, webhooks, and CSP report endpoints exempt", () => {
    for (const pathname of [
      "/api/auth/signout",
      "/api/payment/webhook",
      "/api/csp-violation",
    ]) {
      expect(isCrossSiteMutation({ ...base, pathname })).toBe(false);
    }
  });

  it("blocks unsafe API requests with no browser provenance headers", () => {
    expect(
      isCrossSiteMutation({
        ...base,
        fetchSite: null,
        origin: null,
      }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
bun test src/lib/security-headers.test.ts
```

Expected before implementation: final test fails because missing `Origin` + missing `Sec-Fetch-Site` currently returns `false`.

- [ ] **Step 3: Implement minimal hardening**

In `src/lib/security-headers.ts`, update the bottom of `isCrossSiteMutation` only:

```ts
  if (origin) {
    try {
      if (new URL(origin).origin !== requestOrigin) {
        return true;
      }
    } catch {
      return true;
    }
  }

  if (fetchSite === "cross-site") {
    return true;
  }

  if (!origin && !fetchSite && pathname.startsWith("/api/")) {
    return true;
  }

  return false;
```

Keep existing safe-method and exempt-route checks above it unchanged.

- [ ] **Step 4: Verify CSRF tests pass**

Run:

```bash
bun test src/lib/security-headers.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit task**

```bash
git add src/lib/security-headers.ts src/lib/security-headers.test.ts
git commit -m "fix(security): harden api csrf guard"
```

---

### Task 2: Add canonical support asset ownership

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260730000001_add_support_assets/migration.sql`

**Interfaces:**
- Produces Prisma model `SupportAsset` with fields:
  - `id: string`
  - `assetId: string @unique`
  - `uploadedById: string`
  - `ticketId?: string`
  - `messageId?: string`
  - `createdAt: DateTime`

- [ ] **Step 1: Add Prisma model**

In `prisma/schema.prisma`, add relations:

```prisma
model SupportTicket {
  id         String              @id @default(cuid())
  userId     String
  user       User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  subject    String
  category   SupportCategory
  status     SupportTicketStatus @default(OPEN)
  messages   SupportMessage[]
  assets     SupportAsset[]
  createdAt  DateTime            @default(now())
  updatedAt  DateTime            @updatedAt
  resolvedAt DateTime?
  resolvedBy String?
}

model SupportMessage {
  id         String         @id @default(cuid())
  ticketId   String
  ticket     SupportTicket  @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  authorId   String
  authorRole SupportRole
  body       String
  assetIds   String[]
  assets     SupportAsset[]
  createdAt  DateTime       @default(now())
}

model SupportAsset {
  id           String          @id @default(cuid())
  assetId      String          @unique
  uploadedById String
  uploadedBy   User            @relation(fields: [uploadedById], references: [id], onDelete: Cascade)
  ticketId     String?
  ticket       SupportTicket?   @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  messageId    String?
  message      SupportMessage?  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  createdAt    DateTime        @default(now())

  @@index([uploadedById, ticketId])
  @@index([messageId])
}
```

If `User` needs the reverse relation, add:

```prisma
supportAssets SupportAsset[]
```

- [ ] **Step 2: Add migration SQL**

Create `prisma/migrations/20260730000001_add_support_assets/migration.sql`:

```sql
CREATE TABLE "SupportAsset" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "ticketId" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportAsset_assetId_key" ON "SupportAsset"("assetId");
CREATE INDEX "SupportAsset_uploadedById_ticketId_idx" ON "SupportAsset"("uploadedById", "ticketId");
CREATE INDEX "SupportAsset_messageId_idx" ON "SupportAsset"("messageId");

ALTER TABLE "SupportAsset" ADD CONSTRAINT "SupportAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportAsset" ADD CONSTRAINT "SupportAsset_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportAsset" ADD CONSTRAINT "SupportAsset_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SupportMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Validate Prisma schema**

Run:

```bash
bunx prisma validate
```

Expected: schema valid.

- [ ] **Step 4: Commit task**

```bash
git add prisma/schema.prisma prisma/migrations/20260730000001_add_support_assets/migration.sql
git commit -m "fix(security): track support asset ownership"
```

---

### Task 3: Record and bind support assets

**Files:**
- Modify: `src/routes/api.support.assets.ts`
- Modify: `src/lib/support/service.ts`
- Modify: `src/routes/api.admin.tickets.$ticketId.reply.ts`
- Modify: `src/routes/api.support.tickets.ts`
- Modify: `src/routes/api.support.tickets.$ticketId.ts`

**Interfaces:**
- `createTicket(input: TicketInput)` continues returning `{ ticketId, firstMessageId }`.
- `addMessage(input: MessageInput)` continues returning `{ messageId }`.
- New helper inside `src/lib/support/service.ts`:

```ts
async function bindSupportAssets(tx: Prisma.TransactionClient, input: {
  assetIds: string[];
  authorId: string;
  ticketId: string;
  messageId: string;
})
```

- [ ] **Step 1: Update upload route to create pending asset row**

In `src/routes/api.support.assets.ts`, import `prisma`:

```ts
import { prisma } from "@/lib/prisma";
```

After successful `putStoredObject`, create the row before returning JSON:

```ts
          await prisma.supportAsset.create({
            data: {
              assetId,
              uploadedById: session.user.id,
            },
          });
```

- [ ] **Step 2: Update `src/lib/support/service.ts` types**

Add imports:

```ts
import type { Prisma } from "@prisma/client";
```

Normalize asset IDs in both `createTicket` and `addMessage`:

```ts
const assetIds = normalizeAssetIds(input.assetIds);
```

Add helper near the top:

```ts
function normalizeAssetIds(assetIds: string[] | undefined) {
  return [...new Set(assetIds ?? [])].slice(0, 3);
}
```

- [ ] **Step 3: Add asset binding helper**

Add to `src/lib/support/service.ts`:

```ts
async function bindSupportAssets(
  tx: Prisma.TransactionClient,
  input: {
    assetIds: string[];
    authorId: string;
    ticketId: string;
    messageId: string;
  },
) {
  if (!input.assetIds.length) {
    return;
  }

  const updated = await tx.supportAsset.updateMany({
    where: {
      assetId: { in: input.assetIds },
      uploadedById: input.authorId,
      ticketId: null,
      messageId: null,
    },
    data: {
      ticketId: input.ticketId,
      messageId: input.messageId,
    },
  });

  if (updated.count !== input.assetIds.length) {
    throw new Error("Lampiran tidak valid.");
  }
}
```

- [ ] **Step 4: Bind assets inside `createTicket` transaction**

After `supportMessage.create`, before return:

```ts
    await bindSupportAssets(tx, {
      assetIds,
      authorId: input.userId,
      ticketId: ticket.id,
      messageId: message.id,
    });
```

- [ ] **Step 5: Bind assets inside `addMessage` transaction**

After `supportMessage.create`, before ticket update:

```ts
    await bindSupportAssets(tx, {
      assetIds,
      authorId: input.authorId,
      ticketId: input.ticketId,
      messageId: message.id,
    });
```

- [ ] **Step 6: Run typecheck target**

Run:

```bash
bun run typecheck
```

Expected: PASS. If generated Prisma client is stale, run `bunx prisma generate`, then rerun typecheck.

- [ ] **Step 7: Commit task**

```bash
git add src/routes/api.support.assets.ts src/lib/support/service.ts src/routes/api.admin.tickets.\$ticketId.reply.ts src/routes/api.support.tickets.ts src/routes/api.support.tickets.\$ticketId.ts
git commit -m "fix(security): bind support uploads to messages"
```

---

### Task 4: Authorize support asset downloads by canonical binding

**Files:**
- Modify: `src/routes/api.support.assets.$assetId.ts`

**Interfaces:**
- Consumes `SupportAsset.assetId`, `ticket.userId`, admin email check.
- Produces same route response shape.

- [ ] **Step 1: Replace message-array authorization query**

In `src/routes/api.support.assets.$assetId.ts`, replace the non-admin query block with:

```ts
        if (!isAdmin) {
          const asset = await prisma.supportAsset.findUnique({
            where: { assetId },
            select: {
              ticket: {
                select: { userId: true },
              },
            },
          });

          if (!asset?.ticket || asset.ticket.userId !== session.user.id) {
            return new Response("Forbidden", { status: 403 });
          }
        }
```

Admin can still read support assets by ID for support workflow.

- [ ] **Step 2: Run focused typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit task**

```bash
git add src/routes/api.support.assets.\$assetId.ts
git commit -m "fix(security): authorize support assets by binding"
```

---

### Task 5: Add regression tests for support asset laundering

**Files:**
- Create or modify: `src/lib/support/service.test.ts`

**Interfaces:**
- Tests `createTicket` and `addMessage` reject asset IDs not pending for the acting user.

- [ ] **Step 1: Add service tests**

If `src/lib/support/service.test.ts` already exists, extend it. Otherwise create it with Prisma mocking consistent with existing tests. Minimal assertions:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    supportTicket: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { addMessage } from "./service";

describe("support asset binding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects asset IDs not uploaded by the message author", async () => {
    vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue({
      id: "ticket_1",
      userId: "user_1",
      subject: "Help",
      category: "GENERAL",
      status: "OPEN",
      createdAt: new Date(),
      updatedAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
    } as never);

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      const tx = {
        supportMessage: {
          create: vi.fn().mockResolvedValue({ id: "message_1" }),
        },
        supportAsset: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        supportTicket: {
          update: vi.fn(),
        },
      };
      return fn(tx as never);
    });

    await expect(
      addMessage({
        ticketId: "ticket_1",
        authorId: "user_1",
        authorRole: "user",
        body: "hello",
        assetIds: ["foreign.png"],
      }),
    ).rejects.toThrow("Lampiran tidak valid.");
  });
});
```

Adjust enum values if TypeScript requires Prisma enum imports from `@prisma/client`.

- [ ] **Step 2: Run regression test**

Run:

```bash
bun test src/lib/support/service.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit task**

```bash
git add src/lib/support/service.test.ts
git commit -m "test(security): cover support asset laundering"
```

---

### Task 6: Final verification

**Files:**
- No new files.

**Interfaces:**
- Confirms all security fixes integrate with existing app.

- [ ] **Step 1: Run focused tests**

```bash
bun test src/lib/security-headers.test.ts src/lib/support/service.test.ts
```

Expected: PASS.

- [ ] **Step 2: Validate Prisma**

```bash
bunx prisma validate
```

Expected: schema valid.

- [ ] **Step 3: Run project fast gate**

```bash
bun run check
```

Expected: PASS. If it fails, fix only failures caused by this change.

- [ ] **Step 4: Final audit check**

Manually verify:

```bash
rg -n "assetIds: body\.assetIds|assetIds,|supportMessage\.findFirst" src/lib/support src/routes/api.support.* src/routes/api.admin.tickets.*
rg -n "isCrossSiteMutation|createCsrfMiddleware" src/start.ts src/lib/security-headers.ts src/lib/security-headers.test.ts
```

Expected:
- `assetIds` still stored for UI compatibility, but only after `bindSupportAssets` validates ownership.
- Download auth uses `supportAsset.findUnique`, not `supportMessage.assetIds` as authority.
- CSRF tests cover cross-site, same-origin, exempt, and no-provenance unsafe API cases.

- [ ] **Step 5: Commit any verification-only fixes**

If final verification required fixes:

```bash
git add <fixed-files>
git commit -m "fix(security): complete audit hardening"
```

Otherwise no commit.

---

## Self-Review

- Spec coverage: CSRF hardening is covered by Task 1 and Task 6; support asset IDOR is covered by Tasks 2-5 and Task 6.
- Placeholder scan: no `TBD`, `TODO`, or unspecified error handling remains.
- Type consistency: `SupportAsset.assetId`, `uploadedById`, `ticketId`, and `messageId` are used consistently across schema, service, and route authorization.

## Execution Notes

Preferred execution: inline in current `dev` checkout, no worktree, because user explicitly requested no worktree. Commit each task only if user wants commits; otherwise keep working tree changes unstaged until review.
