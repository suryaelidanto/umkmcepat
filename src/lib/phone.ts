import { prisma } from "@/lib/prisma";

/** Normalize Indonesian mobile to `+62…`. Returns null if unusable. */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) {
    digits = `62${digits.slice(1)}`;
  }
  if (!digits.startsWith("62") || digits.length < 11 || digits.length > 15) {
    return null;
  }
  return `+${digits}`;
}

export async function assertPhoneAvailable(
  userId: string,
  phone: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const other = await prisma.user.findFirst({
    where: { phone, NOT: { id: userId } },
    select: { id: true },
  });
  if (other) {
    return {
      ok: false,
      error: "Nomor ini sudah terpakai di akun lain.",
    };
  }
  return { ok: true };
}
