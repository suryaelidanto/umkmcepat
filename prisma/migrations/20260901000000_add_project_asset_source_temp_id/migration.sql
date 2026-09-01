ALTER TABLE "ProjectAsset" ADD COLUMN "sourceTempAssetId" TEXT;

CREATE UNIQUE INDEX "ProjectAsset_projectId_userId_purpose_sourceTempAssetId_key"
ON "ProjectAsset"("projectId", "userId", "purpose", "sourceTempAssetId");
