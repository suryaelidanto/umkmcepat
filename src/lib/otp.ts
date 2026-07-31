import { Buffer } from "node:buffer";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { assertPhoneAvailable, normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const MAX_FAILED_CODES = 5;
const LOCKOUT_MINUTES = 5;
const OTP_LENGTH = 6;
// OTP Space owns the code — send + verify are two API calls (not local hash).
const OTPSPACE_SEND = "https://api.otpspace.com/v1/otp/send";
const OTPSPACE_VERIFY = "https://api.otpspace.com/v1/otp/verify";
const PROVIDER_MANAGED_HASH = "provider-managed";

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(OTP_LENGTH, "0");
}

function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** OTP Space docs use digits without `+` (e.g. 62812…). */
export function toOtpSpacePhone(phone: string): string {
  return phone.replace(/^\+/, "");
}

function isProviderMode(): boolean {
  return Boolean(process.env.OTP_SPACE_API_KEY);
}

export async function createOtpRequest(
  userId: string,
  phone: string,
): Promise<{ code: string; expiresAt: Date }> {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  // Provider mode: OTP Space generates the real code; we only track attempts.
  const codeHash = isProviderMode() ? PROVIDER_MANAGED_HASH : hashOtp(code);

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

  const trimmedCode = code.trim();
  if (!/^\d{4,8}$/.test(trimmedCode)) {
    return { success: false, error: "Kode OTP tidak valid." };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { otpAttempts: true, otpLockedUntil: true },
  });

  if (user?.otpLockedUntil && user.otpLockedUntil > new Date()) {
    const minsLeft = Math.max(
      1,
      Math.ceil((user.otpLockedUntil.getTime() - Date.now()) / 60_000),
    );
    return {
      success: false,
      error: `Akun dikunci sementara karena terlalu banyak percobaan salah. Coba lagi dalam ${minsLeft} menit.`,
    };
  }

  const request = await prisma.otpRequest.findFirst({
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

  if (request.attempts >= MAX_ATTEMPTS) {
    return {
      success: false,
      error: "Terlalu banyak percobaan. Minta kode baru.",
    };
  }

  let isCorrect = false;

  if (isProviderMode()) {
    const provider = await verifyOtpViaProvider(normalized, trimmedCode);
    if (!provider.success && provider.transportError) {
      return { success: false, error: provider.error };
    }
    isCorrect = provider.success;
  } else {
    const inputHash = hashOtp(trimmedCode);
    const storedHashBuf = Buffer.from(request.codeHash, "hex");
    const inputHashBuf = Buffer.from(inputHash, "hex");
    isCorrect =
      storedHashBuf.length === inputHashBuf.length &&
      timingSafeEqual(storedHashBuf, inputHashBuf);
  }

  if (!isCorrect) {
    const newAttempts = request.attempts + 1;

    await prisma.otpRequest.update({
      where: { id: request.id },
      data: { attempts: newAttempts },
    });

    if (newAttempts >= MAX_ATTEMPTS) {
      const newOtpAttempts = (user?.otpAttempts ?? 0) + 1;
      let otpLockedUntil: Date | null = null;

      if (newOtpAttempts >= MAX_FAILED_CODES) {
        otpLockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          otpAttempts: newOtpAttempts,
          ...(otpLockedUntil ? { otpLockedUntil } : {}),
        },
      });

      if (newOtpAttempts >= MAX_FAILED_CODES) {
        return {
          success: false,
          error: `Akun dikunci sementara karena terlalu banyak percobaan salah. Coba lagi dalam ${LOCKOUT_MINUTES} menit.`,
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
    const response = await fetch(OTPSPACE_SEND, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone: toOtpSpacePhone(phone),
        otp_length: OTP_LENGTH,
        expiry_seconds: OTP_EXPIRY_MINUTES * 60,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[otp] OTP Space send error:", error);
      return { success: false, error: "Gagal mengirim OTP. Coba lagi." };
    }

    return { success: true };
  } catch (error) {
    console.error("[otp] OTP Space send error:", error);
    return { success: false, error: "Gagal mengirim OTP. Coba lagi." };
  }
}

async function verifyOtpViaProvider(
  phone: string,
  code: string,
): Promise<{
  success: boolean;
  error?: string;
  transportError?: boolean;
}> {
  const apiKey = process.env.OTP_SPACE_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: "OTP provider tidak dikonfigurasi.",
      transportError: true,
    };
  }

  try {
    const response = await fetch(OTPSPACE_VERIFY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone: toOtpSpacePhone(phone),
        code,
      }),
    });

    if (response.ok) {
      const body = (await response.json().catch(() => null)) as {
        success?: boolean;
      } | null;
      if (body?.success === false) {
        return { success: false };
      }
      return { success: true };
    }

    // Wrong/expired code — treat as incorrect, not transport failure.
    if (
      response.status === 400 ||
      response.status === 401 ||
      response.status === 422
    ) {
      return { success: false };
    }

    const error = await response.text();
    console.error("[otp] OTP Space verify error:", error);
    return {
      success: false,
      error: "Gagal memverifikasi OTP. Coba lagi.",
      transportError: true,
    };
  } catch (error) {
    console.error("[otp] OTP Space verify error:", error);
    return {
      success: false,
      error: "Gagal memverifikasi OTP. Coba lagi.",
      transportError: true,
    };
  }
}
