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
