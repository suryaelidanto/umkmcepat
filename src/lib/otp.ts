import { randomInt } from "node:crypto";

import { prisma } from "@/lib/prisma";

const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 3;
const OTP_LENGTH = 6;
const OTPSPACE_ENDPOINT = "https://api.otpspace.com/v1/send";

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(OTP_LENGTH, "0");
}

export async function createOtpRequest(
  userId: string,
  phone: string,
): Promise<{ code: string; expiresAt: Date }> {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await prisma.otpRequest.create({
    data: {
      userId,
      phone,
      code,
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
  const request = await prisma.otpRequest.findFirst({
    where: {
      userId,
      phone,
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

  if (request.attempts >= MAX_ATTEMPTS) {
    return {
      success: false,
      error: "Terlalu banyak percobaan. Minta kode baru.",
    };
  }

  if (request.code !== code) {
    await prisma.otpRequest.update({
      where: { id: request.id },
      data: { attempts: { increment: 1 } },
    });
    return { success: false, error: "Kode OTP salah." };
  }

  await prisma.$transaction([
    prisma.otpRequest.update({
      where: { id: request.id },
      data: { used: true },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { phone, verifiedAt: new Date() },
    }),
  ]);

  return { success: true };
}

export async function sendOtpViaSms(
  phone: string,
  code: string,
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.OTP_SPACE_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "OTP_SPACE_API_KEY is required to send OTP in production.",
      );
    }
    console.warn("[otp] mock", { code, phone });
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
