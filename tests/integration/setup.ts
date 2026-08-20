import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

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
