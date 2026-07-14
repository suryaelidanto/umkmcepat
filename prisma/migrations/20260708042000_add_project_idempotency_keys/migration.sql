-- CreateTable
CREATE TABLE "ProjectIdempotencyKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "key" VARCHAR(160) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectIdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectIdempotencyKey_userId_action_key_key" ON "ProjectIdempotencyKey"("userId", "action", "key");

-- CreateIndex
CREATE INDEX "ProjectIdempotencyKey_projectId_idx" ON "ProjectIdempotencyKey"("projectId");

-- CreateIndex
CREATE INDEX "ProjectIdempotencyKey_createdAt_idx" ON "ProjectIdempotencyKey"("createdAt");

-- AddForeignKey
ALTER TABLE "ProjectIdempotencyKey" ADD CONSTRAINT "ProjectIdempotencyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectIdempotencyKey" ADD CONSTRAINT "ProjectIdempotencyKey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
