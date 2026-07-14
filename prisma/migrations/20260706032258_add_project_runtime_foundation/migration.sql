-- CreateTable
CREATE TABLE "ProjectSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentSnapshotId" TEXT,
    "sourceType" VARCHAR(32) NOT NULL DEFAULT 'generated',
    "sourceRef" TEXT,
    "files" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBuild" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "logRef" TEXT,
    "logText" TEXT,
    "artifactRef" TEXT,
    "imageRef" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBuild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDeployment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "buildId" TEXT,
    "snapshotId" TEXT,
    "kind" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "runtimeNodeId" TEXT,
    "containerName" VARCHAR(160),
    "internalUrl" TEXT,
    "publicPath" VARCHAR(255),
    "publicUrl" TEXT,
    "slug" VARCHAR(160),
    "lastRequestAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeNode" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "internalUrl" TEXT,
    "status" VARCHAR(32) NOT NULL,
    "maxContainers" INTEGER NOT NULL,
    "memoryMb" INTEGER,
    "cpuCores" DOUBLE PRECISION,
    "lastHeartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuntimeNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "deploymentId" TEXT,
    "buildId" TEXT,
    "runtimeNodeId" TEXT,
    "type" VARCHAR(96) NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuntimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectSnapshot_projectId_idx" ON "ProjectSnapshot"("projectId");

-- CreateIndex
CREATE INDEX "ProjectSnapshot_parentSnapshotId_idx" ON "ProjectSnapshot"("parentSnapshotId");

-- CreateIndex
CREATE INDEX "ProjectSnapshot_createdAt_idx" ON "ProjectSnapshot"("createdAt");

-- CreateIndex
CREATE INDEX "ProjectBuild_projectId_idx" ON "ProjectBuild"("projectId");

-- CreateIndex
CREATE INDEX "ProjectBuild_snapshotId_idx" ON "ProjectBuild"("snapshotId");

-- CreateIndex
CREATE INDEX "ProjectBuild_status_idx" ON "ProjectBuild"("status");

-- CreateIndex
CREATE INDEX "ProjectBuild_createdAt_idx" ON "ProjectBuild"("createdAt");

-- CreateIndex
CREATE INDEX "ProjectDeployment_projectId_idx" ON "ProjectDeployment"("projectId");

-- CreateIndex
CREATE INDEX "ProjectDeployment_buildId_idx" ON "ProjectDeployment"("buildId");

-- CreateIndex
CREATE INDEX "ProjectDeployment_runtimeNodeId_idx" ON "ProjectDeployment"("runtimeNodeId");

-- CreateIndex
CREATE INDEX "ProjectDeployment_status_idx" ON "ProjectDeployment"("status");

-- CreateIndex
CREATE INDEX "ProjectDeployment_kind_idx" ON "ProjectDeployment"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeNode_name_key" ON "RuntimeNode"("name");

-- CreateIndex
CREATE INDEX "RuntimeNode_status_idx" ON "RuntimeNode"("status");

-- CreateIndex
CREATE INDEX "RuntimeEvent_projectId_idx" ON "RuntimeEvent"("projectId");

-- CreateIndex
CREATE INDEX "RuntimeEvent_deploymentId_idx" ON "RuntimeEvent"("deploymentId");

-- CreateIndex
CREATE INDEX "RuntimeEvent_buildId_idx" ON "RuntimeEvent"("buildId");

-- CreateIndex
CREATE INDEX "RuntimeEvent_runtimeNodeId_idx" ON "RuntimeEvent"("runtimeNodeId");

-- CreateIndex
CREATE INDEX "RuntimeEvent_type_idx" ON "RuntimeEvent"("type");

-- CreateIndex
CREATE INDEX "RuntimeEvent_createdAt_idx" ON "RuntimeEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "ProjectSnapshot" ADD CONSTRAINT "ProjectSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSnapshot" ADD CONSTRAINT "ProjectSnapshot_parentSnapshotId_fkey" FOREIGN KEY ("parentSnapshotId") REFERENCES "ProjectSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBuild" ADD CONSTRAINT "ProjectBuild_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBuild" ADD CONSTRAINT "ProjectBuild_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ProjectSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDeployment" ADD CONSTRAINT "ProjectDeployment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDeployment" ADD CONSTRAINT "ProjectDeployment_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "ProjectBuild"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDeployment" ADD CONSTRAINT "ProjectDeployment_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ProjectSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDeployment" ADD CONSTRAINT "ProjectDeployment_runtimeNodeId_fkey" FOREIGN KEY ("runtimeNodeId") REFERENCES "RuntimeNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuntimeEvent" ADD CONSTRAINT "RuntimeEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuntimeEvent" ADD CONSTRAINT "RuntimeEvent_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "ProjectDeployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuntimeEvent" ADD CONSTRAINT "RuntimeEvent_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "ProjectBuild"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuntimeEvent" ADD CONSTRAINT "RuntimeEvent_runtimeNodeId_fkey" FOREIGN KEY ("runtimeNodeId") REFERENCES "RuntimeNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
