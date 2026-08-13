import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "./setup";

import { invalidateSettingCache, primeSettingCache } from "@/lib/app-settings";
import { approveWaitlistEntry } from "@/lib/waitlist";

const STORY =
  "Jualan makanan rumahan sejak 2024 dan membutuhkan website agar pelanggan mudah melihat menu serta menghubungi usaha.";
const SIGNUP_GRANT_KEY = "economics.signup_energy_grant";

describe("waitlist approval transaction", () => {
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "WaitlistEntry", "UserCredit", "Payment", "User" RESTART IDENTITY CASCADE`,
    );
    await prisma.appSetting.deleteMany({ where: { key: SIGNUP_GRANT_KEY } });
    invalidateSettingCache();
  });

  afterAll(() => prisma.$disconnect());

  it("commits approval and exactly one pilot grant across retries", async () => {
    const user = await prisma.user.create({
      data: { email: `approval-${crypto.randomUUID()}@example.test` },
    });
    const entry = await prisma.waitlistEntry.create({
      data: {
        businessName: "Warung Uji",
        email: user.email ?? "",
        linkedUserId: user.id,
        status: "pending",
        story: STORY,
      },
    });

    await approveWaitlistEntry(entry.id, "admin-test");
    await approveWaitlistEntry(entry.id, "admin-test");

    const saved = await prisma.waitlistEntry.findUnique({
      where: { id: entry.id },
      select: { status: true },
    });
    const grants = await prisma.userCredit.count({
      where: { reason: "grant:pilot", userId: user.id },
    });

    expect(saved?.status).toBe("approved");
    expect(grants).toBe(1);
  });

  it("rolls approval back when the transactional grant cannot fit the credit column", async () => {
    const user = await prisma.user.create({
      data: { email: `rollback-${crypto.randomUUID()}@example.test` },
    });
    const entry = await prisma.waitlistEntry.create({
      data: {
        businessName: "Warung Rollback",
        email: user.email ?? "",
        linkedUserId: user.id,
        status: "pending",
        story: STORY,
      },
    });

    await prisma.appSetting.upsert({
      where: { key: SIGNUP_GRANT_KEY },
      create: {
        category: "economics",
        key: SIGNUP_GRANT_KEY,
        value: 2_147_483_648,
      },
      update: { value: 2_147_483_648 },
    });
    await primeSettingCache({ force: true });

    try {
      await expect(
        approveWaitlistEntry(entry.id, "admin-test"),
      ).rejects.toThrow();
    } finally {
      await prisma.appSetting.delete({ where: { key: SIGNUP_GRANT_KEY } });
      invalidateSettingCache();
    }

    const saved = await prisma.waitlistEntry.findUnique({
      where: { id: entry.id },
      select: { status: true },
    });
    expect(saved?.status).toBe("pending");
  });
});
