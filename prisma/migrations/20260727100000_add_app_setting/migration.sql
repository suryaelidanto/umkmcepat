-- CreateTable
CREATE TABLE "AppSetting" (
    "key" VARCHAR(160) NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" VARCHAR(160),

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "AppSetting_category_idx" ON "AppSetting"("category");
