# Production Hardening Phase 1: Security Correctness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the critical `@auth/core` advisory, eliminate two real race conditions in the payment and energy paths, and remove misleading documentation — with no infrastructure dependency.

**Architecture:** Three independent workstreams. Dependency upgrades are isolated so they can be reverted alone. The two race fixes need real PostgreSQL transaction semantics, which the current all-mocked test suite cannot express, so this plan first adds a real-database integration test project and then fixes each race test-first against it.

**Tech Stack:** Bun 1.3.9, TanStack Start, Prisma + PostgreSQL 16, Vitest (`unit` + new `integration` projects), Auth.js (`@auth/core`).

**Spec:** `docs/superpowers/specs/2026-07-28-production-security-hardening-design.md` (§5 Phase 1)

## Global Constraints

- Package manager is **Bun only**; `bun.lock` is the canonical lockfile. Never introduce `package-lock.json` or `yarn.lock`.
- Work from `dev`. Open PRs into `dev`.
- `@auth/core` target version is exactly **`0.41.3`** (the advisory fix version and the current latest).
- User-facing product copy is **Indonesian**; developer-facing docs, code, logs, and errors are **English**.
- `Payment.status` is a **`String`** column (`prisma/schema.prisma:429`), not a Prisma enum. Use the string literals `"PENDING"` / `"COMPLETED"`.
- Never write real secret values into tracked files. Env examples use empty `""` values.
- Never log secret values. To reference an env var in a log, print its name and a set/unset boolean.
- Surgical edits only: touch what the task requires, match surrounding style.
- Run `bun run check` before handoff. Never bypass a failing gate.

---

### Task 1: Remove fabricated specs and correct the ADMIN_EMAILS comment

Both prior security specs describe a different application (spec §2). Leaving them in the repository actively misleads future work. The `.env.example` comment claims a dev-bypass that does not exist in the code.

**Files:**
- Delete: `docs/superpowers/specs/2026-07-27-comprehensive-security-hardening.md`
- Delete: `docs/superpowers/specs/2026-07-27-security-hardening-spec.md`
- Modify: `.env.example:77-78`

- [ ] **Step 1: Confirm the claims are still false before deleting**

Run:

```bash
git grep -li graphql -- src package.json; \
git grep -n "queryRawUnsafe\|Prisma\.raw" -- src; \
git grep -ni "bcrypt\|argon2" -- src package.json
```

Expected: all three produce **no output**. If any produces output, stop and re-verify the spec before deleting anything.

- [ ] **Step 2: Delete both fabricated specs**

```bash
git rm docs/superpowers/specs/2026-07-27-comprehensive-security-hardening.md \
       docs/superpowers/specs/2026-07-27-security-hardening-spec.md
```

- [ ] **Step 3: Correct the ADMIN_EMAILS comment**

In `.env.example`, replace:

```
# Waitlist admin allowlist (comma-separated emails; empty = dev-bypass).
ADMIN_EMAILS=""
```

with:

```
# Admin allowlist (comma-separated emails). Fail-closed: empty grants nobody
# admin access, in every environment. See src/lib/waitlist.ts isAdminEmail().
ADMIN_EMAILS=""
```

- [ ] **Step 4: Verify the fail-closed claim matches the code**

Run: `sed -n '32,42p' src/lib/waitlist.ts`
Expected: the function returns `false` when `raw` is empty — confirming the new comment is accurate.

- [ ] **Step 5: Commit**

```bash
git add -A docs/superpowers/specs .env.example
git commit -m "docs: remove fabricated security specs, fix ADMIN_EMAILS comment"
```

---

### Task 2: Upgrade @auth/core to close the critical advisory

`@auth/core@0.34.3` carries `GHSA-7rqj-j65f-68wh` (homoglyph `@` bypass in email normalization). Because admin authorization is an email allowlist, this is a candidate privilege-escalation path. Isolated in its own task so it can be reverted independently.

**Files:**
- Modify: `package.json` (`@auth/core` dependency)
- Modify: `bun.lock`

