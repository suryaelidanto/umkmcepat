-- CreateTable
CREATE TABLE "ProjectEditAttempt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentSnapshotId" TEXT,
    "snapshotId" TEXT,
    "buildId" TEXT,
    "kind" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'received',
    "instruction" TEXT NOT NULL,
    "summary" TEXT,
    "annotations" JSONB,
    "validationIssues" JSONB,
    "advisoryIssues" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectEditAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectEditAttempt_projectId_createdAt_idx" ON "ProjectEditAttempt"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectEditAttempt_userId_idx" ON "ProjectEditAttempt"("userId");

-- CreateIndex
CREATE INDEX "ProjectEditAttempt_status_idx" ON "ProjectEditAttempt"("status");

-- AddForeignKey
ALTER TABLE "ProjectEditAttempt" ADD CONSTRAINT "ProjectEditAttempt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEditAttempt" ADD CONSTRAINT "ProjectEditAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
