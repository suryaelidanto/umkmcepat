export const PUBLIC_FEATURE_FLAGS = [
  "feature.composer_uploads_enabled",
  "feature.direct_edit_enabled",
] as const;

export type PublicFeatureFlag = (typeof PUBLIC_FEATURE_FLAGS)[number];
