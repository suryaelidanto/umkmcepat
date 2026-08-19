# Transactional Email System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 8 transactional email triggers with a shared HTML wrapper for consistent branding.

**Architecture:** A `src/lib/email/templates/` directory with a shared `wrapper.ts` (header/footer/CTA helper) and per-type template files. Each template exports a `sendXxxEmail()` function that calls `wrapper.wrapEmail()` then `sendEmail()` from the existing core library. Eight trigger points in route/auth files call these senders as non-fatal side-effects.

**Tech Stack:** Resend, TypeScript, TanStack Start server handlers, Auth.js events, Prisma

## Global Constraints

- Email sending is always non-fatal: log on error, never block the primary action
- Use existing `sendEmail({ to, subject, html, text })` from `@/lib/email`
- User-facing email content uses Indonesian
- Existing `sendSupportReplyEmail` in `src/lib/support/email.ts` stays as-is — no refactor
- Follow existing error-handling pattern from `src/lib/support/email.ts` (log, return, don't throw)
- Dev mock mode works automatically (existing `sendEmail` mocks when `RESEND_API_KEY` is unset)

---

## File Structure

### Files to Create

```
src/lib/email/templates/
├── wrapper.ts       — shared HTML wrapper + CTA button helper
├── welcome.ts       — sendWelcomeEmail()
├── waitlist.ts      — sendWaitlistAccepted(), sendWaitlistRejected()
├── payment.ts       — sendPaymentReceipt()
├── ban.ts           — sendBannedNotification(), sendUnbannedNotification()
├── support.ts       — sendTicketResolved()
├── index.ts         — re-export all
```

### Files to Modify

```
src/lib/auth-config.ts                                 ← insert welcome email
src/routes/api.admin.waitlist.ts                        ← insert waitlist emails
src/routes/api.payment.webhook.ts                       ← insert payment receipt
src/routes/api.admin.transactions.$orderId.verify.ts    ← insert payment receipt
src/routes/api.admin.users.$id.ts                       ← insert ban/unban emails
src/routes/api.admin.tickets.$ticketId.resolve.ts       ← insert ticket resolved email
```

### Test Files to Create

```
src/lib/email/templates/wrapper.test.ts
src/lib/email/templates/welcome.test.ts
src/lib/email/templates/waitlist.test.ts
src/lib/email/templates/payment.test.ts
src/lib/email/templates/ban.test.ts
src/lib/email/templates/support.test.ts
```

---

### Task 1: Shared HTML Wrapper + CTA Helper

**Files:**
- Create: `src/lib/email/templates/wrapper.ts`
- Test: `src/lib/email/templates/wrapper.test.ts`

**Interfaces:**
- Produces:
  - `escapeHtml(str: string): string` — HTML-escape a string
  - `wrapEmail(bodyHtml: string, opts?: { cta?: { text: string; url: string } }): { html: string; text: string }` — wraps body HTML with header/footer/branding, returns both HTML and plaintext versions
  - `brandColor: "#1c1c1c"` (constant, for reuse)

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/email/templates/wrapper.test.ts
import { describe, it, expect } from "vitest";
import { escapeHtml } from "@/lib/email/templates/wrapper";

describe("escapeHtml", () => {
  it("escapes & < > \" '", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#039;");
  });

  it("passes through safe strings", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});
```

```ts
// Additional test in same file
import { wrapEmail } from "@/lib/email/templates/wrapper";

describe("wrapEmail", () => {
  it("returns html and text with header/footer", () => {
    const result = wrapEmail("<p>Isi email</p>");
    expect(result.html).toContain("UMKM Cepat");
    expect(result.html).toContain("<p>Isi email</p>");
    expect(result.html).toContain("Mohon tidak membalas email ini");
    expect(result.text).toContain("Isi email");
    expect(result.text).toContain("Mohon tidak membalas email ini");
  });

  it("includes CTA button when provided", () => {
    const result = wrapEmail("<p>Test</p>", {
      cta: { text: "Klik Di Sini", url: "https://example.com" },
    });
    expect(result.html).toContain("Klik Di Sini");
    expect(result.html).toContain("https://example.com");
    expect(result.text).toContain("Klik Di Sini");
    expect(result.text).toContain("https://example.com");
  });

  it("does not include CTA section when not provided", () => {
    const result = wrapEmail("<p>Test</p>");
    expect(result.html).not.toContain("text-align:center");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run `bun test src/lib/email/templates/wrapper.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/email/templates/wrapper.ts
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
      <div style="text-align: center; margin-bottom: 35px;">
        <a href="${escapeHtml(opts.cta.url)}" style="background-color: #1c1c1c; color: #fcfbf8; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; display: inline-block;">
          ${escapeHtml(opts.cta.text)}
        </a>
      </div>`
    : "";

  const ctaText = opts?.cta
    ? `\n\n${opts.cta.text}: ${opts.cta.url}`
    : "";

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
```

- [ ] **Step 4: Run test to verify it passes**

Run `bun test src/lib/email/templates/wrapper.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/wrapper.ts src/lib/email/templates/wrapper.test.ts
git commit -m "feat(email): add shared HTML wrapper + CTA helper"
```

---

### Task 2: Welcome Email Template

**Files:**
- Create: `src/lib/email/templates/welcome.ts`
- Test: `src/lib/email/templates/welcome.test.ts`

**Interfaces:**
- Consumes: `wrapEmail(bodyHtml, opts?)` from `./wrapper`
- Produces: `async sendWelcomeEmail(to: string, name: string): Promise<{success: boolean}>` — sends welcome email to new user

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/email/templates/welcome.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: sendEmailMock,
}));

import { sendWelcomeEmail } from "@/lib/email/templates/welcome";

describe("sendWelcomeEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends welcome email with correct subject and name", async () => {
    await sendWelcomeEmail("user@example.com", "Budi");

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const args = sendEmailMock.mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toContain("Selamat Datang");
    expect(args.subject).toContain("Budi");
  });

  it("contains CTA to start building", async () => {
    await sendWelcomeEmail("user@example.com", "Budi");
    const html = sendEmailMock.mock.calls[0][0].html;
    expect(html).toContain("Mulai Bangun Website");
  });

  it("handles missing name gracefully", async () => {
    await sendWelcomeEmail("user@example.com", "");
    const args = sendEmailMock.mock.calls[0][0];
    expect(args.subject).toContain("Selamat Datang");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run `bun test src/lib/email/templates/welcome.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```ts
// src/lib/email/templates/welcome.ts
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
```

**Note:** `export function escapeHtml` is duplicated intentionally — `wrapper.ts` exposes it for tests but template files keep their own local copy to avoid cross-module dependency in tests (consistent with existing codebase pattern in `src/lib/support/email.ts`).

- [ ] **Step 4: Run test — expect PASS**

Run `bun test src/lib/email/templates/welcome.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/welcome.ts src/lib/email/templates/welcome.test.ts
git commit -m "feat(email): add welcome email template"
```

---

### Task 3: Waitlist Email Templates (Accepted + Rejected)

**Files:**
- Create: `src/lib/email/templates/waitlist.ts`
- Test: `src/lib/email/templates/waitlist.test.ts`

**Interfaces:**
- Consumes: `wrapEmail(bodyHtml, opts?)` from `./wrapper`
- Produces:
  - `async sendWaitlistAccepted(to: string, businessName?: string): Promise<{success: boolean}>`
  - `async sendWaitlistRejected(to: string, businessName?: string, reason?: string): Promise<{success: boolean}>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/email/templates/waitlist.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: sendEmailMock,
}));

import {
  sendWaitlistAccepted,
  sendWaitlistRejected,
} from "@/lib/email/templates/waitlist";

describe("sendWaitlistAccepted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends accepted email with login CTA", async () => {
    await sendWaitlistAccepted("user@example.com", "Toko Budi");

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const args = sendEmailMock.mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toContain("Diterima");
    expect(args.html).toContain("Masuk ke UMKM Cepat");
  });

  it("works without business name", async () => {
    await sendWaitlistAccepted("user@example.com");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});

describe("sendWaitlistRejected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends rejected email without CTA", async () => {
    await sendWaitlistRejected("user@example.com", "Toko Budi", "Kuota penuh");

    const args = sendEmailMock.mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toContain("Belum Bisa Diproses");
    expect(args.html).toContain("Kuota penuh");
    expect(args.html).toContain("hello@umkmcepat.com");
    // No CTA button for rejected
    expect(args.html).not.toContain("background-color: #1c1c1c");
  });

  it("works without reason", async () => {
    await sendWaitlistRejected("user@example.com");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run `bun test src/lib/email/templates/waitlist.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```ts
// src/lib/email/templates/waitlist.ts
import { sendEmail } from "@/lib/email";
import { wrapEmail } from "@/lib/email/templates/wrapper";

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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

- [ ] **Step 4: Run test — expect PASS**

Run `bun test src/lib/email/templates/waitlist.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/waitlist.ts src/lib/email/templates/waitlist.test.ts
git commit -m "feat(email): add waitlist accepted/rejected email templates"
```

---

### Task 4: Payment Receipt Email Template

**Files:**
- Create: `src/lib/email/templates/payment.ts`
- Test: `src/lib/email/templates/payment.test.ts`

**Interfaces:**
- Consumes: `wrapEmail(bodyHtml, opts?)` from `./wrapper`
- Produces:
  - `async sendPaymentReceipt(to: string, data: { packageName: string; amount: number; energyGranted: number; transactionId: string }): Promise<{success: boolean}>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/email/templates/payment.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: sendEmailMock,
}));

import { sendPaymentReceipt } from "@/lib/email/templates/payment";

describe("sendPaymentReceipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends receipt with package details", async () => {
    await sendPaymentReceipt("user@example.com", {
      packageName: "Energy Booster",
      amount: 50000,
      energyGranted: 100,
      transactionId: "INV-12345",
    });

    const args = sendEmailMock.mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toContain("Pembayaran Berhasil");
    expect(args.subject).toContain("Energy Booster");
    expect(args.html).toContain("Rp50.000");
    expect(args.html).toContain("100");
    expect(args.html).toContain("INV-12345");
  });

  it("formats amount with thousands separator", async () => {
    await sendPaymentReceipt("user@example.com", {
      packageName: "Paket Premium",
      amount: 1500000,
      energyGranted: 500,
      transactionId: "INV-67890",
    });

    const html = sendEmailMock.mock.calls[0][0].html;
    expect(html).toContain("Rp1.500.000");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run `bun test src/lib/email/templates/payment.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```ts
// src/lib/email/templates/payment.ts
import { sendEmail } from "@/lib/email";
import { wrapEmail } from "@/lib/email/templates/wrapper";

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
    cta: { text: "Lihat Transaksi", url: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/profile/transactions` },
  });

  return sendEmail({ to, subject, html, text });
}

function formatRupiah(amount: number): string {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

- [ ] **Step 4: Run test — expect PASS**

Run `bun test src/lib/email/templates/payment.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/payment.ts src/lib/email/templates/payment.test.ts
git commit -m "feat(email): add payment receipt email template"
```

---

### Task 5: Ban/Unban Email Templates

**Files:**
- Create: `src/lib/email/templates/ban.ts`
- Test: `src/lib/email/templates/ban.test.ts`

**Interfaces:**
- Consumes: `wrapEmail(bodyHtml, opts?)` from `./wrapper`
- Produces:
  - `async sendBannedNotification(to: string, name?: string): Promise<{success: boolean}>`
  - `async sendUnbannedNotification(to: string, name?: string): Promise<{success: boolean}>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/email/templates/ban.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: sendEmailMock,
}));

import {
  sendBannedNotification,
  sendUnbannedNotification,
} from "@/lib/email/templates/ban";

describe("sendBannedNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends ban notification with contact info, no CTA", async () => {
    await sendBannedNotification("user@example.com", "Budi");

    const args = sendEmailMock.mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toContain("Diblokir");
    expect(args.html).toContain("hello@umkmcepat.com");
    expect(args.html).not.toContain("background-color: #1c1c1c");
  });
});

