import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  executeSkillScript,
  PROJECT_CORE_SKILL_NAMES,
  PROJECT_SCRIPT_SKILL_NAMES,
  PROJECT_SKILL_NAMES,
  readProjectSkill,
  skillEngine,
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

  it("can execute an entrypoint with script arguments", async () => {
    const result = await executeSkillScript("impeccable", "palette", {
      id: "seed-200",
    });
    expect(result.ok).toBe(true);
    expect(typeof result.output).toBe("string");
  });

  it("blocks helper subdirectory scripts from direct execution", async () => {
    const result = await executeSkillScript(
      "impeccable",
      "lib/roll-selection.mjs",
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("helper");
  });

  it("rejects path traversal targets without executing anything", async () => {
    const result = await executeSkillScript("impeccable", "../../etc/passwd");
    expect(result.ok).toBe(false);
  });

  it("discovers a newly added entrypoint script without hardcoding", async () => {
    const fixture = path.join(
      "src",
      "lib",
      "projects",
      "skills",
      "impeccable",
      "scripts",
      "__entry-fixture.mjs",
    );
    fsWriteFixture(fixture);
    try {
      skillEngine.refresh();
      const result = await executeSkillScript("impeccable", "__entry-fixture");
      expect(result.ok).toBe(true);
    } finally {
      fsRemoveFixture(fixture);
      skillEngine.refresh();
    }
  });

  it("derives script-enabled skills from discovery, not a literal list", () => {
    expect(PROJECT_SCRIPT_SKILL_NAMES).toContain("impeccable");
    expect(PROJECT_SCRIPT_SKILL_NAMES).not.toContain("shadcn");
    expect(PROJECT_SCRIPT_SKILL_NAMES).not.toContain("unslop");
  });
});

function fsWriteFixture(filePath: string): void {
  writeFileSync(filePath, "// temp entrypoint fixture\n");
}

function fsRemoveFixture(filePath: string): void {
  rmSync(filePath, { force: true });
}
