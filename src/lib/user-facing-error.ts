// Maps known backend/adapter error reasons to Indonesian user-facing strings.
// Unknown reasons -> a generic fallback (never the raw internal string).
// Raw errors are logged server-side; the user sees only these.

const KNOWN: Array<{ match: RegExp; message: string }> = [
  {
    match: /not a supported image|invalid project asset/i,
    message: "Format gambar tidak didukung. Gunakan PNG, JPEG, atau WEBP.",
  },
  {
    match: /pakasir|payment|transaction failed/i,
    message: "Pembayaran gagal. Coba lagi.",
  },
  {
    match: /resend|email/i,
    message: "Gagal mengirim email. Coba lagi.",
  },
  {
    match: /otp|otpspace/i,
    message: "Gagal mengirim OTP. Coba lagi.",
  },
  {
    match: /R2|r2|cloudflarestorage|signed.*fetch/i,
    message: "Gagal mengunggah file. Coba lagi.",
  },
];

const FALLBACK = "Permintaan belum bisa diproses. Coba lagi nanti.";

export function mapToUserFacingError(reason: string): string {
  for (const { match, message } of KNOWN) {
    if (match.test(reason)) {
      return message;
    }
  }
  return FALLBACK;
}
