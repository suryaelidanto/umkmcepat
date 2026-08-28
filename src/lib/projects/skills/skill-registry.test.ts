import { describe, expect, it } from "vitest";

import {
  executeSkillScript,
  PROJECT_CORE_SKILL_NAMES,
  PROJECT_SKILL_NAMES,
  readProjectSkill,
} from "./skill-registry";

describe("DynamicSkillEngine", () => {
  it("auto-discovers root skills dynamically without hardcoding", () => {
    expect(PROJECT_CORE_SKILL_NAMES).toContain("impeccable");
    expect(PROJECT_CORE_SKILL_NAMES).toContain("shadcn");
  });

  it("indexes all nested markdown documents with clean slug access", () => {
    expect(PROJECT_SKILL_NAMES.length).toBeGreaterThan(30);

    const impeccable = readProjectSkill("impeccable");
    expect(impeccable.content.length).toBeGreaterThan(100);

    const soft = readProjectSkill("soft-skill");
    expect(soft.content.length).toBeGreaterThan(100);

    const rules = readProjectSkill("shadcn-styling");
    expect(rules.content.length).toBeGreaterThan(50);
  });

  it("can execute skill script safely in-memory", async () => {
    const result = await executeSkillScript(
      "impeccable",
      "scripts/palette.mjs",
    );
    expect(result.ok).toBe(true);
  });
});
