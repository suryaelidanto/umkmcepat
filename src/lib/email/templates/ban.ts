import { sendEmail } from "@/lib/email";
import { escapeHtml, wrapEmail } from "@/lib/email/templates/wrapper";

const APP_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function sendBannedNotification(to: string, name?: string) {
  const displayName = name?.trim() || "Pengguna";
  const subject = "Akun Anda Diblokir — UMKM Cepat";

  const bodyHtml = `
    <p style="font-size:15px;color:#5f5f5d;line-height:1.6;">Halo ${escapeHtml(displayName)},</p>
    <p style="font-size:15px;color:#1c1c1c;line-height:1.6;">
      Akun Anda telah diblokir. Jika Anda memiliki pertanyaan, silakan hubungi kami di <a href="mailto:hello@umkmcepat.com" style="color:#1c1c1c;">hello@umkmcepat.com</a>.
    </p>
  `;

  const { html, text } = wrapEmail(bodyHtml);
  return sendEmail({ to, subject, html, text });
}

export async function sendUnbannedNotification(to: string, name?: string) {
  const displayName = name?.trim() || "Pengguna";
  const subject = "Akun Anda Sudah Aktif Kembali — UMKM Cepat";

  const bodyHtml = `
    <p style="font-size:15px;color:#5f5f5d;line-height:1.6;">Halo ${escapeHtml(displayName)},</p>
    <p style="font-size:15px;color:#1c1c1c;line-height:1.6;">
      Akun Anda sudah aktif kembali. Silakan masuk untuk melanjutkan.
    </p>
  `;

  const { html, text } = wrapEmail(bodyHtml, {
    cta: { text: "Masuk ke UMKM Cepat", url: APP_URL },
  });

  return sendEmail({ to, subject, html, text });
}
