import { describe, expect, it } from "vitest";

import { buildChatSystemPrompt } from "./chat-system-prompt";

describe("buildChatSystemPrompt", () => {
  it("generates discovery interview prompt when site has not been built", () => {
    const brief = { businessName: "Warung Kopi" };
    const prompt = buildChatSystemPrompt({
      brief,
      context: "custom-context-token",
      hasBuiltSite: false,
    });

    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain("Warung Kopi");
    expect(prompt).toContain("custom-context-token");
    expect(prompt).toContain("Interview discipline");
  });

  it("generates website-editing prompt when site has already been built", () => {
    const brief = { businessName: "Warung Kopi" };
    const prompt = buildChatSystemPrompt({
      brief,
      context: "built-context-token",
      hasBuiltSite: true,
    });

    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain("Warung Kopi");
    expect(prompt).toContain("built-context-token");
    expect(prompt).toContain("The website is already built");
    expect(prompt).not.toContain("Interview discipline");
  });
});
