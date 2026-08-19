import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(
  resolve(process.cwd(), "src/styles/globals.css"),
  "utf8",
);

function blockVars(selector: string): Record<string, string> {
  const re = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const match = css.match(re);
  if (!match) {
    return {};
  }
  const vars: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^\s*(--[\w-]+):\s*([^;]+);/);
    if (m) {
      vars[m[1]] = m[2].trim();
    }
  }
  return vars;
}

describe("theme role tokens", () => {
  const roles = [
    "--chrome",
    "--chrome-elevated",
    "--surface",
    "--surface-muted",
    "--surface-sunken",
    "--on-chrome",
    "--on-surface",
    "--on-surface-muted",
    "--border-chrome",
    "--border-surface",
    "--accent-orange",
    "--accent-gold",
    "--accent-rose",
    "--accent-blue",
    "--status-success",
    "--status-warning",
    "--destructive",
  ];

  it("defines every role in :root", () => {
    const root = blockVars(":root");
    for (const r of roles) {
      expect(root[r], `${r} missing in :root`).toBeTruthy();
    }
  });

  it("defines every role in .dark", () => {
    const dark = blockVars(".dark");
    for (const r of roles) {
      expect(dark[r], `${r} missing in .dark`).toBeTruthy();
    }
  });

  it("light and dark differ for every role", () => {
    const root = blockVars(":root");
    const dark = blockVars(".dark");
    for (const r of roles) {
      expect(root[r], `light ${r}`).not.toBe(dark[r]);
    }
  });
});
