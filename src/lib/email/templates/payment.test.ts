// src/lib/email/templates/payment.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { sendEmail } from "@/lib/email";
import { sendPaymentReceipt } from "@/lib/email/templates/payment";

const mockSendEmail = sendEmail as ReturnType<typeof vi.fn>;

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

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const args = mockSendEmail.mock.calls[0][0];
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

    const html = mockSendEmail.mock.calls[0][0].html;
    expect(html).toContain("Rp1.500.000");
  });
});
