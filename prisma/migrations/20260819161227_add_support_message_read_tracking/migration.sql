-- AlterTable
ALTER TABLE "SupportMessage" ADD COLUMN     "isRead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_isRead_idx" ON "SupportMessage"("ticketId", "isRead");
