// src/lib/email/templates/support.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { sendEmail } from "@/lib/email";
import { sendTicketResolved } from "@/lib/email/templates/support";

const mockSendEmail = sendEmail as ReturnType<typeof vi.fn>;

describe("sendTicketResolved", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends resolved notification with ticket link", async () => {
    await sendTicketResolved("user@example.com", "ticket-abc-def");

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const args = mockSendEmail.mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toContain("Selesai");
    expect(args.subject).toContain("Tiket");
    expect(args.html).toContain("Lihat Tiket");
    expect(args.html).toContain("/support/ticket-abc-def");
  });
});
