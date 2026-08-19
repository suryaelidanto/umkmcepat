-- Clean up obsolete flags and ensure default feature flags match release policy:
-- Waitlist: ON (true)
-- Streamer mode: ON (true)
-- Agentic Tool Loop Generator: ON (true)
-- Composer image uploads: OFF (false)
-- Workspace direct edit mode: OFF (false)

INSERT INTO "AppSetting" ("key", "category", "value", "updatedAt")
VALUES
  ('feature.waitlist_enabled', 'feature_flag', 'true'::jsonb, NOW()),
  ('feature.streamer_mode', 'feature_flag', 'true'::jsonb, NOW()),
  ('feature.generation_engine_agentic', 'feature_flag', 'true'::jsonb, NOW()),
  ('feature.composer_uploads_enabled', 'feature_flag', 'false'::jsonb, NOW()),
  ('feature.direct_edit_enabled', 'feature_flag', 'false'::jsonb, NOW())
ON CONFLICT ("key") DO UPDATE
SET "category" = EXCLUDED."category",
    "value" = EXCLUDED."value",
    "updatedAt" = NOW();

DELETE FROM "AppSetting"
WHERE "key" IN (
  'feature.generated_site_quality_rollout',
  'feature.builder_photo_enabled'
);
