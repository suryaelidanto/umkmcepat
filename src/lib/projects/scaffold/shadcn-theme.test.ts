import { describe, expect, it } from "vitest";

import {
  compileShadcnTheme,
  contrastRatio,
  shadcnThemeCss,
} from "./shadcn-theme";

import type { ProjectSiteSchema } from "../site-schema";

function schema(theme: ProjectSiteSchema["theme"]): ProjectSiteSchema {
  return {
    version: 1,
    businessName: "SuryaPhone",
    eyebrow: "SuryaPhone",
    headline: "Pilih iPhone dengan kondisi jelas",
    subheadline: "Bandingkan unit sebelum menghubungi penjual.",
    primaryCta: "Chat WhatsApp",
    secondaryCta: "Lihat katalog",
    audience: "Pembeli iPhone bekas",
    offer: "iPhone bekas dengan kondisi tercatat",
    theme,
    trustPoints: [],
    sections: [],
  };
}

describe("contrastRatio", () => {
  it("matches fixed WCAG vectors", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
  });
});

describe("compileShadcnTheme", () => {
  it("derives readable muted text for a dark SuryaPhone theme", () => {
    const result = compileShadcnTheme(
      schema({
        background: "#0D0D0D",
        foreground: "#F0EDE5",
        muted: "#1C1C1C",
        accent: "#C9A84C",
      }),
    );
    const mutedText = /--muted-foreground:\s*(#[0-9a-f]{6})/i.exec(
      result.css,
    )?.[1];
    expect(mutedText).toMatch(/^#[0-9a-f]{6}$/i);
    expect(mutedText?.toLowerCase()).not.toBe("#1c1c1c");
    expect(contrastRatio(mutedText!, "#0D0D0D")).toBeGreaterThanOrEqual(4.5);
    expect(result.checks.every((check) => check.pass)).toBe(true);
  });

  it("keeps muted surfaces readable for body text", () => {
    const result = compileShadcnTheme(
      schema({
        background: "#f7f3ec",
        foreground: "#3d2b1f",
        muted: "#6b706d",
        accent: "#d4a017",
      }),
    );
    const muted = /--muted:\s*(#[0-9a-f]{6})/i.exec(result.css)?.[1];
    const mutedForeground = /--muted-foreground:\s*(#[0-9a-f]{6})/i.exec(
      result.css,
    )?.[1];

    expect(muted).toMatch(/^#[0-9a-f]{6}$/i);
    expect(mutedForeground).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrastRatio("#3d2b1f", muted!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(mutedForeground!, muted!)).toBeGreaterThanOrEqual(4.5);
    expect(
      result.checks.some(
        (check) => check.role === "muted-foreground" && check.pass,
      ),
    ).toBe(true);
  });

  it("keeps the compatibility CSS entry point deterministic", () => {
    const value = schema({
      background: "#f7f7f7",
      foreground: "#171717",
      muted: "#e5e5e5",
      accent: "#b45309",
    });
    expect(shadcnThemeCss(value)).toBe(compileShadcnTheme(value).css);
  });

  it("rejects invalid palette values", () => {
    expect(() =>
      compileShadcnTheme(
        schema({
          background: "black",
          foreground: "#ffffff",
          muted: "#222222",
          accent: "#f59e0b",
        }),
      ),
    ).toThrow("invalid generated theme color");
  });
  it("darkens an accent that admits neither black nor white text", () => {
    const result = compileShadcnTheme(
      schema({
        background: "#ffffff",
        foreground: "#161616",
        muted: "#eeeeee",
        accent: "#0077dd",
      }),
    );
    const accent = /--accent:\s*(#[0-9a-f]{6})/i.exec(result.css)?.[1];
    const primary = /--primary:\s*(#[0-9a-f]{6})/i.exec(result.css)?.[1];
    expect(accent).toMatch(/^#[0-9a-f]{6}$/i);
    expect(accent?.toLowerCase()).not.toBe("#0077dd");
    expect(primary?.toLowerCase()).toBe(accent?.toLowerCase());
    expect(result.checks.every((check) => check.pass)).toBe(true);
    for (const role of ["primary-foreground", "accent-foreground"]) {
      const check = result.checks.find((entry) => entry.role === role);
      expect(check?.ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("resolves a background that admits neither black nor white text", () => {
    const result = compileShadcnTheme(
      schema({
        background: "#008866",
        foreground: "#0b3b2e",
        muted: "#0a3428",
        accent: "#f5c451",
      }),
    );
    const background = /--background:\s*(#[0-9a-f]{6})/i.exec(result.css)?.[1];
    expect(background?.toLowerCase()).not.toBe("#008866");
    expect(result.checks.every((check) => check.pass)).toBe(true);
  });

  it("leaves a readable accent untouched and stays deterministic", () => {
    const build = () =>
      compileShadcnTheme(
        schema({
          background: "#fff9f2",
          foreground: "#2a211c",
          muted: "#6f6259",
          accent: "#c2410c",
        }),
      );
    const first = build();
    expect(
      /--accent:\s*(#[0-9a-f]{6})/i.exec(first.css)?.[1]?.toLowerCase(),
    ).toBe("#c2410c");
    expect(build().css).toBe(first.css);
  });

  // Reproduced live: a real build's writer used text-accent for an eyebrow
  it("keeps accent readable as bare text against the page background", () => {
    const result = compileShadcnTheme(
      schema({
        background: "#f7f3ec",
        foreground: "#3d2b1f",
        muted: "#e5ddd2",
        accent: "#d4a017",
      }),
    );
    const accent = /--accent:\s*(#[0-9a-f]{6})/i.exec(result.css)?.[1];
    const background = /--background:\s*(#[0-9a-f]{6})/i.exec(result.css)?.[1];
    expect(accent).toMatch(/^#[0-9a-f]{6}$/i);
    expect(background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrastRatio(accent!, background!)).toBeGreaterThanOrEqual(4.5);
    expect(result.checks.every((check) => check.pass)).toBe(true);
  });
});
