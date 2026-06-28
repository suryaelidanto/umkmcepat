import { describe, expect, it } from "vitest";

import { createProjectMark } from "./project-mark";

describe("createProjectMark", () => {
  it("creates stable local marks from a project seed", () => {
    expect(createProjectMark("project-a")).toEqual(
      createProjectMark("project-a"),
    );
    expect(createProjectMark("project-a")).not.toEqual(
      createProjectMark("project-b"),
    );
  });

  it("keeps from, to, and glow colors distinct", () => {
    for (const seed of ["a", "angkringan", "x", "laundry-kilat", "z9"]) {
      const mark = createProjectMark(seed);
      expect(new Set([mark.from, mark.to, mark.glowColor]).size).toBe(3);
    }
  });
});
