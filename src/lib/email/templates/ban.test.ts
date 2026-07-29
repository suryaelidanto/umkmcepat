// src/lib/email/templates/ban.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { sendEmail } from "@/lib/email";
import {
  sendBannedNotification,
  sendUnbannedNotification,
} from "@/lib/email/templates/ban";

const mockSendEmail = sendEmail as ReturnType<typeof vi.fn>;

describe("sendBannedNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends ban notification with contact info, no CTA", async () => {
    await sendBannedNotification("user@example.com", "Budi");

    const args = mockSendEmail.mock.calls[0][0];
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

    const args = mockSendEmail.mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toContain("Aktif Kembali");
    expect(args.html).toContain("Masuk ke UMKM Cepat");
  });
});
