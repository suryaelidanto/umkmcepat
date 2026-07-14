/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS subprocess entrypoint. */
const { chromium } = require("playwright-core");

const [url, executablePath = "", timeoutRaw = "15000"] = process.argv.slice(2);
const timeout = Number(timeoutRaw);

if (!url || !Number.isInteger(timeout) || timeout < 1) {
  process.stderr.write(
    "Usage: capture-project-thumbnail.cjs <url> [browser-path] [timeout-ms]\n",
  );
  process.exit(2);
}

let browser;
let context;

(async () => {
  browser = await chromium.launch({
    args: ["--disable-gpu", "--no-default-browser-check", "--no-first-run"],
    executablePath: executablePath || undefined,
    headless: true,
    timeout,
  });
  context = await browser.newContext({
    colorScheme: "light",
    locale: "id-ID",
    reducedMotion: "reduce",
    timezoneId: "Asia/Jakarta",
    viewport: { height: 900, width: 1440 },
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(timeout);
  page.setDefaultTimeout(timeout);
  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    const sourceUrl = new URL(url);
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
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(() =>
    Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]),
  );
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
  });
  await page.waitForTimeout(350);
  const bytes = await page.screenshot({
    fullPage: false,
    quality: 80,
    type: "jpeg",
  });
  process.stdout.write(bytes);
})()
  .catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  });