**Interfaces:**
- Produces: no API surface change is expected. `authConfig` in `src/lib/auth-config.ts` must continue to export a valid `AuthConfig`, and `setEnvDefaults(process.env, authConfig)` must continue to exist as an export of `@auth/core`.

- [ ] **Step 1: Record the pre-upgrade advisory state**

Run: `bun audit 2>&1 | grep -A 4 "@auth/core"`
Expected: lists the critical homoglyph advisory plus the `getToken()` and PKCE-cookie advisories.

- [ ] **Step 2: Upgrade**

```bash
bun add @auth/core@0.41.3
```

- [ ] **Step 3: Confirm the advisories are gone**

Run: `bun audit 2>&1 | grep -c "@auth/core"`
Expected: `0`.

- [ ] **Step 4: Typecheck for breaking API changes across seven minor versions**

Run: `bun run typecheck`
Expected: PASS. If `setEnvDefaults`, `AuthConfig`, or the `Google` provider import path moved, fix the import in `src/lib/auth-config.ts` and re-run. Do not change auth behavior — only import shape.

- [ ] **Step 5: Run the auth unit tests**

Run: `bunx vitest run --project unit src/lib/auth.test.ts src/lib/auth-session.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify existing JWT sessions still decode**

`src/lib/auth-config.ts:15-18` asserts that JWT encryption is identical to next-auth v5 so pre-migration cookies stay valid. Verify that claim survived the upgrade:

```bash
bun run dev
```

Sign in with Google, then **restart the dev server without clearing cookies** and reload. Expected: still signed in.

If you are signed out, the token format changed. That is an acceptable outcome — a one-time forced re-login for all users — but it **must be recorded**, not discovered in production. Note it in the commit body and in `CHANGELOG.md`.

- [ ] **Step 7: Verify the admin allowlist still resolves**

With your own email in `ADMIN_EMAILS` in `.env`, sign in and load `/admin`. Expected: the admin dashboard renders. This confirms `isAdminEmail()` still receives a normalized email from the upgraded provider.

- [ ] **Step 8: Commit**

```bash
git add package.json bun.lock
git commit -m "fix(security): upgrade @auth/core to 0.41.3 for homoglyph email bypass

Closes GHSA-7rqj-j65f-68wh (critical), GHSA-xmf8-cvqr-rfgj, and
GHSA-x445-f3h2-j279. Admin authorization is an email allowlist, so the
normalization bypass was a privilege-escalation path."
```

---

### Task 3: Upgrade remaining vulnerable dependencies

`postcss` (path traversal, build-time), `fast-uri` (host confusion, transitive), `cookie` (via `@auth/core`), `@vitest/browser` (critical, dev-only).

**Files:**
- Modify: `package.json`, `bun.lock`

- [ ] **Step 1: Upgrade within semver-compatible ranges**

```bash
bun update
```

- [ ] **Step 2: Re-audit and record what remains**

Run: `bun audit`
Expected: the critical and high advisories listed in spec §3.5 (F14) are resolved. Some transitive advisories may persist if no compatible fix is published — that is acceptable, but capture the residual list for the commit body.

- [ ] **Step 3: Full verification gate**

Run: `bun run verify`
Expected: PASS (format, lint, typecheck, full unit tests, Knip).

- [ ] **Step 4: Build, because postcss and fast-uri are build-path dependencies**

Run: `bun run build`
Expected: PASS. This is the real test for these two — unit tests do not exercise the build pipeline.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock
git commit -m "fix(security): update postcss, fast-uri, cookie, @vitest/browser"
```

---

### Task 4: Add a real-database integration test project

Every existing test mocks Prisma (`src/lib/app-settings.test.ts:5`). A mocked client cannot express PostgreSQL transaction isolation, so the race conditions in Tasks 5 and 6 are untestable as the suite stands. This task adds the harness those tasks need.

CI already provides PostgreSQL (`.github/workflows/quality.yml:24-36`) and runs `prisma migrate deploy`, so no CI infrastructure change is required.

