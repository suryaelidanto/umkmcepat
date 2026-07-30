CREATE TABLE "SupportAsset" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "ticketId" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportAsset_assetId_key" ON "SupportAsset"("assetId");
CREATE INDEX "SupportAsset_uploadedById_ticketId_idx" ON "SupportAsset"("uploadedById", "ticketId");
CREATE INDEX "SupportAsset_messageId_idx" ON "SupportAsset"("messageId");

ALTER TABLE "SupportAsset" ADD CONSTRAINT "SupportAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportAsset" ADD CONSTRAINT "SupportAsset_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportAsset" ADD CONSTRAINT "SupportAsset_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SupportMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
