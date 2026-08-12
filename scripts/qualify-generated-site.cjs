/* eslint-disable @typescript-eslint/no-require-imports -- isolated CommonJS browser subprocess. */
const { chromium } = require("playwright-core");

const [
  origin,
  routesJson = '["/"]',
  executablePath = "",
  timeoutRaw = "10000",
] = process.argv.slice(2);
const timeout = Number(timeoutRaw);
const routes = JSON.parse(routesJson);
const viewports = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 1000 },
};

if (
  !origin ||
  !Array.isArray(routes) ||
  routes.length > 6 ||
  !Number.isInteger(timeout)
) {
  process.stderr.write("Invalid generated-site browser arguments.\n");
  process.exit(2);
}

(async () => {
  const browser = await chromium.launch({
    args: ["--disable-gpu", "--no-default-browser-check", "--no-first-run"],
    executablePath: executablePath || undefined,
    headless: true,
    timeout,
  });
  const reports = [];
  try {
    for (const [viewportName, viewport] of Object.entries(viewports)) {
      const context = await browser.newContext({
        colorScheme: "light",
        locale: "id-ID",
        reducedMotion: "reduce",
        timezoneId: "Asia/Jakarta",
        viewport,
      });
      try {
        for (const routePath of routes) {
          const errors = [];
          const page = await context.newPage();
          page.setDefaultNavigationTimeout(timeout);
          page.setDefaultTimeout(timeout);
          page.on("console", (message) => {
            if (message.type() === "error") {
              errors.push(message.text());
            }
          });
          page.on("pageerror", (error) => errors.push(error.message));
          await page.route("**/*", async (route) => {
            const requestUrl = new URL(route.request().url());
            const sourceUrl = new URL(origin);
            if (
              requestUrl.origin === sourceUrl.origin ||
              requestUrl.protocol === "data:" ||
              requestUrl.protocol === "blob:"
            ) {
              await route.continue();
            } else {
              await route.abort("blockedbyclient");
            }
          });
          const target = new URL(origin);
          target.hash = routePath === "/" ? "#/" : `#${routePath}`;
          let loaded = true;
          try {
            await page.goto(target.href, { waitUntil: "domcontentloaded" });
            await page.evaluate(() => document.fonts.ready);
          } catch (error) {
            loaded = false;
            errors.push(error instanceof Error ? error.message : String(error));
          }
          const metrics = loaded
            ? await page.evaluate(() => {
                const visible = (element) => {
                  const style = getComputedStyle(element);
                  const rect = element.getBoundingClientRect();
                  return (
                    style.display !== "none" &&
                    style.visibility !== "hidden" &&
                    rect.width > 0 &&
                    rect.height > 0
                  );
                };
                const headings = [...document.querySelectorAll("h1,h2,h3")];
                const images = [...document.images];
                const targets = [
                  ...document.querySelectorAll("a,button"),
                ].filter(visible);
                const firstTarget = targets[0];
                if (firstTarget instanceof HTMLElement) {
                  firstTarget.focus();
                }
                const focusStyle = firstTarget
                  ? getComputedStyle(firstTarget)
                  : null;
                return {
                  overflow:
                    document.documentElement.scrollWidth -
                    document.documentElement.clientWidth,
                  headingOverflow: headings.some(
                    (heading) => heading.scrollWidth > heading.clientWidth + 1,
                  ),
                  brokenImages: images.filter(
                    (image) => !image.complete || image.naturalWidth === 0,
                  ).length,
                  touchTargets: targets.filter((target) => {
                    const rect = target.getBoundingClientRect();
                    return rect.width < 44 || rect.height < 44;
                  }).length,
                  focusVisible:
                    !firstTarget ||
                    Boolean(
                      focusStyle &&
                      (focusStyle.outlineStyle !== "none" ||
                        focusStyle.boxShadow !== "none"),
                    ),
                };
              })
            : {
                overflow: 0,
                headingOverflow: false,
                brokenImages: 0,
                touchTargets: 0,
                focusVisible: false,
              };
          const assertions = [
            { name: "route-load", status: loaded ? "pass" : "fail" },
            {
              name: "console-clean",
              status: errors.length ? "fail" : "pass",
              detail: errors.slice(0, 3).join("; ") || undefined,
            },
            {
              name: "horizontal-overflow",
              status: metrics.overflow > 1 ? "fail" : "pass",
              detail: String(metrics.overflow),
            },
            {
              name: "heading-overflow",
              status: metrics.headingOverflow ? "fail" : "pass",
            },
            {
              name: "image-health",
              status: metrics.brokenImages ? "fail" : "pass",
              detail: String(metrics.brokenImages),
            },
            {
              name: "focus-visible",
              status: metrics.focusVisible ? "pass" : "fail",
            },
            {
              name: "touch-target",
              status: metrics.touchTargets ? "fail" : "pass",
              detail: String(metrics.touchTargets),
            },
          ];
          const screenshot = loaded
            ? (
                await page.screenshot({
                  fullPage: true,
                  quality: 70,
                  type: "jpeg",
                })
              ).toString("base64")
            : "";
          reports.push({
            route: routePath,
            viewport: viewportName,
            assertions,
            screenshot,
          });
          await page.close();
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(JSON.stringify({ routes: reports }));
})().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
