import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  grantSignupEnergyMock,
  transactionMock,
  updateMock,
  updateManyMock,
  userFindFirstMock,
} = vi.hoisted(() => ({
  grantSignupEnergyMock: vi.fn(),
  transactionMock: vi.fn(),
  updateMock: vi.fn(),
  updateManyMock: vi.fn(),
  userFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transactionMock,
    user: { findFirst: userFindFirstMock },
    waitlistEntry: {
      update: updateMock,
      updateMany: updateManyMock,
    },
  },
}));
vi.mock("@/lib/user-credits", () => ({
  grantSignupEnergy: grantSignupEnergyMock,
}));
vi.mock("@/lib/dev-log", () => ({ devLog: vi.fn() }));

import {
  approveWaitlistEntry,
  linkApprovedWaitlistOnSignup,
} from "@/lib/waitlist";

describe("waitlist energy grant lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grantSignupEnergyMock.mockResolvedValue(true);
    transactionMock.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          user: { findFirst: userFindFirstMock },
          waitlistEntry: {
            update: updateMock,
            updateMany: updateManyMock,
          },
        }),
    );
  });

  it("grants an already-linked user when approving", async () => {
    updateMock.mockResolvedValue({
      email: "owner@example.com",
      linkedUserId: "u-linked",
    });

    await approveWaitlistEntry("w1", "admin1");

    expect(grantSignupEnergyMock).toHaveBeenCalledWith(
      "u-linked",
      expect.objectContaining({ waitlistEntry: expect.any(Object) }),
    );
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(userFindFirstMock).not.toHaveBeenCalled();
  });

  it("links and grants a matching user by normalized email when approving", async () => {
    updateMock.mockResolvedValue({
      email: " Owner@Example.COM ",
      linkedUserId: null,
    });
    userFindFirstMock.mockResolvedValue({ id: "u-email" });
    updateManyMock.mockResolvedValue({ count: 1 });

    await approveWaitlistEntry("w1", "admin1");

    expect(userFindFirstMock).toHaveBeenCalledWith({
      where: { email: { equals: "owner@example.com", mode: "insensitive" } },
      select: { id: true },
    });
    expect(updateManyMock).toHaveBeenCalledWith({
      data: { linkedUserId: "u-email" },
      where: { id: "w1", linkedUserId: null },
    });
    expect(grantSignupEnergyMock).toHaveBeenCalledWith(
      "u-email",
      expect.objectContaining({ waitlistEntry: expect.any(Object) }),
    );
  });

  it("grants after linking an approved entry on signup", async () => {
    updateManyMock.mockResolvedValue({ count: 1 });

    await linkApprovedWaitlistOnSignup("u-signup", " Owner@Example.COM ");

    expect(updateManyMock).toHaveBeenCalledWith({
      data: { linkedUserId: "u-signup" },
      where: { email: "owner@example.com", status: "approved" },
    });
    expect(grantSignupEnergyMock).toHaveBeenCalledWith("u-signup");
  });

  it("does not grant when signup links no approved entry", async () => {
    updateManyMock.mockResolvedValue({ count: 0 });

    await linkApprovedWaitlistOnSignup("u-signup", "owner@example.com");

    expect(grantSignupEnergyMock).not.toHaveBeenCalled();
  });
});