**Files:**
- Modify: `vitest.config.ts:34-57`
- Modify: `package.json` (scripts)
- Create: `tests/integration/setup.ts`
- Create: `tests/integration/harness.itest.ts`

**Interfaces:**
- Produces: `resetDatabase(): Promise<void>` and `createTestUser(): Promise<{ id: string }>` from `tests/integration/setup.ts`, consumed by Tasks 5 and 6.
- The `.itest.ts` suffix is deliberate: the `unit` project globs `tests/**/*.test.ts` (`vitest.config.ts:39`), so a `.test.ts` file here would be picked up by both projects and fail without a database.

- [ ] **Step 1: Add the integration project to vitest config**

In `vitest.config.ts`, add a third entry to the `projects` array, after the `unit` entry:

```ts
      {
        extends: true,
        test: {
          environment: "node",
          // `.itest.ts`, not `.test.ts`: the `unit` project globs
          // `tests/**/*.test.ts` and would otherwise run these without a DB.
          include: ["tests/integration/**/*.itest.ts"],
          name: "integration",
          // Real transactions and advisory locks; no parallel file isolation.
          fileParallelism: false,
        },
      },
```

- [ ] **Step 2: Add the test script**

In `package.json` scripts, after `"test:full"`:

```json
    "test:integration": "vitest run --project integration",
```

- [ ] **Step 3: Write the setup helpers**

Create `tests/integration/setup.ts`:

```ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/**
 * Truncate the tables these tests write to. Integration tests run against a
 * real database, so each file must start from a known state.
 */
export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "UserCredit", "Payment", "User" RESTART IDENTITY CASCADE`,
  );
}

export async function createTestUser() {
  return prisma.user.create({
    data: { email: `test-${crypto.randomUUID()}@example.test` },
    select: { id: true },
  });
}
```

- [ ] **Step 4: Write a harness test that proves the database is really reachable**

Create `tests/integration/harness.itest.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createTestUser, prisma, resetDatabase } from "./setup";

describe("integration harness", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("reaches a real database and honours transactions", async () => {
    const user = await createTestUser();
    expect(user.id).toBeTruthy();

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { name: "rolled-back" },
        });
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after?.name).toBeNull();
  });
});
```

- [ ] **Step 5: Run it against a real database**

```bash
bun run infra
bun run db:migrate
bun run test:integration
```

Expected: PASS. A rollback that does not roll back means you are not talking to real PostgreSQL — stop and fix before continuing.

- [ ] **Step 6: Confirm the unit project did not absorb the new files**

Run: `bun run test:full 2>&1 | grep -c "harness.itest"`
Expected: `0`. The unit project must not see integration tests.

- [ ] **Step 7: Add integration tests to CI**

In `.github/workflows/quality.yml`, after the `Verify full suite` step:

```yaml
      - name: Integration tests (real database)
        run: bun run test:integration
```

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts package.json tests/integration .github/workflows/quality.yml
git commit -m "test: add real-database integration project

Race conditions in payment and energy paths need real PostgreSQL
transaction semantics; the existing suite mocks Prisma everywhere."
```

---

### Task 5: Make the payment webhook claim atomically

`src/routes/api.payment.webhook.ts:81` comments that it locks the row, but `tx.payment.findUnique()` takes no lock. Under READ COMMITTED, two concurrent deliveries for one `orderId` can both see `PENDING` and both grant energy.

**Files:**
- Modify: `src/routes/api.payment.webhook.ts:80-125`
- Create: `tests/integration/payment-webhook-race.itest.ts`

**Interfaces:**
- Consumes: `createTestUser`, `prisma`, `resetDatabase` from `tests/integration/setup.ts` (Task 4).

- [ ] **Step 1: Write the failing concurrency test**

