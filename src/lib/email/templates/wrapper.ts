export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function wrapEmail(
  bodyHtml: string,
  opts?: { cta?: { text: string; url: string } },
): { html: string; text: string } {
  const ctaHtml = opts?.cta
    ? `
      <div style="text-align:center;margin-bottom:35px;">
        <a href="${escapeHtml(opts.cta.url)}" style="background-color:#1c1c1c;color:#fcfbf8;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:500;font-size:14px;display:inline-block;">
          ${escapeHtml(opts.cta.text)}
        </a>
      </div>`
    : "";

  const ctaText = opts?.cta ? `\n\n${opts.cta.text}: ${opts.cta.url}` : "";

  const html = `<!DOCTYPE html>
<html lang="id">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f3ef;">
  <div style="font-family:'Plus Jakarta Sans',ui-sans-serif,system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #d8d5cc;border-radius:8px;background-color:#fcfbf8;color:#1c1c1c;">
    <h2 style="font-size:18px;font-weight:600;border-bottom:1px solid #d8d5cc;padding-bottom:10px;margin-top:0;">UMKM Cepat</h2>
    ${bodyHtml}
    ${ctaHtml}
    <hr style="border:0;border-top:1px solid #d8d5cc;margin:30px 0;" />
    <p style="font-size:12px;color:#5f5f5d;line-height:1.5;text-align:center;margin-bottom:0;">
      Pesan ini dikirim secara otomatis. Mohon tidak membalas email ini secara langsung.
    </p>
  </div>
</body>
</html>`;

  // Strip HTML tags for plaintext, keep line breaks
  const textBody = bodyHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const text = `
UMKM Cepat

${textBody}${ctaText}

Mohon tidak membalas email ini secara langsung.
`.trim();

  return { html, text };
}
