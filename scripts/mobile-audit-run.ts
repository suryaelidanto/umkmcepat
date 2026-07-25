/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
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

const MIN_TOUCH_PX = 44;
const MIN_INPUT_FONT_PX = 16;

type Finding = { route: string; kind: string; detail: string };

async function auditRoute(page: any, route: string): Promise<Finding[]> {
  const url = `${BASE}${route}`;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
  } catch {
    return [{ route, kind: "load", detail: "page did not load" }];
  }

  const findings: Finding[] = await page.evaluate(
    ({ MIN_TOUCH_PX, MIN_INPUT_FONT_PX, route }) => {
      const out: Array<{ route: string; kind: string; detail: string }> = [];

      // Touch targets
      const interactive = Array.from(
        document.querySelectorAll("a, button, [role='button']"),
      );
      for (const el of interactive) {
        const rect = el.getBoundingClientRect();
        const size = Math.min(rect.width, rect.height);
        if (size > 0 && size < MIN_TOUCH_PX) {
          out.push({
            detail: `<${el.tagName.toLowerCase()}> ${size}px`,
            kind: "touch",
            route,
          });
        }
      }

      // Input fonts
      const inputs = Array.from(
        document.querySelectorAll("input, textarea, select"),
      );
      for (const el of inputs) {
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (Number.isFinite(px) && px < MIN_INPUT_FONT_PX) {
          out.push({
            detail: `<${el.tagName.toLowerCase()}> ${px}px`,
            kind: "input-font",
            route,
          });
        }
      }

      // Horizontal overflow at 390px (iPhone 12 width)
      const overflow = document.documentElement.scrollWidth > window.innerWidth;
      if (overflow) {
        out.push({
          detail: `scrollWidth ${document.documentElement.scrollWidth} > ${window.innerWidth}`,
          kind: "overflow",
          route,
        });
      }

      return out;
    },
    { MIN_INPUT_FONT_PX, MIN_TOUCH_PX, route },
  );

  return findings;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { height: 844, width: 390 }, // iPhone 12
    isMobile: true,
  });
  const page = await context.newPage();

  const all: Finding[] = [];
  for (const route of ROUTES) {
    const findings = await auditRoute(page, route);
    all.push(...findings);
    console.log(`${route}: ${findings.length} finding(s)`);
    for (const f of findings) {
      console.log(`  ${f.kind}: ${f.detail}`);
    }
  }

  await browser.close();

  if (all.length) {
    console.log(`\nTOTAL: ${all.length} mobile regression(s) found.`);
    process.exit(1);
  }
  console.log(
    "\nAll routes pass the tier-1 mobile audit at iPhone 12 (390px).",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
