import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendOtpViaSms } from "./otp";

const originalEnv = { ...process.env };
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env = { ...originalEnv };
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendOtpViaSms", () => {
  it("mock mode: no key + dev -> logs + success, no fetch", async () => {
    delete process.env.OTP_SPACE_API_KEY;
    process.env.NODE_ENV = "development";
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await sendOtpViaSms("+628123", "123456");
    expect(r.success).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("real mode: POST /v1/send with {phone, app_name} + Bearer", async () => {
    process.env.OTP_SPACE_API_KEY = "sk_live_test";
    process.env.NODE_ENV = "production";
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await sendOtpViaSms("+628123", "123456");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.otpspace.com/v1/send");
    expect(init.headers.Authorization).toBe("Bearer sk_live_test");
    const body = JSON.parse(init.body);
    expect(body.phone).toBe("+628123");
    expect(body.app_name).toBe("UMKM Cepat");
  });

  it("prod + no key -> throws", async () => {
    delete process.env.OTP_SPACE_API_KEY;
    process.env.NODE_ENV = "production";
    await expect(sendOtpViaSms("+628123", "123456")).rejects.toThrow(
      /OTP_SPACE_API_KEY/,
    );
  });
});
