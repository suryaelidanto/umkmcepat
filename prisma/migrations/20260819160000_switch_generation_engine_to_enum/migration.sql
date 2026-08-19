-- Switch generation engine from boolean flag to flexible enum dropdown

INSERT INTO "AppSetting" ("key", "category", "value", "updatedAt")
VALUES ('generation.engine', 'feature_flag', '"agentic"'::jsonb, NOW())
ON CONFLICT ("key") DO UPDATE
SET "category" = EXCLUDED."category",
    "value" = EXCLUDED."value",
    "updatedAt" = NOW();

DELETE FROM "AppSetting"
WHERE "key" = 'feature.generation_engine_agentic';
