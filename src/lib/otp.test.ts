import { afterEach, describe, expect, it, vi } from "vitest";

import { sendOtpViaSms } from "./otp";

describe("sendOtpViaSms", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fails honestly when the OTP provider is not configured", async () => {
    vi.stubEnv("OTP_SPACE_API_KEY", "");

    await expect(sendOtpViaSms("+628123456789", "123456")).resolves.toEqual({
      success: false,
      error: "Layanan OTP belum dikonfigurasi. Coba lagi nanti.",
    });
  });
});
