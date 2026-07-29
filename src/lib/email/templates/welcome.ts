import { sendEmail } from "@/lib/email";
import { wrapEmail } from "@/lib/email/templates/wrapper";

const APP_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function sendWelcomeEmail(to: string, name: string) {
  const displayName = name?.trim() || "calon pengusaha";
  const subject = `Selamat Datang di UMKM Cepat, ${displayName}!`;

  const bodyHtml = `
    <p style="font-size:15px;color:#5f5f5d;line-height:1.6;">Halo ${escapeHtml(displayName)},</p>
    <p style="font-size:15px;color:#1c1c1c;line-height:1.6;">
      Selamat bergabung di UMKM Cepat! Kami senang Anda hadir.
    </p>
    <p style="font-size:15px;color:#1c1c1c;line-height:1.6;">
      Dengan UMKM Cepat, Anda bisa membangun website profesional untuk usaha Anda dalam hitungan menit — tanpa perlu coding.
    </p>
    <p style="font-size:15px;color:#1c1c1c;line-height:1.6;">
      Siap memulai? Klik tombol di bawah untuk langsung membuat website pertama Anda.
    </p>
  `;

  const { html, text } = wrapEmail(bodyHtml, {
    cta: { text: "Mulai Bangun Website", url: APP_URL },
  });

  return sendEmail({ to, subject, html, text });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
