-- CreateTable
CREATE TABLE "AiCallRecord" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT,
    "attemptId" TEXT,
    "turnId" TEXT,
    "buildId" TEXT,
    "task" VARCHAR(32) NOT NULL,
    "phase" VARCHAR(32),
    "stepIndex" INTEGER,
    "modelRequested" VARCHAR(160) NOT NULL,
    "modelServed" VARCHAR(160),
    "requestMs" INTEGER,
    "ttftMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cachedTokens" INTEGER,
    "status" VARCHAR(16) NOT NULL,
    "errorClass" VARCHAR(64),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "hedged" BOOLEAN NOT NULL DEFAULT false,
    "raceRole" VARCHAR(16),

    CONSTRAINT "AiCallRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiCallRecord_projectId_createdAt_idx" ON "AiCallRecord"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AiCallRecord_attemptId_idx" ON "AiCallRecord"("attemptId");

-- CreateIndex
CREATE INDEX "AiCallRecord_turnId_idx" ON "AiCallRecord"("turnId");

-- CreateIndex
CREATE INDEX "AiCallRecord_task_createdAt_idx" ON "AiCallRecord"("task", "createdAt");
