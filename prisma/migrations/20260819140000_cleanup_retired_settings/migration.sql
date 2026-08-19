-- Clean up retired settings from AppSetting table

DELETE FROM "AppSetting"
WHERE "key" IN (
  'generation.default_engine',
  'feature.thumbnail_capture_enabled'
);
