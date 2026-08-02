# Payment create reuse + Mayar 429 resilience — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop flaky Mayar 429s on payment create by reusing same-pack PENDING invoices, mapping 429 to clear UX, and locking double-submit on the client.

**Architecture:** Before calling Mayar, `POST /api/payment/create` looks up the latest PENDING payment for the same user + packageId within a 24h TTL matching our invoice `expiredAt`. If found, return that session. Otherwise create as today. Map Mayar duplicate 429 to HTTP 429 + Indonesian wait copy. Client adds a ref lock around create.

**Tech Stack:** TanStack Start route handlers, Prisma, Vitest, React.

## Global Constraints

- No Prisma migration; reuse existing `Payment` columns + `metadata.packageId`.
- User-facing copy Indonesian; logs English.
- Bun only; surgical diffs; TDD.
- Do not call Mayar status/invoice GET on create (v1 local TTL only).
- Leave other-pack PENDING rows open; do not cancel or mark FAILED.

## File map

| File | Role |
|------|------|
| `src/routes/api.payment.create.ts` | Reuse lookup + 429 status/message |
| `src/components/payment/EnergyBoosterModal.tsx` | Ref lock on buy |
| `tests/routes/payment.test.ts` | Create-route reuse + 429 tests |
| `docs/superpowers/specs/2026-08-02-payment-create-reuse-design.md` | Spec (already written) |

---

### Task 1: Create-route tests (RED)

**Files:**
- Modify: `tests/routes/payment.test.ts`
- Test: same file

**Interfaces:**
- Consumes: `POST_CREATE` handler, existing mocks
- Produces: failing tests for reuse / different pack / expired / 429

- [ ] **Step 1: Add `prismaPaymentFindFirstMock` to hoisted mocks and prisma mock**

In the hoisted block, add:

```ts
prismaPaymentFindFirstMock: vi.fn(),
```

Wire it:

```ts
// in prismaTransactionMock callback payment object if needed — NOT required for create
// in vi.mock prisma.payment:
findFirst: prismaPaymentFindFirstMock,
```

Reset in `beforeEach`:

```ts
prismaPaymentFindFirstMock.mockReset();
prismaPaymentFindFirstMock.mockResolvedValue(null); // default: no reuse → create path
```

Default `null` keeps existing create tests green once implementation lands.

- [ ] **Step 2: Write failing tests under `describe("POST /api/payment/create")`**

```ts
it("reuses latest PENDING payment for the same package without calling Mayar", async () => {
  authMock.mockResolvedValueOnce({
    user: { id: "user_1" },
    expires: new Date().toISOString(),
  });
  prismaPaymentFindFirstMock.mockResolvedValueOnce({
    orderId: "INV-USER1-OLD",
    amount: 2900,
    paymentUrl: "https://testingmayar.myr.id/pl/existing",
    status: "PENDING",
  });

  const res = await POST_CREATE(
    new Request("http://localhost/api/payment/create", {
      method: "POST",
      body: JSON.stringify({ packageId: "pocket" }),
    }),
  );

  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data).toEqual({
    success: true,
    orderId: "INV-USER1-OLD",
    amount: 2900,
    paymentUrl: "https://testingmayar.myr.id/pl/existing",
    status: "PENDING",
  });
  expect(createMayarPaymentMock).not.toHaveBeenCalled();
  expect(prismaPaymentCreateMock).not.toHaveBeenCalled();
  expect(prismaPaymentFindFirstMock).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        userId: "user_1",
        status: "PENDING",
      }),
      orderBy: { createdAt: "desc" },
    }),
  );
});

it("creates a new Mayar invoice when PENDING is for a different package", async () => {
  authMock.mockResolvedValueOnce({
    user: { id: "user_1" },
    expires: new Date().toISOString(),
  });
  // findFirst filters by packageId — mock returns null (no same-pack PENDING)
  prismaPaymentFindFirstMock.mockResolvedValueOnce(null);
  createMayarPaymentMock.mockResolvedValueOnce({
    id: "req-new",
    transactionId: "txn-new",
    link: "https://testingmayar.myr.id/pl/new",
  });
  prismaPaymentCreateMock.mockResolvedValueOnce({
    orderId: "INV-USER1-NEW",
    amount: 59900,
    energyGranted: 1500000,
    status: "PENDING",
    paymentUrl: "https://testingmayar.myr.id/pl/new",
  });

  const res = await POST_CREATE(
    new Request("http://localhost/api/payment/create", {
      method: "POST",
      body: JSON.stringify({ packageId: "max" }),
    }),
  );

  expect(res.status).toBe(200);
  expect(createMayarPaymentMock).toHaveBeenCalled();
  expect(prismaPaymentCreateMock).toHaveBeenCalled();
});

it("creates a new invoice when same-pack PENDING is outside the 24h window", async () => {
  authMock.mockResolvedValueOnce({
    user: { id: "user_1" },
    expires: new Date().toISOString(),
  });
  // Route applies createdAt filter in the query — mock null = DB found nothing in window
  prismaPaymentFindFirstMock.mockResolvedValueOnce(null);
  createMayarPaymentMock.mockResolvedValueOnce({
    id: "req-2",
    transactionId: "txn-2",
    link: "https://testingmayar.myr.id/pl/fresh",
  });
  prismaPaymentCreateMock.mockResolvedValueOnce({
    orderId: "INV-USER1-FRESH",
    amount: 2900,
    energyGranted: 50000,
    status: "PENDING",
    paymentUrl: "https://testingmayar.myr.id/pl/fresh",
  });

  const res = await POST_CREATE(
    new Request("http://localhost/api/payment/create", {
      method: "POST",
      body: JSON.stringify({ packageId: "pocket" }),
    }),
  );

  expect(res.status).toBe(200);
  expect(createMayarPaymentMock).toHaveBeenCalled();
  // Assert findFirst where.createdAt.gt is roughly now-24h
  const findArg = prismaPaymentFindFirstMock.mock.calls[0]?.[0] as {
    where: { createdAt: { gt: Date } };
  };
  const gt = findArg.where.createdAt.gt.getTime();
  const expected = Date.now() - 24 * 60 * 60 * 1000;
  expect(Math.abs(gt - expected)).toBeLessThan(5_000);
});

it("returns 429 with wait message when Mayar reports duplicate request", async () => {
  authMock.mockResolvedValueOnce({
    user: { id: "user_1" },
    expires: new Date().toISOString(),
  });
  prismaPaymentFindFirstMock.mockResolvedValueOnce(null);
  createMayarPaymentMock.mockRejectedValueOnce(
    new Error(
      'Mayar create payment failed with status 429: {"statusCode":429,"messages":"Duplicate request detected. Please wait 1 minute before trying again."}',
    ),
  );

  const res = await POST_CREATE(
    new Request("http://localhost/api/payment/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId: "pocket" }),
    }),
  );

  expect(res.status).toBe(429);
  const data = await res.json();
  expect(data.message).toBe(
    "Permintaan sama terdeteksi. Tunggu sekitar 1 menit, lalu coba lagi.",
  );
});
```

