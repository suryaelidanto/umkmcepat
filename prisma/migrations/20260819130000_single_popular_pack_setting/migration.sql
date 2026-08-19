-- Add single dropdown setting for popular booster pack and clean up obsolete boolean is_popular keys

INSERT INTO "AppSetting" ("key", "category", "value", "updatedAt")
VALUES ('booster.popular_pack_id', 'booster', '"starter"'::jsonb, NOW())
ON CONFLICT ("key") DO UPDATE
SET "category" = EXCLUDED."category",
    "value" = EXCLUDED."value",
    "updatedAt" = NOW();

DELETE FROM "AppSetting"
WHERE "key" IN (
  'booster.pocket.is_popular',
  'booster.starter.is_popular',
  'booster.popular.is_popular',
  'booster.max.is_popular'
);
