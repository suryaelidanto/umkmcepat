-- AlterTable
ALTER TABLE "SupportMessage" ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_readAt_idx" ON "SupportMessage"("ticketId", "readAt");