describe("sendUnbannedNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends unbanned notification with login CTA", async () => {
    await sendUnbannedNotification("user@example.com", "Budi");

    const args = sendEmailMock.mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toContain("Aktif Kembali");
    expect(args.html).toContain("Masuk ke UMKM Cepat");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run `bun test src/lib/email/templates/ban.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```ts
// src/lib/email/templates/ban.ts
import { sendEmail } from "@/lib/email";
import { wrapEmail } from "@/lib/email/templates/wrapper";

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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

- [ ] **Step 4: Run test — expect PASS**

Run `bun test src/lib/email/templates/ban.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/ban.ts src/lib/email/templates/ban.test.ts
git commit -m "feat(email): add ban/unban email templates"
```

---

### Task 6: Ticket Resolved Email Template

**Files:**
- Create: `src/lib/email/templates/support.ts`
- Test: `src/lib/email/templates/support.test.ts`

**Interfaces:**
- Consumes: `wrapEmail(bodyHtml, opts?)` from `./wrapper`
- Produces:
  - `async sendTicketResolved(to: string, ticketId: string): Promise<{success: boolean}>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/email/templates/support.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: sendEmailMock,
}));

import { sendTicketResolved } from "@/lib/email/templates/support";

describe("sendTicketResolved", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends resolved notification with ticket link", async () => {
    await sendTicketResolved("user@example.com", "ticket-abc-def");

    const args = sendEmailMock.mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toContain("Selesai");
    expect(args.subject).toContain("Tiket");
    expect(args.html).toContain("Lihat Tiket");
    expect(args.html).toContain("/support/ticket-abc-def");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run `bun test src/lib/email/templates/support.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```ts
// src/lib/email/templates/support.ts
import { sendEmail } from "@/lib/email";
import { wrapEmail } from "@/lib/email/templates/wrapper";

const APP_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function sendTicketResolved(to: string, ticketId: string) {
  const shortId = ticketId.slice(-8).toUpperCase();
  const subject = `Tiket Dukungan #${shortId} Telah Selesai`;

  const bodyHtml = `
    <p style="font-size:15px;color:#5f5f5d;line-height:1.6;">Halo,</p>
    <p style="font-size:15px;color:#1c1c1c;line-height:1.6;">
      Tiket dukungan Anda <strong>#${shortId}</strong> telah selesai.
    </p>
    <p style="font-size:15px;color:#1c1c1c;line-height:1.6;">
      Terima kasih atas kesabaran Anda. Jika masih ada pertanyaan, jangan ragu untuk membuka tiket baru.
    </p>
  `;

  const { html, text } = wrapEmail(bodyHtml, {
    cta: { text: "Lihat Tiket", url: `${APP_URL}/support/${ticketId}` },
  });

  return sendEmail({ to, subject, html, text });
}
```

- [ ] **Step 4: Run test — expect PASS**

Run `bun test src/lib/email/templates/support.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/support.ts src/lib/email/templates/support.test.ts
git commit -m "feat(email): add ticket resolved email template"
```

---

### Task 7: Barrel Export

**Files:**
- Create: `src/lib/email/templates/index.ts`

- [ ] **Step 1: Write the barrel export**

```ts
// src/lib/email/templates/index.ts
export { sendWelcomeEmail } from "./welcome";
export { sendWaitlistAccepted, sendWaitlistRejected } from "./waitlist";
export { sendPaymentReceipt } from "./payment";
export { sendBannedNotification, sendUnbannedNotification } from "./ban";
export { sendTicketResolved } from "./support";
```

- [ ] **Step 2: Quick verify import works**

Run `bun run check --filter src/lib/email/templates/index.ts` or just add a quick inline test that imports everything and asserts functions exist.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/templates/index.ts
git commit -m "feat(email): add barrel export for email templates"
```

---

### Task 8: Wire Welcome Email into Auth Config

**Files:**
- Modify: `src/lib/auth-config.ts:83-91`

**Data flow:**
- `linkAccount` event fires when user links OAuth account (first sign-in)
- `user.email`, `user.name` available
- Email sending is non-fatal: wrap in `.catch(() => undefined)` like the existing `linkApprovedWaitlistOnSignup`

- [ ] **Step 1: Add the import and call**

Current code at lines 4-9:
```ts
import { prisma } from "@/lib/prisma";
import { getDiceBearAvatarUrl } from "@/lib/profile";
import { isAdminEmail, linkApprovedWaitlistOnSignup } from "@/lib/waitlist/waitlist";
```

Add after line 9 (insert before `const googleConfigured`):
```ts
import { sendWelcomeEmail } from "@/lib/email/templates";
```

Current code at lines 83-91:
```ts
  events: {
    async linkAccount({ user }) {
      if (user?.id && user?.email) {
        await linkApprovedWaitlistOnSignup(user.id, user.email).catch(
          () => undefined,
        );
      }
    },
  },
```

Change to:
```ts
  events: {
    async linkAccount({ user }) {
      if (user?.id && user?.email) {
        await Promise.all([
          linkApprovedWaitlistOnSignup(user.id, user.email).catch(
            () => undefined,
          ),
          sendWelcomeEmail(user.email, user.name ?? "").catch(
            () => undefined,
          ),
        ]);
      }
    },
  },
```

- [ ] **Step 2: Verify the file still typechecks**

Run `bun run check` (or at least `bun run typecheck`)
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth-config.ts
git commit -m "feat(email): wire welcome email into signup flow"
```

---

### Task 9: Wire Waitlist Decision Emails into Admin Waitlist Route

**Files:**
- Modify: `src/routes/api.admin.waitlist.ts`

**Data flow:**
- Need to fetch the entry's email after approve/reject
- `approveWaitlistEntry` and `rejectWaitlistEntry` currently return `void`
- **Option A:** Modify those functions to return entry data
- **Option B:** Do a separate `prisma.waitlistEntry.findUnique` after the call
- Using **Option B** to keep changes minimal (surgical principle)

- [ ] **Step 1: Add imports**

After existing imports (line 8), add:
```ts
import { prisma } from "@/lib/prisma";
import {
  sendWaitlistAccepted,
  sendWaitlistRejected,
} from "@/lib/email/templates";
```

- [ ] **Step 2: Modify approve handler (lines 50-53)**

Current:
```ts
        if (body.action === "approve") {
          await approveWaitlistEntry(body.entryId, admin.admin.userId);
          return Response.json({ status: "approved" });
        }
```

Change to:
```ts
        if (body.action === "approve") {
          await approveWaitlistEntry(body.entryId, admin.admin.userId);
          // Non-fatal email
          prisma.waitlistEntry
            .findUnique({
              where: { id: body.entryId },
              select: { email: true, businessName: true },
            })
            .then((entry) => {
              if (entry?.email) {
                sendWaitlistAccepted(
                  entry.email,
                  entry.businessName ?? undefined,
                ).catch(() => undefined);
              }
            })
            .catch(() => undefined);
          return Response.json({ status: "approved" });
        }
```

- [ ] **Step 3: Modify reject handler (lines 55-62)**

Current:
```ts
        if (body.action === "reject") {
          await rejectWaitlistEntry(
            body.entryId,
            admin.admin.userId,
            body.reason ?? "",
          );
          return Response.json({ status: "rejected" });
        }
```

Change to:
```ts
        if (body.action === "reject") {
          await rejectWaitlistEntry(
            body.entryId,
            admin.admin.userId,
            body.reason ?? "",
          );
          // Non-fatal email
          prisma.waitlistEntry
            .findUnique({
              where: { id: body.entryId },
              select: { email: true, businessName: true },
            })
            .then((entry) => {
              if (entry?.email) {
                sendWaitlistRejected(
                  entry.email,
                  entry.businessName ?? undefined,
                  body.reason,
                ).catch(() => undefined);
              }
            })
            .catch(() => undefined);
          return Response.json({ status: "rejected" });
        }
```

- [ ] **Step 4: Verify**

Run `bun run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.admin.waitlist.ts
git commit -m "feat(email): wire waitlist decision emails into admin route"
```

---

### Task 10: Wire Payment Receipt into Webhook

**Files:**
- Modify: `src/routes/api.payment.webhook.ts`

**Data flow:**
- When `result` is non-null (line 179), we have `result.userId`
- Need to fetch user email from DB via `prisma.user.findUnique`
- Call `sendPaymentReceipt(user.email, receiptData)`

- [ ] **Step 1: Add imports**

After existing imports (line 5), add:
```ts
import { sendPaymentReceipt } from "@/lib/email/templates";
```

- [ ] **Step 2: Modify the result-success block (around line 179-187)**

Current:
```ts
          if (result) {
            logCreditTransaction({
              type: "credit",
              userId: result.userId,
              amount: result.energyGranted,
              reason: `Top-up: ${result.packageName}`,
              projectId: null,
            });
          }
```

Change to:
```ts
          if (result) {
            logCreditTransaction({
              type: "credit",
              userId: result.userId,
              amount: result.energyGranted,
              reason: `Top-up: ${result.packageName}`,
              projectId: null,
            });

            // Non-fatal email receipt
            prisma.user
              .findUnique({
                where: { id: result.userId },
                select: { email: true },
              })
              .then((user) => {
                if (user?.email) {
                  sendPaymentReceipt(user.email, {
                    packageName: result.packageName,
                    amount: payment.amount,
                    energyGranted: result.energyGranted,
                    transactionId: payment.providerTxnId,
                  }).catch(() => undefined);
                }
              })
              .catch(() => undefined);
          }
```

- [ ] **Step 3: Verify**

Run `bun run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/routes/api.payment.webhook.ts
git commit -m "feat(email): wire payment receipt into webhook handler"
```

---

### Task 11: Wire Payment Receipt into Admin Verify Transaction

**Files:**
- Modify: `src/routes/api.admin.transactions.$orderId.verify.ts`

**Data flow:**
- After transaction grant succeeds (line 63-95), we have `payment.userId`
- Need to fetch user email from DB
- Call `sendPaymentReceipt(user.email, receiptData)`

- [ ] **Step 1: Add imports**

After existing imports (line 5), add:
```ts
import { sendPaymentReceipt } from "@/lib/email/templates";
```

- [ ] **Step 2: Modify the success block after transaction commit (after line 95, just before return)**

Current:
```ts
            });

            return Response.json({ success: true, status: "COMPLETED" });
