import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertPhoneAvailable, normalizePhone } from "./phone";

const prismaUserFindFirstMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: (...args: unknown[]) => prismaUserFindFirstMock(...args),
    },
  },
}));

describe("normalizePhone", () => {
  it("normalizes 08… to +62…", () => {
    expect(normalizePhone("081234567890")).toBe("+6281234567890");
  });

  it("keeps +62…", () => {
    expect(normalizePhone("+6281234567890")).toBe("+6281234567890");
  });

  it("normalizes 62… without plus", () => {
    expect(normalizePhone("6281234567890")).toBe("+6281234567890");
  });

  it("strips non-digits", () => {
    expect(normalizePhone("+62 812-3456-7890")).toBe("+6281234567890");
  });

  it("rejects too short", () => {
    expect(normalizePhone("08123")).toBeNull();
  });

  it("rejects non-62 country", () => {
    expect(normalizePhone("+15551234567")).toBeNull();
  });

  it("rejects empty", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
  });
});

describe("assertPhoneAvailable", () => {
  beforeEach(() => {
    prismaUserFindFirstMock.mockReset();
  });

  it("ok when no other user holds the phone", async () => {
    prismaUserFindFirstMock.mockResolvedValue(null);
    const res = await assertPhoneAvailable("user_1", "+6281234567890");
    expect(res).toEqual({ ok: true });
    expect(prismaUserFindFirstMock).toHaveBeenCalledWith({
      where: { phone: "+6281234567890", NOT: { id: "user_1" } },
      select: { id: true },
    });
  });

  it("fails when another user holds the phone", async () => {
    prismaUserFindFirstMock.mockResolvedValue({ id: "user_2" });
    const res = await assertPhoneAvailable("user_1", "+6281234567890");
    expect(res).toEqual({
      ok: false,
      error: "Nomor ini sudah terpakai di akun lain.",
    });
  });
});
