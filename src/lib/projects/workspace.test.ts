import { describe, expect, it } from "vitest";

import { getWorkspacePath } from "./workspace";

describe("getWorkspacePath", () => {
  it("keeps first prompt on the workspace URL", () => {
    expect(getWorkspacePath("Saya jual sambal rumahan")).toBe(
      "/projects/demo?prompt=Saya+jual+sambal+rumahan",
    );
  });

  it("falls back to the demo workspace without an empty query", () => {
    expect(getWorkspacePath("   ")).toBe("/projects/demo");
  });

  it("keeps selected model on the workspace URL", () => {
    expect(
      getWorkspacePath("Usaha laundry", "cmc/deepseek/deepseek-v4-flash"),
    ).toBe(
      "/projects/demo?prompt=Usaha+laundry&model=cmc%2Fdeepseek%2Fdeepseek-v4-flash",
    );
  });
});
