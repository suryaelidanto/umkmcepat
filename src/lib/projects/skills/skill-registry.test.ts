import { readFileSync } from "node:fs";

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
    expect(PROJECT_CORE_SKILL_NAMES).toContain("unslop");
    expect(PROJECT_CORE_SKILL_NAMES).toContain("impeccable/reference/new-work");
    expect(PROJECT_CORE_SKILL_NAMES).toContain(
      "impeccable/reference/craft-floor",
    );
  });

  it("loads the project Unslop skill as an exact copy of the source skill", () => {
    const source = readFileSync(".agents/skills/unslop/SKILL.md", "utf8");
    expect(readProjectSkill("unslop").content).toBe(source);
  });

  it("indexes all nested markdown documents with clean slug access", () => {
    expect(PROJECT_SKILL_NAMES.length).toBeGreaterThan(30);

    const impeccable = readProjectSkill("impeccable");
    expect(impeccable.content.length).toBeGreaterThan(100);

    const rules = readProjectSkill("shadcn-styling");
    expect(rules.content.length).toBeGreaterThan(50);
  });

  it("can execute a skill command with script arguments", async () => {
    const result = await executeSkillScript(
      "impeccable",
      "palette.mjs --id seed-200",
    );
    expect(result.ok).toBe(true);
    expect(typeof result.output).toBe("string");
  });
});
