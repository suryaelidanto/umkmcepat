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
});
