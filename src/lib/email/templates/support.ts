// src/lib/email/templates/support.ts
import { sendEmail } from "@/lib/email";
import { wrapEmail } from "@/lib/email/templates/wrapper";

const APP_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function sendTicketResolved(to: string, ticketId: string) {
  const escapedTicketId = escapeHtml(ticketId);
  const escapedShortId = escapeHtml(ticketId.slice(-8).toUpperCase());
  const shortId = ticketId.slice(-8).toUpperCase();
  const subject = `Tiket Dukungan #${shortId} Telah Selesai`;

  const bodyHtml = `
    <p style="font-size:15px;color:#5f5f5d;line-height:1.6;">Halo,</p>
    <p style="font-size:15px;color:#1c1c1c;line-height:1.6;">
      Tiket dukungan Anda <strong>#${escapedShortId}</strong> telah selesai.
    </p>
    <p style="font-size:15px;color:#1c1c1c;line-height:1.6;">
      Terima kasih atas kesabaran Anda. Jika masih ada pertanyaan, jangan ragu untuk membuka tiket baru.
    </p>
  `;

  const { html, text } = wrapEmail(bodyHtml, {
    cta: { text: "Lihat Tiket", url: `${APP_URL}/support/${escapedTicketId}` },
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