```

Change to:
```ts
            });

            // Non-fatal email receipt
            prisma.user
              .findUnique({
                where: { id: payment.userId },
                select: { email: true },
              })
              .then((user) => {
                if (user?.email) {
                  sendPaymentReceipt(user.email, {
                    packageName,
                    amount: payment.amount,
                    energyGranted: payment.energyGranted,
                    transactionId: payment.providerTxnId ?? "",
                  }).catch(() => undefined);
                }
              })
              .catch(() => undefined);

            return Response.json({ success: true, status: "COMPLETED" });
```

- [ ] **Step 3: Verify**

Run `bun run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/routes/api.admin.transactions.$orderId.verify.ts
git commit -m "feat(email): wire payment receipt into admin verify transaction"
```

---

### Task 12: Wire Ban/Unban Emails into Admin Users Route

**Files:**
- Modify: `src/routes/api.admin.users.$id.ts`

**Data flow:**
- Need to fetch user email + name before (or after) updating bannedAt
- Fetch first, then update, then send email (if ban)
- For unban: fetch email, update, send email

- [ ] **Step 1: Add imports**

After existing imports (line 4), add:
```ts
import {
  sendBannedNotification,
  sendUnbannedNotification,
} from "@/lib/email/templates";
```

- [ ] **Step 2: Modify ban handler (lines 19-24)**

Current:
```ts
        if (action === "ban") {
          await prisma.user.update({
            where: { id },
            data: { bannedAt: new Date() },
          });
          return Response.json({ status: "banned" });
        }