Create `tests/integration/payment-webhook-race.itest.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createTestUser, prisma, resetDatabase } from "./setup";

/**
 * Mirrors the claim-and-grant sequence in api.payment.webhook.ts. The route
 * handler itself needs a live Pakasir verification call, so this exercises the
 * database-level concurrency contract the handler depends on.
 */
async function claimAndGrant(orderId: string) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { orderId, status: "PENDING" },
      data: { status: "COMPLETED" },
    });

    if (claimed.count !== 1) {
      return null;
    }

    const payment = await tx.payment.findUniqueOrThrow({ where: { orderId } });

    await tx.userCredit.create({
      data: {
        userId: payment.userId,
        amount: payment.energyGranted,
        inputTokens: 0,
        outputTokens: 0,
        reason: "Top-up: test",
        expiresAt: new Date("9999-12-31T23:59:59.999Z"),
      },
    });

    return payment.userId;
  });
}

describe("payment webhook concurrency", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("grants energy exactly once under concurrent deliveries", async () => {
    const user = await createTestUser();
    const orderId = `order-${crypto.randomUUID()}`;

    await prisma.payment.create({
      data: {
        userId: user.id,
        orderId,
        amount: 2900,
        energyGranted: 50_000,
        status: "PENDING",
      },
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => claimAndGrant(orderId)),
    );

    expect(results.filter(Boolean)).toHaveLength(1);

    const credits = await prisma.userCredit.findMany({
      where: { userId: user.id },
    });
    expect(credits).toHaveLength(1);
    expect(credits[0].amount).toBe(50_000);
  });
});
```

- [ ] **Step 2: Run it and watch it pass — then prove it is testing something**

Run: `bun run test:integration tests/integration/payment-webhook-race.itest.ts`
Expected: PASS.

This test encodes the *fixed* behavior, so it passes immediately. To confirm it actually detects the bug, temporarily replace the `updateMany` block in the helper with the current buggy shape:

```ts
    const existing = await tx.payment.findUnique({ where: { orderId } });
    if (!existing || existing.status !== "PENDING") return null;
    await tx.payment.update({ where: { orderId }, data: { status: "COMPLETED" } });
```

Re-run. Expected: **FAIL** with more than one credit row. Then restore the `updateMany` version. Do not commit the buggy variant.

- [ ] **Step 3: Apply the fix to the real handler**

In `src/routes/api.payment.webhook.ts`, replace the transaction body (lines 80-125) so the claim is a single conditional update:

```ts
          const result = await prisma.$transaction(async (tx) => {
            // Atomic claim: exactly one concurrent transaction can transition
            // PENDING -> COMPLETED, so exactly one grants energy. A prior
            // findUnique + update took no lock and could double-grant.
            const claimed = await tx.payment.updateMany({
              where: { orderId, status: "PENDING" },
              data: {
                status: "COMPLETED",
                paymentMethod: verifiedTransaction.payment_method,
                updatedAt: new Date(),
              },
            });

            if (claimed.count !== 1) {
              return null;
            }

            const txPayment = await tx.payment.findUniqueOrThrow({
              where: { orderId },
            });

            const premiumExpiry = new Date("9999-12-31T23:59:59.999Z");
            const packageName =
              (txPayment.metadata as { packageName?: string })?.packageName ||
              "Energy Booster";

            await tx.$executeRaw`
              INSERT INTO "UserCredit" ("id", "userId", "amount", "inputTokens", "outputTokens", "reason", "expiresAt", "createdAt")
              VALUES (
                ${`c${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`},
                ${txPayment.userId},
                ${txPayment.energyGranted},
                0,
                0,
                ${`Top-up: ${packageName}`.slice(0, 64)},
                ${premiumExpiry},
                NOW()
              )
            `;

            return {
              userId: txPayment.userId,
              energyGranted: txPayment.energyGranted,
              packageName,
            };
          });
```

Note the misleading "lock the row" comment is gone, replaced by an accurate one.

- [ ] **Step 4: Verify**

Run: `bun run test:integration && bunx vitest run --project unit && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.payment.webhook.ts tests/integration/payment-webhook-race.itest.ts
git commit -m "fix(payment): claim webhook atomically to prevent double energy grant

findUnique inside a transaction takes no lock. Under READ COMMITTED two
concurrent deliveries for one orderId could both observe PENDING and both
insert credits. A conditional updateMany makes the claim atomic."
```

