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
