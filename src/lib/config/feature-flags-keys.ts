export const PUBLIC_APP_SETTINGS = [
  "feature.composer_uploads_enabled",
  "feature.direct_edit_enabled",
  "feature.default_theme",
] as const;

export type PublicAppSettingKey = (typeof PUBLIC_APP_SETTINGS)[number];
