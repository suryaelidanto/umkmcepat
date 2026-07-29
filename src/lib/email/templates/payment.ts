import { sendEmail } from "@/lib/email";
import { wrapEmail } from "@/lib/email/templates/wrapper";

const APP_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function sendPaymentReceipt(
  to: string,
  data: {
    packageName: string;
    amount: number;
    energyGranted: number;
    transactionId: string;
  },
) {
  const subject = `Pembayaran Berhasil — ${data.packageName}`;
  const formattedAmount = formatRupiah(data.amount);
  const date = new Date().toLocaleDateString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const bodyHtml = `
    <p style="font-size:15px;color:#5f5f5d;line-height:1.6;">Halo,</p>
    <p style="font-size:15px;color:#1c1c1c;line-height:1.6;">
      Pembayaran Anda telah berhasil diproses.
    </p>
    <table style="width:100%;font-size:14px;color:#1c1c1c;line-height:1.8;margin:20px 0;">
      <tr><td style="color:#5f5f5d;padding-right:16px;">Paket</td><td><strong>${escapeHtml(data.packageName)}</strong></td></tr>
      <tr><td style="color:#5f5f5d;padding-right:16px;">Total Pembayaran</td><td><strong>${formattedAmount}</strong></td></tr>
      <tr><td style="color:#5f5f5d;padding-right:16px;">Energi Didapatkan</td><td><strong>${data.energyGranted}</strong></td></tr>
      <tr><td style="color:#5f5f5d;padding-right:16px;">Tanggal</td><td>${date}</td></tr>
      <tr><td style="color:#5f5f5d;padding-right:16px;">ID Transaksi</td><td>${escapeHtml(data.transactionId)}</td></tr>
    </table>
    <p style="font-size:15px;color:#1c1c1c;line-height:1.6;">
      Energi Anda sudah bertambah dan siap digunakan untuk membangun website.
    </p>
  `;

  const { html, text } = wrapEmail(bodyHtml, {
    cta: {
      text: "Lihat Transaksi",
      url: `${APP_URL}/profile/transactions`,
    },
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

function formatRupiah(amount: number): string {
  return `Rp${amount.toLocaleString("id-ID")}`;
}
