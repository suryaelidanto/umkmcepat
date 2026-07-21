import { describe, expect, it } from "vitest";

import { buildOneCallSystemPrompt } from "@/lib/projects/discuss-tool";
import { buildChatSystemPrompt } from "@/routes/api.projects.preview";

describe("discuss system prompts respect hasBuiltSite", () => {
  const args = { brief: {}, context: "" };

  it("buildChatSystemPrompt: asks brief questions only before the site is built", () => {
    const beforeBuild = buildChatSystemPrompt({ ...args, hasBuiltSite: false });
    const afterBuild = buildChatSystemPrompt({ ...args, hasBuiltSite: true });

    expect(beforeBuild).toContain("Interview discipline");
    expect(beforeBuild).toContain("recommend building the website");

    expect(afterBuild).not.toContain("Interview discipline");
    expect(afterBuild).toContain("NOT a brief interview");
    expect(afterBuild).toContain("The website is already built");
  });

  it("buildOneCallSystemPrompt: only allows build_recommendation/question cards before build", () => {
    const beforeBuild = buildOneCallSystemPrompt({
      ...args,
      hasBuiltSite: false,
    });
    const afterBuild = buildOneCallSystemPrompt({
      ...args,
      hasBuiltSite: true,
    });

    expect(beforeBuild).toContain("INTERVIEW DISCIPLINE");
    expect(beforeBuild).toContain("build_recommendation");

    expect(afterBuild).not.toContain("INTERVIEW DISCIPLINE");
    expect(afterBuild).toContain(
      'call presentWorkspaceCard exactly once with { type: "none" }',
    );
    expect(afterBuild).toContain("edit request, not an interview");
  });
});
