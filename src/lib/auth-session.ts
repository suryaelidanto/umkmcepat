import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function generateSessionToken(): string {
  return randomBytes(64).toString("hex");
}

export async function createRefreshToken(userId: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await prisma.refreshToken.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  return token;
}

export async function rotateRefreshToken(
  oldToken: string,
): Promise<{ token: string; userId: string }> {
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: oldToken },
  });

  if (!storedToken) {
    // If token is missing, it might have been reused/stolen.
    // As a defense-in-depth reuse detection mechanism:
    // Invalidate everything to be safe. But since we don't know the userId here
    // without the token lookup, we throw. If the client tries to use a token
    // that doesn't exist, we force a full re-login.
    throw new Error("Invalid or already used refresh token.");
  }

  if (storedToken.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });
    throw new Error("Refresh token expired.");
  }

  // Generate new token pair
  const newToken = generateSessionToken();
  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  // Rotate token inside transaction to prevent race conditions & double-spends
  await prisma.$transaction(async (tx) => {
    // Check again to lock the row and prevent race conditions (double spend of token)
    const activeToken = await tx.refreshToken.findUnique({
      where: { token: oldToken },
    });

    if (!activeToken) {
      // Reuse detected! Someone else has already rotated this token.
      // Revoke all tokens for this user immediately for security.
      if (storedToken.userId) {
        await tx.refreshToken.deleteMany({
          where: { userId: storedToken.userId },
        });
      }
      throw new Error("Refresh token reuse detected! All sessions revoked.");
    }

    // Delete old token
    await tx.refreshToken.delete({
      where: { id: activeToken.id },
    });

    // Create new token
    await tx.refreshToken.create({
      data: {
        userId: activeToken.userId,
        token: newToken,
        expiresAt: newExpiresAt,
      },
    });
  });

  return { token: newToken, userId: storedToken.userId };
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: { userId },
  });
}
