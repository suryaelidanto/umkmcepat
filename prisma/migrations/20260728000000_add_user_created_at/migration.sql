-- AlterTable
ALTER TABLE "User" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill existing rows so the NOT NULL constraint holds.
-- All pre-existing users get the migration run-time as a best-available stamp.
UPDATE "User" SET "createdAt" = CURRENT_TIMESTAMP WHERE "createdAt" IS NULL;

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
