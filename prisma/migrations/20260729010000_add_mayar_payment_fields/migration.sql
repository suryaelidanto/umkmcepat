-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "paymentUrl" TEXT,
ADD COLUMN     "providerPaymentLinkId" TEXT,
ADD COLUMN     "providerTxnId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerTxnId_key" ON "Payment"("providerTxnId");