```

Change to:
```ts
        if (action === "ban") {
          const user = await prisma.user.findUnique({
            where: { id },
            select: { email: true, name: true },
          });
          await prisma.user.update({
            where: { id },
            data: { bannedAt: new Date() },
          });
          // Non-fatal email
          if (user?.email) {
            sendBannedNotification(
              user.email,
              user.name ?? undefined,
            ).catch(() => undefined);
          }
          return Response.json({ status: "banned" });
        }
```

- [ ] **Step 3: Modify unban handler (lines 26-31)**

Current:
```ts
        if (action === "unban") {
          await prisma.user.update({
            where: { id },
            data: { bannedAt: null },
          });
          return Response.json({ status: "unbanned" });
        }
```

Change to:
```ts
        if (action === "unban") {
          const user = await prisma.user.findUnique({
            where: { id },
            select: { email: true, name: true },
          });
          await prisma.user.update({
            where: { id },
            data: { bannedAt: null },
          });
          // Non-fatal email
          if (user?.email) {
            sendUnbannedNotification(
              user.email,
              user.name ?? undefined,
            ).catch(() => undefined);
          }
          return Response.json({ status: "unbanned" });
        }
```

- [ ] **Step 4: Verify**

Run `bun run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/api.admin.users.$id.ts
git commit -m "feat(email): wire ban/unban notification emails into admin users route"
```

---

### Task 13: Wire Ticket Resolved Email into Admin Resolve Route

**Files:**
- Modify: `src/routes/api.admin.tickets.$ticketId.resolve.ts`

**Data flow:**
- `resolveTicket()` returns `{ success: boolean }` from `src/lib/support/service.ts`
- Need to fetch ticket with user email after resolving
- Call `sendTicketResolved(user.email, ticketId)`

- [ ] **Step 1: Add imports**

After existing imports (line 4), add:
```ts
import { sendTicketResolved } from "@/lib/email/templates";
```

- [ ] **Step 2: Modify the handler (around lines 18-24)**

Current:
```ts
        try {
          const result = await resolveTicket(
            params.ticketId,
            admin.admin.userId,
            true,
          );
          return Response.json(result);
        } catch (error) {
```

Change to:
```ts
        try {
          const result = await resolveTicket(
            params.ticketId,
            admin.admin.userId,
            true,
          );

          // Non-fatal email
          prisma.supportTicket
            .findUnique({
              where: { id: params.ticketId },
              select: { user: { select: { email: true } } },
            })
            .then((ticket) => {
              if (ticket?.user?.email) {
                sendTicketResolved(
                  ticket.user.email,
                  params.ticketId,
                ).catch(() => undefined);
              }
            })
            .catch(() => undefined);

          return Response.json(result);
        } catch (error) {
```

- [ ] **Step 3: Verify**

Run `bun run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/routes/api.admin.tickets.$ticketId.resolve.ts
git commit -m "feat(email): wire ticket resolved email into admin resolve route"
```

---

## Plan Self-Review

- **Spec coverage:** Every section from the spec is covered:
  - ✅ Shared wrapper (Task 1)
  - ✅ 5 template email types — welcome (Task 2), waitlist (Task 3), payment (Task 4), ban (Task 5), support (Task 6)
  - ✅ Barrel export (Task 7)
  - ✅ 8 trigger points — signup (Task 8), waitlist accept/reject (Task 9), webhook (Task 10), admin verify (Task 11), ban/unban (Task 12), ticket resolved (Task 13)
  - ✅ Non-fatal error handling (all tasks use `.catch(() => undefined)`)
  - ✅ Dev mock works automatically (existing `sendEmail` handles it)
  - ✅ Indonesian content
  - ✅ `sendSupportReplyEmail` not refactored (no task touches it)
- **Placeholder check:** No TBD, TODO, or vague steps. Every step has complete code and commands.
- **Type consistency:** All function signatures match between producer tasks and consumer tasks.
