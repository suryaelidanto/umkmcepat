import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createTestUser, prisma, resetDatabase } from "./setup";

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
