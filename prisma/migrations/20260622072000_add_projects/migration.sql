-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" VARCHAR(160) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Project_updatedAt_idx" ON "Project"("updatedAt");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
