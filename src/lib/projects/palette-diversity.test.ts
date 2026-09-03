import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}));

import {
  buildHueDiversityPromptLine,
  classifyHueFamily,
  readRecentHueFamilies,
} from "./palette-diversity";

describe("hue classification", () => {
  it("maps saturated hexes to their hue family", () => {
    expect(classifyHueFamily("#ff8800")).toBe("orange");
    expect(classifyHueFamily("#1d4ed8")).toBe("blue");
    expect(classifyHueFamily("#16a34a")).toBe("green");
    expect(classifyHueFamily("#d946ef")).toBe("magenta");
    expect(classifyHueFamily("#be123c")).toBe("red");
  });

  it("treats chroma-free grays as neutral", () => {
    expect(classifyHueFamily("#1c1c1c")).toBe("neutral");
    expect(classifyHueFamily("#f6f7f4")).toBe("neutral");
    expect(classifyHueFamily("not-a-color")).toBe("neutral");
  });
});

describe("hue diversity prompt line", () => {
  it("lists recent families when present", () => {
    const line = buildHueDiversityPromptLine(["orange", "blue"]);
    expect(line).toContain("orange");
    expect(line).toContain("blue");
  });

  it("returns an empty line when nothing was recorded", () => {
    expect(buildHueDiversityPromptLine([])).toBe("");
  });
});

describe("readRecentHueFamilies", () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it("scopes the query to the owning user and filters cross-user rows", async () => {
    findManyMock.mockResolvedValue([
      { userId: "u1", siteSchema: { theme: { accent: "#ff8800" } } },
      { userId: "u2", siteSchema: { theme: { accent: "#1d4ed8" } } },
    ]);

    const families = await readRecentHueFamilies("u1");

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
      }),
    );
    expect(families).toEqual(["orange"]);
    expect(families).not.toContain("blue");
  });

  it("fails open with no families on storage errors", async () => {
    findManyMock.mockRejectedValue(new Error("db down"));
    await expect(readRecentHueFamilies("u1")).resolves.toEqual([]);
  });
});
