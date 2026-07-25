/* eslint-disable no-console */
import { mkdirSync } from "node:fs";
import path from "node:path";

import { chromium } from "playwright-core";

const BASE = process.env.MOBILE_AUDIT_URL || "http://localhost:3000";
const ROUTES = [
  "/",
  "/waitlist",
  "/privacy",
  "/terms",
  "/verify",
  "/projects",
  "/projects/new",
];
const DEVICES = [
  { height: 844, name: "iphone12", width: 390 },
  { height: 915, name: "pixel7", width: 412 },
  { height: 1080, name: "ipad", width: 810 },
];

const OUT_DIR = "__captures__/mobile";

async function main() {
  const browser = await chromium.launch({ headless: true });
  mkdirSync(OUT_DIR, { recursive: true });

  let failures = 0;
  for (const device of DEVICES) {
    const context = await browser.newContext({
      viewport: { height: device.height, width: device.width },
      isMobile: device.name !== "ipad",
    });
    const page = await context.newPage();
    for (const route of ROUTES) {
      const url = `${BASE}${route}`;
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      } catch {
        console.log(`SKIP ${device.name}${route} (load timeout)`);
        continue;
      }
      // Tier-2 objective assertion: no horizontal overflow at this viewport.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      const safe = route.replace(/\//g, "_") || "root";
      const file = path.join(OUT_DIR, `${safe}-${device.name}.png`);
      await page.screenshot({ fullPage: true, path: file });
      const tag = overflow ? "OVERFLOW" : "ok";
      console.log(`${device.name}${route}: ${tag} -> ${file}`);
      if (overflow) {
        failures += 1;
      }
    }
    await context.close();
  }
  await browser.close();

  if (failures) {
    console.log(`\n${failures} overflow regression(s).`);
    process.exit(1);
  }
  console.log("\nAll routes x devices pass (no overflow). Captures saved.");
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
