import { describe, expect, it } from "vitest";

import { getNewProjectPath, getProjectTitle } from "./workspace";

describe("getNewProjectPath", () => {
  it("keeps first prompt on the new project URL", () => {
    expect(getNewProjectPath("Saya jual sambal rumahan")).toBe(
      "/projects/new?prompt=Saya+jual+sambal+rumahan",
    );
  });

  it("falls back to the new project URL without an empty query", () => {
    expect(getNewProjectPath("   ")).toBe("/projects/new");
  });

  it("keeps selected model on the new project URL", () => {
    expect(
      getNewProjectPath("Usaha laundry", "cmc/deepseek/deepseek-v4-flash"),
    ).toBe(
      "/projects/new?prompt=Usaha+laundry&model=cmc%2Fdeepseek%2Fdeepseek-v4-flash",
    );
  });
});

describe("getProjectTitle", () => {
  it("uses a concise prompt-derived title", () => {
    expect(getProjectTitle("  Toko kopi susu rumahan  ")).toBe(
      "Toko kopi susu rumahan",
    );
  });

  it("falls back when prompt is empty", () => {
    expect(getProjectTitle("   ")).toBe("Proyek baru");
  });
});
