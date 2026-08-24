import { sendEmail } from "@/lib/email";
import { escapeHtml, wrapEmail } from "@/lib/email/templates/wrapper";

const APP_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export type SupportReplyEmailInput = {
  toEmail: string;
  ticketId: string;
  subject: string;
  replyBody: string;
};

export async function sendSupportReplyEmail(input: SupportReplyEmailInput) {
  const shortTicketId = input.ticketId.slice(-8).toUpperCase();
  const emailSubject = `Balasan Tiket #${shortTicketId}: ${input.subject} - UMKM Cepat`;

  const bodyHtml = `
    <p style="font-size:15px;color:#5f5f5d;line-height:1.6;">Halo,</p>
    <p style="font-size:15px;color:#1c1c1c;line-height:1.6;">
      Admin telah membalas tiket dukungan Anda <strong>#${escapeHtml(shortTicketId)}</strong>:
    </p>
    <div style="background-color:#f7f4ed;border-left:4px solid #1c1c1c;padding:15px;margin:20px 0;border-radius:4px;font-style:italic;color:#1c1c1c;font-size:15px;white-space:pre-wrap;">
      ${escapeHtml(input.replyBody)}
    </div>
    <p style="font-size:15px;color:#5f5f5d;line-height:1.6;">
      Silakan klik tombol di bawah untuk melihat percakapan lengkap dan membalas kembali jika diperlukan:
    </p>
  `;

  const { html, text } = wrapEmail(bodyHtml, {
    cta: {
      text: "Lihat Tiket Dukungan",
      url: `${APP_URL}/support/${input.ticketId}`,
    },
  });

  return sendEmail({
    to: input.toEmail,
    subject: emailSubject,
    html,
    text,
  });
}

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
