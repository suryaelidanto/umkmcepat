-- Additive: sticky generation engine + immutable contract/plan handoff.
-- Existing rows keep the safe legacy-v1 engine; no backfill or rebuild.

ALTER TABLE "Project" ADD COLUMN "generationEngine" VARCHAR(32) NOT NULL DEFAULT 'legacy-v1';
ALTER TABLE "Project" ADD COLUMN "activeHandoffId" TEXT;

CREATE TABLE "ProjectBuildHandoff" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "engine" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "contract" JSONB NOT NULL,
    "plan" JSONB NOT NULL,
    "contractHash" VARCHAR(64) NOT NULL,
    "planHash" VARCHAR(64) NOT NULL,
    "reviewItems" JSONB NOT NULL,
    "reviewHash" VARCHAR(64) NOT NULL,
    "contractRevision" INTEGER NOT NULL,
    "planRevision" INTEGER NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBuildHandoff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectBuildHandoff_projectId_contractRevision_planRevision_key"
    ON "ProjectBuildHandoff"("projectId", "contractRevision", "planRevision");
CREATE INDEX "ProjectBuildHandoff_projectId_status_createdAt_idx"
    ON "ProjectBuildHandoff"("projectId", "status", "createdAt");
CREATE INDEX "ProjectBuildHandoff_userId_idx" ON "ProjectBuildHandoff"("userId");

ALTER TABLE "ProjectBuildHandoff"
    ADD CONSTRAINT "ProjectBuildHandoff_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectBuildHandoff"
    ADD CONSTRAINT "ProjectBuildHandoff_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectEditAttempt" ADD COLUMN "handoffId" TEXT;

ALTER TABLE "ProjectEditAttempt"
    ADD CONSTRAINT "ProjectEditAttempt_handoffId_fkey"
    FOREIGN KEY ("handoffId") REFERENCES "ProjectBuildHandoff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project"
    ADD CONSTRAINT "Project_activeHandoffId_fkey"
    FOREIGN KEY ("activeHandoffId") REFERENCES "ProjectBuildHandoff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Project_activeHandoffId_key" ON "Project"("activeHandoffId");
