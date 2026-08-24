import { describe, expect, it } from "vitest";

import { getFormattedShadcnRegistryPrompt } from "./component-catalog";

describe("generated component catalog prompt", () => {
  it("describes the local source registry instead of fictional layout primitives", () => {
    const prompt = getFormattedShadcnRegistryPrompt();
    expect(prompt).toContain("button");
    expect(prompt).toContain("card");
    expect(prompt).toContain("copy_shadcn_component");
    expect(prompt).not.toContain(
      "All 45+ components and layout primitives are pre-installed",
    );
    expect(prompt).not.toContain("@/components/site/layout");
  });
});
