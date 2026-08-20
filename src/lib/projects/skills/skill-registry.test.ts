import { describe, expect, it } from "vitest";

import {
  PROJECT_CORE_SKILL_NAMES,
  PROJECT_SKILL_NAMES,
  readProjectSkill,
} from "./skill-registry";

describe("project skill registry", () => {
  it("bundles every local skill with valid frontmatter and non-empty content", () => {
    for (const name of PROJECT_SKILL_NAMES) {
      const skill = readProjectSkill(name);
      expect(skill.name).toBe(name);
      expect(skill.content).toMatch(/^---\n[\s\S]+\n---\n/);
      expect(skill.content.length).toBeGreaterThan(400);
    }
  });

  it("keeps the four core skills separate from conditional motion guidance", () => {
    expect(PROJECT_CORE_SKILL_NAMES).toEqual([
      "impeccable-craft",
      "vercel-web-design",
      "indonesian-umkm",
      "shadcn-ui",
    ]);
    expect(PROJECT_SKILL_NAMES).toContain("emil-motion");
    expect(PROJECT_CORE_SKILL_NAMES).not.toContain("emil-motion");
  });
});
