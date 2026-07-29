// src/lib/email/templates/waitlist.ts
import { sendEmail } from "@/lib/email";
import { wrapEmail, escapeHtml } from "@/lib/email/templates/wrapper";

const APP_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function sendWaitlistAccepted(to: string, businessName?: string) {
  const displayName = businessName?.trim() || "calon pengusaha";
  const subject = "Pendaftaran Anda Diterima — Selamat Bergabung!";

  const bodyHtml = `
    <p style="font-size:15px;color:#5f5f5d;line-height:1.6;">Halo ${escapeHtml(displayName)},</p>
    <p style="font-size:15px;color:#1c1c1c;line-height:1.6;">
      Pendaftaran Anda telah diterima! Selamat bergabung di UMKM Cepat.
    </p>
    <p style="font-size:15px;color:#1c1c1c;line-height:1.6;">
      Sekarang Anda sudah bisa masuk dan mulai membangun website profesional untuk usaha Anda.
    </p>
  `;

  const { html, text } = wrapEmail(bodyHtml, {
    cta: { text: "Masuk ke UMKM Cepat", url: APP_URL },
  });

  return sendEmail({ to, subject, html, text });
}

export async function sendWaitlistRejected(
  to: string,
  businessName?: string,
  reason?: string,
) {
  const displayName = businessName?.trim() || "calon pengusaha";
  const subject = "Pendaftaran Anda Belum Bisa Diproses";

  const reasonHtml = reason
    ? `<p style="font-size:15px;color:#1c1c1c;line-height:1.6;">Alasan: ${escapeHtml(reason)}</p>`
    : "";

  const bodyHtml = `
    <p style="font-size:15px;color:#5f5f5d;line-height:1.6;">Halo ${escapeHtml(displayName)},</p>
    <p style="font-size:15px;color:#1c1c1c;line-height:1.6;">
      Maaf, pendaftaran Anda belum bisa diproses saat ini.
    </p>
    ${reasonHtml}
    <p style="font-size:15px;color:#1c1c1c;line-height:1.6;">
      Jika Anda memiliki pertanyaan, silakan hubungi kami di <a href="mailto:hello@umkmcepat.com" style="color:#1c1c1c;">hello@umkmcepat.com</a>.
    </p>
  `;

  const { html, text } = wrapEmail(bodyHtml);

  return sendEmail({ to, subject, html, text });
}
