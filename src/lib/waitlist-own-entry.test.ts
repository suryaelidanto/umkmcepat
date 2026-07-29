import { beforeEach, describe, expect, it, vi } from "vitest";

import { getOwnWaitlistEntry } from "@/lib/waitlist-own-entry";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    waitlistEntry: {
      findUnique: vi.fn(),
    },
  },
}));

const { prisma } = await import("@/lib/prisma");

describe("getOwnWaitlistEntry", () => {
  beforeEach(() => vi.mocked(prisma.waitlistEntry.findUnique).mockReset());

  it("returns the user's own fields when an entry exists", async () => {
    vi.mocked(prisma.waitlistEntry.findUnique).mockResolvedValue({
      businessName: "Warteg Bu Sari",
      businessType: "kuliner",
      imageRef: "object:local:waitlist/x.png",
      phone: "0812",
      rejectionReason: "Cerita usaha masih terlalu singkat.",
      status: "rejected",
      story: "Jualan sejak 2019",
    } as never);
    const entry = await getOwnWaitlistEntry("user@example.com");
    expect(entry).toMatchObject({
      businessName: "Warteg Bu Sari",
      rejectionReason: "Cerita usaha masih terlalu singkat.",
      status: "rejected",
    });
  });

  it("returns null when no entry", async () => {
    vi.mocked(prisma.waitlistEntry.findUnique).mockResolvedValue(null);
    expect(await getOwnWaitlistEntry("nobody@example.com")).toBeNull();
  });

  it("returns null for an invalid email", async () => {
    expect(await getOwnWaitlistEntry("not-an-email")).toBeNull();
    expect(prisma.waitlistEntry.findUnique).not.toHaveBeenCalled();
  });
});
