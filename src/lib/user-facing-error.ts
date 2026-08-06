// Maps known backend/adapter error reasons to Indonesian user-facing strings.
// Unknown reasons -> a generic fallback (never the raw internal string).
// Raw errors are logged server-side; the user sees only these.

const KNOWN: Array<{ match: RegExp; message: string }> = [
  {
    match: /not a supported image|invalid project asset/i,
    message: "Format gambar tidak didukung. Gunakan PNG, JPEG, atau WEBP.",
  },
  {
    match: /mayar|payment|transaction failed/i,
    message: "Pembayaran gagal. Coba lagi.",
  },
  {
    match: /resend|email/i,
    message: "Gagal mengirim email. Coba lagi.",
  },
  {
    match: /resend|email/i,
    message: "Gagal mengirim email. Coba lagi.",
  },
  {
    match: /ukuran gambar maksimal 5 mb/i,
    message: "Ukuran gambar maksimal 5 MB per file.",
  },
  {
    match: /format gambar tidak didukung/i,
    message: "Format gambar tidak didukung. Gunakan PNG, JPEG, atau WEBP.",
  },
  {
    match: /upload gambar sudah kedaluwarsa/i,
    message: "Upload gambar sudah kedaluwarsa. Pilih gambar lagi.",
  },
  {
    match: /gambar tidak valid/i,
    message: "Gambar tidak valid.",
  },
  {
    match: /pilih gambar dulu/i,
    message: "Pilih gambar dulu.",
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
