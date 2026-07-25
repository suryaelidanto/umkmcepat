/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS subprocess entrypoint. */
const { chromium } = require("playwright-core");

const [url, executablePath = "", timeoutRaw = "15000"] = process.argv.slice(2);
const timeout = Number(timeoutRaw);

if (!url || !Number.isInteger(timeout) || timeout < 1) {
  process.stderr.write(
    "Usage: capture-runtime-errors.cjs <url> [browser-path] [timeout-ms]\n",
  );
  process.exit(2);
}

let browser;

(async () => {
  browser = await chromium.launch({
    args: ["--disable-gpu", "--no-default-browser-check", "--no-first-run"],
    executablePath: executablePath || undefined,
    headless: true,
    timeout,
  });
  const context = await browser.newContext({
    colorScheme: "light",
    locale: "id-ID",
    viewport: { height: 900, width: 1440 },
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(timeout);
  page.setDefaultTimeout(timeout);

  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    errors.push(err.message);
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  // Output the errors as JSON lines on stdout.
  process.stdout.write(JSON.stringify(errors));
})()
  .catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) {
      await browser.close();
    }
  });