---

### Task 6: Serialize energy deduction per user

`src/lib/user-credits.ts:112` claims the transaction prevents races. It performs a `SUM` (line 114) then an `INSERT` (line 140) with no lock, so concurrent requests each grant themselves the full remaining free allowance and exceed `DAILY_ENERGY_LIMIT`.

**Files:**
- Modify: `src/lib/user-credits.ts:112-114`
- Create: `tests/integration/energy-deduction-race.itest.ts`

**Interfaces:**
- Consumes: `createTestUser`, `prisma`, `resetDatabase` from `tests/integration/setup.ts` (Task 4).

- [ ] **Step 1: Read the current function to find the exact insertion point**

Run: `sed -n '105,125p' src/lib/user-credits.ts`
Expected: you see the `prisma.$transaction(async (tx) => {` opening followed immediately by the `SELECT SUM(...)` raw query. The lock goes between them.

- [ ] **Step 2: Write the failing concurrency test**

Create `tests/integration/energy-deduction-race.itest.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createTestUser, prisma, resetDatabase } from "./setup";

const DAILY_LIMIT = 100;

/**
 * Mirrors the SUM-then-INSERT shape of chargeEnergy in src/lib/user-credits.ts,
 * including the advisory lock that makes it safe.
 */
async function deduct(userId: string, amount: number, withLock: boolean) {
  return prisma.$transaction(async (tx) => {
    if (withLock) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    }

    const [row] = await tx.$queryRaw<Array<{ used: number | null }>>`
      SELECT SUM(ABS("amount"))::int AS "used"
      FROM "UserCredit"
      WHERE "userId" = ${userId} AND "amount" < 0
    `;

    const used = Math.abs(row?.used ?? 0);
    const remaining = Math.max(0, DAILY_LIMIT - used);
    const deduction = Math.min(amount, remaining);

    if (deduction <= 0) {
      return 0;
    }

    await tx.$executeRaw`
      INSERT INTO "UserCredit" ("id", "userId", "amount", "inputTokens", "outputTokens", "reason", "expiresAt", "createdAt")
      VALUES (
        ${`c${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`},
        ${userId}, ${-deduction}, 0, 0, 'test', NOW() + interval '1 day', NOW()
      )
    `;

    return deduction;
  });
}

describe("energy deduction concurrency", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("without a lock, concurrent deductions overshoot the daily limit", async () => {
    const user = await createTestUser();

    await Promise.all(
      Array.from({ length: 10 }, () => deduct(user.id, 50, false)),
    );

    const [row] = await prisma.$queryRaw<Array<{ used: number | null }>>`
      SELECT SUM(ABS("amount"))::int AS "used"
      FROM "UserCredit" WHERE "userId" = ${user.id}
    `;
    // Demonstrates the bug this task fixes.
    expect(Math.abs(row?.used ?? 0)).toBeGreaterThan(DAILY_LIMIT);
  });

  it("with the advisory lock, the daily limit holds", async () => {
    const user = await createTestUser();

    await Promise.all(
      Array.from({ length: 10 }, () => deduct(user.id, 50, true)),
    );

    const [row] = await prisma.$queryRaw<Array<{ used: number | null }>>`
      SELECT SUM(ABS("amount"))::int AS "used"
      FROM "UserCredit" WHERE "userId" = ${user.id}
    `;
    expect(Math.abs(row?.used ?? 0)).toBe(DAILY_LIMIT);
  });
});
```

- [ ] **Step 3: Run and confirm both assertions hold**

Run: `bun run test:integration tests/integration/energy-deduction-race.itest.ts`
Expected: both PASS. The first test passing is what proves the race is real; the second proves the lock fixes it.

If the first test fails (the limit was respected without a lock), the machine may be serializing requests incidentally. Raise the concurrency from 10 to 50 and re-run before concluding there is no race.

- [ ] **Step 4: Apply the lock to the real function**

