CREATE TABLE "ProjectBuildCheckpoint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "chatMessageId" VARCHAR(160),
    "chatMessageIndex" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectBuildCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectBuildCheckpoint_buildId_key"
ON "ProjectBuildCheckpoint"("buildId");

CREATE UNIQUE INDEX "ProjectBuildCheckpoint_snapshotId_key"
ON "ProjectBuildCheckpoint"("snapshotId");

CREATE INDEX "ProjectBuildCheckpoint_projectId_createdAt_idx"
ON "ProjectBuildCheckpoint"("projectId", "createdAt");

ALTER TABLE "ProjectBuildCheckpoint"
ADD CONSTRAINT "ProjectBuildCheckpoint_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectBuildCheckpoint"
ADD CONSTRAINT "ProjectBuildCheckpoint_buildId_fkey"
FOREIGN KEY ("buildId") REFERENCES "ProjectBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectBuildCheckpoint"
ADD CONSTRAINT "ProjectBuildCheckpoint_snapshotId_fkey"
FOREIGN KEY ("snapshotId") REFERENCES "ProjectSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
