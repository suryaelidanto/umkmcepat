import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRefreshToken,
  generateSessionToken,
  rotateRefreshToken,
  revokeAllSessions,
} from "./auth-session";

const prismaCreateMock = vi.fn();
const prismaFindUniqueMock = vi.fn();
const prismaDeleteMock = vi.fn();
const prismaDeleteManyMock = vi.fn();
const prismaTransactionMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    refreshToken: {
      create: (...args: unknown[]) => prismaCreateMock(...args),
      findUnique: (...args: unknown[]) => prismaFindUniqueMock(...args),
      delete: (...args: unknown[]) => prismaDeleteMock(...args),
      deleteMany: (...args: unknown[]) => prismaDeleteManyMock(...args),
    },
    $transaction: (...args: unknown[]) => prismaTransactionMock(...args),
  },
}));

describe("auth-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateSessionToken", () => {
    it("generates a 128-character hex string", () => {
      const token = generateSessionToken();
      expect(token).toHaveLength(128);
      expect(/^[a-f0-9]{128}$/.test(token)).toBe(true);
    });
  });

  describe("createRefreshToken", () => {
    it("creates and returns a refresh token", async () => {
      prismaCreateMock.mockResolvedValue({ id: "1" });
      const token = await createRefreshToken("user_1");
      expect(token).toHaveLength(128);
      expect(prismaCreateMock).toHaveBeenCalledWith({
        data: {
          userId: "user_1",
          token,
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe("rotateRefreshToken", () => {
    it("rotates token successfully", async () => {
      const oldToken = "old_token";
      const storedToken = {
        id: "1",
        userId: "user_1",
        token: oldToken,
        expiresAt: new Date(Date.now() + 100000),
      };

      prismaFindUniqueMock.mockResolvedValueOnce(storedToken);
      prismaTransactionMock.mockImplementationOnce(async (cb) => {
        const tx = {
          refreshToken: {
            findUnique: vi.fn().mockResolvedValue(storedToken),
            delete: vi.fn(),
            create: vi.fn(),
          },
        };
        return cb(tx);
      });

      const res = await rotateRefreshToken(oldToken);
      expect(res.userId).toBe("user_1");
      expect(res.token).toHaveLength(128);
    });

    it("throws error if token is expired", async () => {
      const oldToken = "old_token";
      const storedToken = {
        id: "1",
        userId: "user_1",
        token: oldToken,
        expiresAt: new Date(Date.now() - 100000), // expired
      };

      prismaFindUniqueMock.mockResolvedValueOnce(storedToken);
      await expect(rotateRefreshToken(oldToken)).rejects.toThrow("expired");
    });
  });

  describe("revokeAllSessions", () => {
    it("deletes all refresh tokens for user", async () => {
      prismaDeleteManyMock.mockResolvedValue({ count: 1 });
      await revokeAllSessions("user_1");
      expect(prismaDeleteManyMock).toHaveBeenCalledWith({
        where: { userId: "user_1" },
      });
    });
  });
});
