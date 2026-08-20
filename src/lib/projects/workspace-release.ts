export type WorkspaceReleaseState = {
  canPublish: boolean;
  hasUnpublishedPreview: boolean;
  publishedState: "live" | "not_live" | "unpublished";
};

export function getWorkspaceReleaseState({
  ownerBlocked,
  previewBuildId,
  previewBuildStatus,
  publishedBuildId,
  publishedPath,
  publishedStatus,
}: {
  ownerBlocked: boolean;
  previewBuildId?: string | null;
  previewBuildStatus?: string | null;
  publishedBuildId?: string | null;
  publishedPath?: string | null;
  publishedStatus?: string | null;
}): WorkspaceReleaseState {
  const canPublish = ["passed", "succeeded"].includes(previewBuildStatus ?? "");
  const hasPublishedSite = Boolean(publishedPath);
  const hasUnpublishedPreview =
    canPublish &&
    hasPublishedSite &&
    Boolean(previewBuildId) &&
    previewBuildId !== publishedBuildId;

  return {
    canPublish,
    hasUnpublishedPreview,
    publishedState: !hasPublishedSite
      ? "unpublished"
      : ownerBlocked || publishedStatus === "failed"
        ? "not_live"
        : "live",
  };
}
