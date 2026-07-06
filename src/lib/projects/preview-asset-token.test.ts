import { describe, expect, it } from "vitest";

import {
  createPreviewAssetToken,
  verifyPreviewAssetToken,
} from "@/lib/projects/preview-asset-token";

describe("preview asset token", () => {
  it("allows only matching project and deployment asset tokens", () => {
    const token = createPreviewAssetToken({
      deploymentId: "deployment_1",
      projectId: "project_1",
    });

    expect(
      verifyPreviewAssetToken({
        deploymentId: "deployment_1",
        projectId: "project_1",
        token,
      }),
    ).toBe(true);
    expect(
      verifyPreviewAssetToken({
        deploymentId: "deployment_2",
        projectId: "project_1",
        token,
      }),
    ).toBe(false);
    expect(
      verifyPreviewAssetToken({
        deploymentId: "deployment_1",
        projectId: "project_2",
        token,
      }),
    ).toBe(false);
  });
});
