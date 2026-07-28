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
    // Demonstrates the bug this task fixes. ponytail: this assertion is
    // host-dependent — a fast local Postgres may serialize the 10 concurrent
    // transactions incidentally so all observe `used = 0`. CI on a shared
    // runner is expected to reproduce the race reliably; locally the
    // with-lock test below is the binding contract.
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
