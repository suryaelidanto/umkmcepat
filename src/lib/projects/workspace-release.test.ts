import { describe, expect, it } from "vitest";

import { getWorkspaceReleaseState } from "@/lib/projects/workspace-release";

describe("workspace release state", () => {
  it("offers republish when Preview has a newer build than Production", () => {
    expect(
      getWorkspaceReleaseState({
        previewBuildId: "build_new",
        previewBuildStatus: "succeeded",
        publishedBuildId: "build_old",
        publishedPath: "/p/website/",
        publishedStatus: "created",
        ownerBlocked: false,
      }),
    ).toEqual({
      canPublish: true,
      hasUnpublishedPreview: true,
      publishedState: "live",
    });
  });

  it("marks a published site not live when its owner is blocked", () => {
    expect(
      getWorkspaceReleaseState({
        previewBuildId: "build_1",
        previewBuildStatus: "succeeded",
        publishedBuildId: "build_1",
        publishedPath: "/p/website/",
        publishedStatus: "created",
        ownerBlocked: true,
      }),
    ).toMatchObject({
      canPublish: true,
      hasUnpublishedPreview: false,
      publishedState: "not_live",
    });
  });
});
