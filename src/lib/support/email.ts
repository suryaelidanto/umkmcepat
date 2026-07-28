import { devLog } from "@/lib/dev-log";
import { sendEmail } from "@/lib/email";

type SupportReplyEmailInput = {
  toEmail: string;
  ticketId: string;
  subject: string;
  replyBody: string;
};

export async function sendSupportReplyEmail(input: SupportReplyEmailInput) {
  const shortTicketId = input.ticketId.slice(-8).toUpperCase();
  const emailSubject = `Balasan Tiket #${shortTicketId}: ${input.subject} - UMKM Cepat`;

  const html = `
    <div style="font-family: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #d8d5cc; border-radius: 8px; background-color: #fcfbf8; color: #1c1c1c;">
      <h2 style="font-size: 18px; font-weight: 600; border-b: 1px solid #d8d5cc; padding-bottom: 10px; margin-top: 0;">UMKM Cepat Support</h2>
      <p style="font-size: 15px; color: #5f5f5d; line-height: 1.6;">Halo,</p>
      <p style="font-size: 15px; color: #1c1c1c; line-height: 1.6;">
        Admin telah membalas tiket dukungan Anda <strong>#${shortTicketId}</strong>:
      </p>
      <div style="background-color: #f7f4ed; border-left: 4px solid #1c1c1c; padding: 15px; margin: 20px 0; border-radius: 4px; font-style: italic; color: #1c1c1c; font-size: 15px; white-space: pre-wrap;">
        ${escapeHtml(input.replyBody)}
      </div>
      <p style="font-size: 15px; color: #5f5f5d; line-height: 1.6; margin-bottom: 30px;">
        Silakan klik tombol di bawah untuk melihat percakapan lengkap dan membalas kembali jika diperlukan:
      </p>
      <div style="text-align: center; margin-bottom: 35px;">
        <a href="${process.env.NEXTAUTH_URL || "http://localhost:3000"}/support/${input.ticketId}" style="background-color: #1c1c1c; color: #fcfbf8; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; display: inline-block;">
          Lihat Tiket Dukungan
        </a>
      </div>
      <hr style="border: 0; border-top: 1px solid #d8d5cc; margin: 30px 0;" />
      <p style="font-size: 12px; color: #5f5f5d; line-height: 1.5; text-align: center; margin-bottom: 0;">
        Pesan ini dikirim secara otomatis. Mohon tidak membalas email ini secara langsung.
      </p>
    </div>
  `;

  const text = `
    UMKM Cepat Support

    Halo,

    Admin telah membalas tiket dukungan Anda #${shortTicketId}: "${input.subject}"

    Balasan admin:
    --------------------------------------------------
    ${input.replyBody}
    --------------------------------------------------

    Silakan kunjungi tautan berikut untuk melihat percakapan lengkap dan membalas:
    ${process.env.NEXTAUTH_URL || "http://localhost:3000"}/support/${input.ticketId}

    Terima kasih,
    Tim UMKM Cepat
  `;

  devLog("Sending support reply email to", input.toEmail);

  return sendEmail({
    to: input.toEmail,
    subject: emailSubject,
    html,
    text,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
