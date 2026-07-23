-- CreateEnum
CREATE TYPE "ProjectChatTurnStatus" AS ENUM ('running', 'succeeded', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "ProjectChatTurn" (
    "id" VARCHAR(32) NOT NULL,
    "projectId" TEXT NOT NULL,
    "userMessageId" VARCHAR(64) NOT NULL,
    "status" "ProjectChatTurnStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "errorMessage" TEXT,

    CONSTRAINT "ProjectChatTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectChatTurn_projectId_status_idx" ON "ProjectChatTurn"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectChatTurn_expiresAt_idx" ON "ProjectChatTurn"("expiresAt");

-- AddForeignKey
ALTER TABLE "ProjectChatTurn" ADD CONSTRAINT "ProjectChatTurn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