- [ ] **Step 3: Run tests — expect RED**

```bash
bun test tests/routes/payment.test.ts
```

Expected: reuse / 429 tests fail (findFirst not called / status still 500).

---

### Task 2: Implement create-route reuse + 429 (GREEN)

**Files:**
- Modify: `src/routes/api.payment.create.ts`

**Interfaces:**
- Consumes: `prisma.payment.findFirst`, existing `createMayarPayment`
- Produces: reuse response shape identical to create success body

- [ ] **Step 1: Implement**

```ts
const PAYMENT_LINK_TTL_MS = 24 * 60 * 60 * 1000;

// after pack resolved, before orderId generation:

const existing = await prisma.payment.findFirst({
  where: {
    userId: session.user.id,
    status: "PENDING",
    paymentUrl: { not: null },
    createdAt: { gt: new Date(Date.now() - PAYMENT_LINK_TTL_MS) },
    metadata: {
      path: ["packageId"],
      equals: packageId,
    },
  },
  orderBy: { createdAt: "desc" },
  select: {
    orderId: true,
    amount: true,
    paymentUrl: true,
    status: true,
  },
});

if (existing?.paymentUrl) {
  return Response.json({
    success: true,
    orderId: existing.orderId,
    amount: existing.amount,
    paymentUrl: existing.paymentUrl,
    status: existing.status,
  });
}

// ... existing create path unchanged ...

// in catch:
} catch (error) {
  console.error("[payment-create] Failed to create payment:", error);
  const raw = error instanceof Error ? error.message : "";
  if (/status 429|Duplicate request/i.test(raw)) {
    return Response.json(
      {
        message:
          "Permintaan sama terdeteksi. Tunggu sekitar 1 menit, lalu coba lagi.",
      },
      { status: 429 },
    );
  }
  return Response.json(
    { message: mapToUserFacingError(raw) },
    { status: 500 },
  );
}
```

- [ ] **Step 2: Run tests — expect GREEN**

```bash
bun test tests/routes/payment.test.ts
```

Expected: all payment route tests pass.

- [ ] **Step 3: Existing success test still passes**

`successfully creates a payment session via Mayar` must still pass with default `findFirst → null`.

---

### Task 3: Client ref lock

**Files:**
- Modify: `src/components/payment/EnergyBoosterModal.tsx`

**Interfaces:**
- Consumes: existing `handleBuy` / `isCreating`
- Produces: second concurrent click is a no-op

- [ ] **Step 1: Add ref lock**

```ts
import { useState, useEffect, useRef } from "react";

// inside component:
const creatingLockRef = useRef(false);

// in open-reset effect:
creatingLockRef.current = false;

const handleBuy = async (packId: BoosterPackId) => {
  if (creatingLockRef.current) return;
  creatingLockRef.current = true;
  setIsCreating(true);
  try {
    // existing fetch body unchanged
  } catch (err) {
    // unchanged
  } finally {
    creatingLockRef.current = false;
    setIsCreating(false);
  }
};
```

No unit test required if no component test harness exists for this modal; covered by route tests + manual. If a Storybook interaction test exists, skip unless already wired.

- [ ] **Step 2: Lint/typecheck focused**

```bash
bunx eslint src/routes/api.payment.create.ts src/components/payment/EnergyBoosterModal.tsx tests/routes/payment.test.ts
```

---

### Task 4: Verify

- [ ] **Step 1: Run payment tests**

```bash
bun test tests/routes/payment.test.ts
```

Expected: pass.

- [ ] **Step 2: Manual (dev)**

1. Open booster modal, buy pack max → get payment URL.
2. Close modal, buy max again within minutes → same `orderId`/`paymentUrl`, no Mayar 429 in terminal.
3. Buy pocket while max still PENDING → new invoice.
4. If Mayar 429 still appears (race, no PENDING): toast shows wait ~1 minute message.

---

## Spec coverage checklist

| Spec rule | Task |
|-----------|------|
| Reuse same-pack PENDING within 24h | Task 1–2 |
| Different pack creates new | Task 1–2 |
| No migration | Task 2 (findFirst only) |
| 429 UX | Task 1–2 |
| Client double-submit lock | Task 3 |
| No Mayar GET on create | Task 2 (local TTL) |
| Leave other PENDING open | Task 2 (filter by packageId only) |
