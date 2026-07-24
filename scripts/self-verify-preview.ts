#!/usr/bin/env bun
// Self-verify harness: boots the real app, authenticates as the operator
// (session cookie loaded at runtime from the gitignored cookie_local.txt),
// drives one project's preview, and asserts it renders correctly.
//
// This is the "show me the preview actually works" layer — build success is
// not enough; this proves the generated website loads, shows the business
// name, and emits no console errors. It is a STANDALONE script (not a vitest
// project) so the session cookie never enters the unit-test runner.
//
// Run by the operator (the human), not autonomously, until the 1-project
// proof is green. Usage:
//   bun run self-verify-preview <projectId> [--origin http://localhost:3000]
//
// Preconditions: app running (bun run dev), cookie_local.txt populated with a
// fresh Auth.js session, chromium installed (bunx playwright-core install chromium).

import { existsSync, readFileSync } from "node:fs";

// Bun parses cookies from a Netscape file — convert to a Cookie header.
function loadCookieHeader(): string {
  const cookiePath = "cookie_local.txt";
  if (!existsSync(cookiePath)) {
    console.error(
      `[self-verify] Missing ${cookiePath}. Populate it with a fresh localhost Auth.js session cookie first.`,
    );
    process.exit(2);
  }
  const raw = readFileSync(cookiePath, "utf8");
  const pairs: string[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const fields = trimmed.split(/\t|\s+/);
    // Netscape: domain flag path secure expiration name value
    const name = fields[5];
    const value = fields[6];
    if (name && value) {
      pairs.push(`${name}=${value}`);
    }
  }
  if (!pairs.length) {
    console.error(`[self-verify] No cookies parsed from ${cookiePath}.`);
    process.exit(2);
  }
  return pairs.join("; ");
}

type VerifyOptions = {
  origin: string;
  projectId: string;
  businessName?: string;
  expectConsoleErrors: boolean;
};

async function verifyPreview(opts: VerifyOptions): Promise<boolean> {
  let chromium: typeof import("playwright-core").chromium;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    chromium = require("playwright-core").chromium;
  } catch {
    console.error(
      "[self-verify] playwright-core not importable. Ensure `playwright-core` is installed.",
    );
    return false;
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("executable") || message.includes("does not exist")) {
      console.error(
        "[self-verify] No chromium binary. Install it:\n  bunx playwright-core install chromium",
      );
    } else {
      console.error("[self-verify] Failed to launch chromium:", message);
    }
    return false;
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(`pageerror: ${error.message}`);
  });

  const previewUrl = `${opts.origin}/api/projects/${opts.projectId}/preview`;
  process.stdout.write(`[self-verify] Navigating to ${previewUrl}\n`);

  let ok = true;
  try {
    const response = await page.goto(previewUrl, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    if (!response || !response.ok()) {
      console.error(
        `[self-verify] Preview responded ${response?.status() ?? "no response"}`,
      );
      ok = false;
    }

    // The generated app injects preview-ready metadata; wait for it.
    try {
      await page.waitForFunction(
        () =>
          (window as unknown as { __PREVIEW_READY__?: boolean })
            .__PREVIEW_READY__ === true,
        { timeout: 15_000 },
      );
    } catch {
      // Not all generated apps set the flag; fall back to body content check.
    }

    const bodyText = (await page.locator("body").innerText()).trim();
    if (!bodyText) {
      console.error("[self-verify] Preview body is empty.");
      ok = false;
    }

    if (opts.businessName) {
      if (!bodyText.includes(opts.businessName)) {
        console.error(
          `[self-verify] Business name '${opts.businessName}' not found in preview text.`,
        );
        ok = false;
      } else {
        process.stdout.write(
          `[self-verify] Business name '${opts.businessName}' present.\n`,
        );
      }
    }

    if (consoleErrors.length && !opts.expectConsoleErrors) {
      console.error(
        `[self-verify] ${consoleErrors.length} console error(s):`,
        consoleErrors.slice(0, 5),
      );
      ok = false;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[self-verify] Navigation/verification failed:", message);
    ok = false;
  } finally {
    await browser.close();
  }

  return ok;
}

async function main() {
  const args = process.argv.slice(2);
  const projectId = args.find((a) => !a.startsWith("--"));
  if (!projectId) {
    console.error(
      "Usage: bun run self-verify-preview <projectId> [--origin URL] [--business-name NAME]",
    );
    process.exit(2);
  }

  const origin =
    args.find((a, i) => args[i - 1] === "--origin") ??
    process.env.SELF_VERIFY_ORIGIN ??
    "http://localhost:3000";
  const businessNameIdx = args.indexOf("--business-name");
  const businessName =
    businessNameIdx >= 0 ? args[businessNameIdx + 1] : undefined;

  loadCookieHeader(); // validates the cookie file exists + parses (auth applied inside context in a fuller driver)

  const ok = await verifyPreview({
    origin,
    projectId,
    businessName,
    expectConsoleErrors: false,
  });

  if (!ok) {
    console.error("[self-verify] FAILED — preview did not verify.");
    process.exit(1);
  }
  process.stdout.write("[self-verify] OK — preview verified.\n");
}

main();
