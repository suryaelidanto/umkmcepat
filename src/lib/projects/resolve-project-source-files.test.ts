import { describe, expect, it } from "vitest";

import { resolveProjectSourceFiles } from "./resolve-project-source-files";

const sample = [{ path: "src/routes/index.tsx", content: "export default 1" }];

describe("resolveProjectSourceFiles", () => {
  it("prefers latest attempt snapshot over project sourceFiles", async () => {
    const files = await resolveProjectSourceFiles({
      latestAttemptSnapshot: { id: "s1", files: sample },
      projectSourceFiles: [{ path: "old.tsx", content: "old" }],
    });
    expect(files).toEqual(sample);
  });

  it("uses latest attempt even when only failed-build embedded files exist", async () => {
    const files = await resolveProjectSourceFiles({
      latestAttemptSnapshot: {
        id: "failed",
        files: sample,
        sourceRef: null,
      },
      latestProjectSnapshot: null,
      projectSourceFiles: null,
    });
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/routes/index.tsx");
  });

  it("falls back to project sourceFiles", async () => {
    const files = await resolveProjectSourceFiles({
      latestAttemptSnapshot: { id: "empty", files: [] },
      projectSourceFiles: sample,
    });
    expect(files).toEqual(sample);
  });

  it("prefers artifact when sourceRef resolves", async () => {
    const files = await resolveProjectSourceFiles({
      latestAttemptSnapshot: {
        id: "s",
        files: [],
        sourceRef: "ref-1",
      },
      readArtifact: async (ref) => {
        expect(ref).toBe("ref-1");
        return sample;
      },
    });
    expect(files).toEqual(sample);
  });
});
