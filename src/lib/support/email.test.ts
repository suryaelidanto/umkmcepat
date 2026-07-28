import { describe, expect, it, vi, beforeEach } from "vitest";

const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: sendEmailMock,
}));

import { sendSupportReplyEmail } from "@/lib/support/email";

describe("sendSupportReplyEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends email with correct subject, body, and short ticket id", async () => {
    const ticketId = "cuid12345678";
    const toEmail = "user@example.com";
    const subject = "Masalah Pembayaran";
    const replyBody = "Halo, pembayaran sudah kami verifikasi.";

    await sendSupportReplyEmail({
      toEmail,
      ticketId,
      subject,
      replyBody,
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const args = sendEmailMock.mock.calls[0][0];
    expect(args.to).toBe(toEmail);
    expect(args.subject).toContain("Balasan Tiket #12345678");
    expect(args.subject).toContain("Masalah Pembayaran");
    expect(args.html).toContain("pembayaran sudah kami verifikasi.");
    expect(args.text).toContain("pembayaran sudah kami verifikasi.");
  });
});
