import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendEmail } from "@/lib/email";

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

describe("sendEmail", () => {
  it("mock mode: no key + dev -> logs + success, no fetch", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.NODE_ENV = "development";
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await sendEmail({ subject: "hi", text: "body", to: "u@x.com" });
    expect(r.success).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("real mode: key set -> POST api.resend.com/emails with Authorization + from", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "no-reply@app.test";
    process.env.NODE_ENV = "production";
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await sendEmail({ html: "<p/>", subject: "s", to: "u@x.com" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    const body = JSON.parse(init.body);
    expect(body.from).toBe("no-reply@app.test");
    expect(body.to).toBe("u@x.com");
  });

  it("prod + no key -> throws (mock-impossible-in-prod)", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.NODE_ENV = "production";
    await expect(
      sendEmail({ subject: "s", text: "t", to: "u@x.com" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("respects RESEND_BASE_URL override", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "n@x.test";
    process.env.RESEND_BASE_URL = "https://relay.test";
    process.env.NODE_ENV = "production";
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await sendEmail({ subject: "s", text: "t", to: "u@x.com" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://relay.test/emails");
  });
});
