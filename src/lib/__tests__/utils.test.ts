import { describe, expect, it, vi } from "vitest";
import { generateRandomString, slugify } from "../utils";

describe("slugify", () => {
  it("normalizes Indonesian business names into URL-safe slugs", () => {
    expect(slugify(" UMKM Cepat! Jualan #1 ")).toBe("umkm-cepat-jualan-1");
  });

  it("collapses duplicate separators", () => {
    expect(slugify("Toko---Kopi   Susu")).toBe("toko-kopi-susu");
  });
});

describe("generateRandomString", () => {
  it("returns requested length using lowercase alpha numeric characters", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(generateRandomString(8)).toBe("aaaaaaaa");
    expect(generateRandomString(8)).toMatch(/^[a-z0-9]{8}$/);
    vi.restoreAllMocks();
  });
});
