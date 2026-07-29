// src/lib/email/templates/waitlist.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { sendEmail } from "@/lib/email";
import {
  sendWaitlistAccepted,
  sendWaitlistRejected,
} from "@/lib/email/templates/waitlist";

const mockSendEmail = sendEmail as ReturnType<typeof vi.fn>;

describe("sendWaitlistAccepted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends accepted email with login CTA", async () => {
    await sendWaitlistAccepted("user@example.com", "Toko Budi");

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const args = mockSendEmail.mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toContain("Diterima");
    expect(args.html).toContain("Masuk ke UMKM Cepat");
  });

  it("works without business name", async () => {
    await sendWaitlistAccepted("user@example.com");
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("sendWaitlistRejected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends rejected email without CTA", async () => {
    await sendWaitlistRejected("user@example.com", "Toko Budi", "Kuota penuh");

    const args = mockSendEmail.mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toContain("Belum Bisa Diproses");
    expect(args.html).toContain("Kuota penuh");
    expect(args.html).toContain("hello@umkmcepat.com");
    // No CTA button for rejected
    expect(args.html).not.toContain("Masuk ke UMKM Cepat");
  });

  it("works without reason", async () => {
    await sendWaitlistRejected("user@example.com");
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});
