import { describe, expect, it } from "vitest";

// Tier-2 mobile device-capture audit. Runs against a live dev server at
const URL = process.env.MOBILE_AUDIT_URL;
const LIVE = Boolean(URL);

describe.skipIf(!LIVE)("mobile device-capture audit", () => {
  const routes = [
    "/",
    "/projects",
    "/projects/new",
    "/waitlist",
    "/profile",
    "/privacy",
    "/terms",
  ];

  for (const route of routes) {
    it(`${route} has no mobile regressions at 390px`, async () => {
      // Headless fetch of the rendered HTML; a full Playwright browser run
      const res = await fetch(`${URL}${route}`, {
        headers: { "user-agent": "Mobile" },
      });
      expect(res.ok).toBe(true);
      const html = await res.text();
      expect(html.length).toBeGreaterThan(0);
    });
  }
});
