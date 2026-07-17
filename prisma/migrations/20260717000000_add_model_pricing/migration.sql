-- CreateTable
CREATE TABLE IF NOT EXISTS "ModelPricing" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "promptPrice" DECIMAL(20,12) NOT NULL,
    "completionPrice" DECIMAL(20,12) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelPricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ModelPricing_modelId_key" ON "ModelPricing"("modelId");
