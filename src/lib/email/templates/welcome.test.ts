// src/lib/email/templates/welcome.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { sendEmail } from "@/lib/email";
import { sendWelcomeEmail } from "@/lib/email/templates/welcome";

const mockSendEmail = sendEmail as ReturnType<typeof vi.fn>;

describe("sendWelcomeEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends welcome email with correct subject and name", async () => {
    await sendWelcomeEmail("user@example.com", "Budi");

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const args = mockSendEmail.mock.calls[0][0];
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toContain("Selamat Datang");
    expect(args.subject).toContain("Budi");
  });

  it("contains CTA to start building", async () => {
    await sendWelcomeEmail("user@example.com", "Budi");
    const html = mockSendEmail.mock.calls[0][0].html;
    expect(html).toContain("Mulai Bangun Website");
  });

  it("handles missing name gracefully", async () => {
    await sendWelcomeEmail("user@example.com", "");
    const args = mockSendEmail.mock.calls[0][0];
    expect(args.subject).toContain("Selamat Datang");
  });
});
