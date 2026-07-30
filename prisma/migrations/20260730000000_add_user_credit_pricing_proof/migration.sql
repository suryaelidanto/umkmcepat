ALTER TABLE "UserCredit" ADD COLUMN "rawModelId" VARCHAR(160);
ALTER TABLE "UserCredit" ADD COLUMN "pricedModelId" VARCHAR(160);
ALTER TABLE "UserCredit" ADD COLUMN "pricingSource" VARCHAR(32);
ALTER TABLE "UserCredit" ADD COLUMN "promptPrice" DECIMAL(20, 12);
ALTER TABLE "UserCredit" ADD COLUMN "completionPrice" DECIMAL(20, 12);
