-- Expand-only lease fields. Older application versions ignore nullable columns.
ALTER TABLE "Project"
  ADD COLUMN "activeOperationToken" VARCHAR(64),
  ADD COLUMN "activeOperationKind" VARCHAR(32),
  ADD COLUMN "activeOperationExpiresAt" TIMESTAMP(3);

ALTER TABLE "ProjectEditAttempt"
  ADD COLUMN "leaseToken" VARCHAR(64),
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "finishedAt" TIMESTAMP(3);

CREATE INDEX "Project_activeOperationExpiresAt_idx"
  ON "Project"("activeOperationExpiresAt");

CREATE INDEX "ProjectEditAttempt_leaseToken_idx"
  ON "ProjectEditAttempt"("leaseToken");

-- Composite indexes match the dominant owner/history/runtime access paths.
CREATE INDEX "Project_userId_updatedAt_id_idx"
  ON "Project"("userId", "updatedAt", "id");

CREATE INDEX "ProjectSnapshot_projectId_createdAt_idx"
  ON "ProjectSnapshot"("projectId", "createdAt");

CREATE INDEX "ProjectBuild_projectId_createdAt_idx"
  ON "ProjectBuild"("projectId", "createdAt");

CREATE INDEX "ProjectBuild_projectId_status_updatedAt_idx"
  ON "ProjectBuild"("projectId", "status", "updatedAt");

CREATE INDEX "ProjectDeployment_projectId_kind_createdAt_idx"
  ON "ProjectDeployment"("projectId", "kind", "createdAt");

CREATE INDEX "ProjectDeployment_projectId_kind_updatedAt_idx"
  ON "ProjectDeployment"("projectId", "kind", "updatedAt");

CREATE INDEX "ProjectDeployment_slug_idx"
  ON "ProjectDeployment"("slug");

CREATE INDEX "RuntimeEvent_projectId_createdAt_idx"
  ON "RuntimeEvent"("projectId", "createdAt");