In `src/lib/user-credits.ts`, replace the comment on line 112 and add the lock as the first statement inside the transaction:

```ts
  // Serialize per user: the SUM below and the INSERT that follows are a
  // read-modify-write over an aggregate, which a transaction alone does not
  // make safe at READ COMMITTED. The advisory lock is transaction-scoped and
  // releases on commit or rollback.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

    const [freeRow] = await tx.$queryRaw<Array<{ used: number | null }>>`
```

Leave the rest of the transaction body unchanged.

- [ ] **Step 5: Verify**

Run: `bun run test:integration && bunx vitest run --project unit src/lib/user-credits.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/user-credits.ts tests/integration/energy-deduction-race.itest.ts
git commit -m "fix(energy): serialize per-user deduction with an advisory lock

SUM-then-INSERT is a read-modify-write over an aggregate; a transaction
alone does not make it safe at READ COMMITTED. Concurrent requests each
claimed the full remaining free allowance."
```

---

### Task 7: Require TURNSTILE_SECRET_KEY in the production preflight

`verifyTurnstileToken()` fails closed in production (`src/lib/turnstile.ts:11-17`), so a missing key silently breaks every protected form instead of failing loudly at boot.

**Files:**
- Modify: `src/lib/production-config.ts:22-24`
- Modify: `src/lib/production-config.test.ts:5-16`

- [ ] **Step 1: Write the failing test**

In `src/lib/production-config.test.ts`, add `TURNSTILE_SECRET_KEY` to `validProductionEnv`:

```ts
  TURNSTILE_SECRET_KEY: "turnstile-production-secret",
```

Then add this case inside the existing `describe` block:

```ts
  it("rejects a missing Turnstile secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const [name, value] of Object.entries(validProductionEnv)) {
      vi.stubEnv(name, value);
    }

    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(() => assertProductionConfigReady()).toThrow(
      "TURNSTILE_SECRET_KEY must be configured in production.",
    );
  });
```

- [ ] **Step 2: Run it and verify it fails**

Run: `bunx vitest run --project unit src/lib/production-config.test.ts`
Expected: FAIL — the new case throws nothing, because the assertion does not exist yet.

- [ ] **Step 3: Add the assertion**

In `src/lib/production-config.ts`, after the existing `assertRequiredSecret("OTP_SPACE_API_KEY");` on line 23:

```ts
  assertRequiredSecret("TURNSTILE_SECRET_KEY");
```

The existing `assertRequiredSecret` helper already produces the exact message the test expects.

- [ ] **Step 4: Run and verify it passes**

Run: `bunx vitest run --project unit src/lib/production-config.test.ts`
Expected: PASS, including the pre-existing "accepts an explicit contained production configuration" case — which is why `validProductionEnv` had to be updated in Step 1.

- [ ] **Step 5: Document the new requirement**

In `docs/deployment.md`, add `TURNSTILE_SECRET_KEY=""` to the "Minimum production env" block (after `OTP_SPACE_API_KEY`). Empty value only.

- [ ] **Step 6: Commit**

```bash
git add src/lib/production-config.ts src/lib/production-config.test.ts docs/deployment.md
git commit -m "fix(config): require TURNSTILE_SECRET_KEY in the production preflight"
```

---

### Task 8: Phase gate

- [ ] **Step 1: Full local gate**

Run: `bun run verify && bun run test:integration`
Expected: PASS.

- [ ] **Step 2: Confirm the audit position improved**

Run: `bun audit`
Expected: no critical or high advisory reachable from production runtime code. Dev-only residuals are acceptable; record them.

- [ ] **Step 3: Update the changelog**

Add a `CHANGELOG.md` entry covering the `@auth/core` upgrade (noting whether sessions survived, from Task 2 Step 6), both race fixes, and the new preflight requirement.

- [ ] **Step 4: Commit and push**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): phase 1 security correctness"
git push origin dev
```

- [ ] **Step 5: Confirm CI is green before starting Phase 2**

Run: `gh run watch`
Expected: the `Quality` workflow passes, including the new integration step.
