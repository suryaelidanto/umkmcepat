-- AlterTable
ALTER TABLE "UserCredit" ADD COLUMN "projectId" TEXT;

-- AddForeignKey
ALTER TABLE "UserCredit"
  ADD CONSTRAINT "UserCredit_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "UserCredit_userId_expiresAt_createdAt_idx"
  ON "UserCredit"("userId", "expiresAt", "createdAt");

-- CreateIndex
CREATE INDEX "UserCredit_projectId_createdAt_idx"
  ON "UserCredit"("projectId", "createdAt");
