import { describe, expect, it } from "vitest";

import { getFormattedShadcnRegistryPrompt } from "./component-catalog";

describe("generated component catalog prompt", () => {
  it("describes the local source registry instead of fictional layout primitives", () => {
    const prompt = getFormattedShadcnRegistryPrompt();
    expect(prompt).toContain("src/components/ui/button.tsx");
    expect(prompt).toContain("src/components/ui/card.tsx");
    expect(prompt).toContain("read_file");
    expect(prompt).toContain("write_file");
    expect(prompt).not.toContain(
      "All 45+ components and layout primitives are pre-installed",
    );
    expect(prompt).not.toContain("@/components/site/layout");
  });
});
