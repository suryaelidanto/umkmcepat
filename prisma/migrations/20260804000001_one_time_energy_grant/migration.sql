ALTER TABLE "UserCredit" ALTER COLUMN "reason" SET NOT NULL;
ALTER TABLE "UserCredit" ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE UNIQUE INDEX "UserCredit_user_pilot_grant_unique"
ON "UserCredit"("userId")
WHERE "reason" = 'grant:pilot';

CREATE UNIQUE INDEX "UserCredit_user_pilot_backfill_unique"
ON "UserCredit"("userId")
WHERE "reason" = 'grant:pilot-backfill';

INSERT INTO "AppSetting" ("key", "category", "value", "updatedAt")
VALUES ('economics.signup_energy_grant', 'economics', '500000'::jsonb, NOW())
ON CONFLICT ("key") DO UPDATE
SET "category" = EXCLUDED."category",
    "value" = EXCLUDED."value",
    "updatedAt" = NOW();

DELETE FROM "AppSetting"
WHERE "key" = 'economics.daily_energy_limit';
