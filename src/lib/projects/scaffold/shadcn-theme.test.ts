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
    expect(mutedText).toBeDefined();
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

    expect(muted).toBeDefined();
    expect(mutedForeground).toBeDefined();
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
});
