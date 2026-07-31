import { Buffer } from "node:buffer";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { assertPhoneAvailable, normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 3;
const OTP_LENGTH = 6;
const OTPSPACE_ENDPOINT = "https://api.otpspace.com/v1/send";

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(OTP_LENGTH, "0");
}

function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function createOtpRequest(
  userId: string,
  phone: string,
): Promise<{ code: string; expiresAt: Date }> {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const codeHash = hashOtp(code);

  await prisma.otpRequest.create({
    data: {
      userId,
      phone,
      codeHash,
      expiresAt,
    },
  });

  return { code, expiresAt };
}

export async function verifyOtp(
  userId: string,
  phone: string,
  code: string,
): Promise<{ success: boolean; error?: string }> {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return {
      success: false,
      error: "Nomor telepon tidak valid. Gunakan format: +6281234567890",
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { otpAttempts: true, otpLockedUntil: true },
  });

  if (user?.otpLockedUntil && user.otpLockedUntil > new Date()) {
    return {
      success: false,
      error:
        "Akun Anda dikunci sementara karena terlalu banyak percobaan salah. Silakan coba lagi nanti.",
    };
  }

  const inputHash = hashOtp(code);
  let request = await prisma.otpRequest.findFirst({
    where: {
      userId,
      phone: normalized,
      codeHash: inputHash,
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  let isCorrect = true;
  if (!request) {
    request = await prisma.otpRequest.findFirst({
      where: {
        userId,
        phone: normalized,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!request) {
      return {
        success: false,
        error: "Kode OTP tidak ditemukan atau sudah kedaluwarsa.",
      };
    }
    isCorrect = false;
  }

  if (request.attempts >= MAX_ATTEMPTS) {
    return {
      success: false,
      error: "Terlalu banyak percobaan. Minta kode baru.",
    };
  }

  const storedHashBuf = Buffer.from(request.codeHash, "hex");
  const inputHashBuf = Buffer.from(inputHash, "hex");
  const match =
    storedHashBuf.length === inputHashBuf.length &&
    timingSafeEqual(storedHashBuf, inputHashBuf);

  if (!match || !isCorrect) {
    const newAttempts = request.attempts + 1;

    await prisma.otpRequest.update({
      where: { id: request.id },
      data: { attempts: newAttempts },
    });

    if (newAttempts >= MAX_ATTEMPTS) {
      const newOtpAttempts = (user?.otpAttempts ?? 0) + 1;
      let otpLockedUntil: Date | null = null;

      if (newOtpAttempts >= 5) {
        otpLockedUntil = new Date(Date.now() + 30 * 60 * 1000);
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          otpAttempts: newOtpAttempts,
          ...(otpLockedUntil ? { otpLockedUntil } : {}),
        },
      });

      if (newOtpAttempts >= 5) {
        return {
          success: false,
          error:
            "Akun Anda dikunci sementara karena terlalu banyak percobaan salah. Silakan coba lagi nanti.",
        };
      }

      return {
        success: false,
        error: "Terlalu banyak percobaan. Minta kode baru.",
      };
    }

    return { success: false, error: "Kode OTP salah." };
  }

  const available = await assertPhoneAvailable(userId, normalized);
  if (!available.ok) {
    return { success: false, error: available.error };
  }

  try {
    await prisma.$transaction([
      prisma.otpRequest.update({
        where: { id: request.id },
        data: { used: true },
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          phone: normalized,
          verifiedAt: new Date(),
          otpAttempts: 0,
        },
      }),
    ]);
  } catch {
    // Unique race: another account claimed the same phone between check and write.
    return {
      success: false,
      error: "Nomor ini sudah terpakai di akun lain.",
    };
  }

  return { success: true };
}

export async function sendOtpViaSms(
  phone: string,
  _code: string,
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.OTP_SPACE_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "OTP_SPACE_API_KEY is required to send OTP in production.",
      );
    }
    console.warn(
      "[otp] mock mode — OTP code omitted from logs for security purposes",
    );
    return { success: true };
  }

  try {
    const response = await fetch(OTPSPACE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ app_name: "UMKM Cepat", phone }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[otp] OTP Space error:", error);
      return { success: false, error: "Gagal mengirim OTP. Coba lagi." };
    }

    return { success: true };
  } catch (error) {
    console.error("[otp] OTP Space error:", error);
    return { success: false, error: "Gagal mengirim OTP. Coba lagi." };
  }
}
