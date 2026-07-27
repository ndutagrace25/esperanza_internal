-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('FIXED', 'PERCENTAGE');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "commissionType" "CommissionType",
ADD COLUMN     "commissionValue" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "commissionAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "commissionEmployeeId" TEXT,
ADD COLUMN     "commissionPaidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "commissionRate" DECIMAL(10,2),
ADD COLUMN     "commissionType" "CommissionType";

-- CreateTable
CREATE TABLE "sale_commission_payments" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMethod" "PaymentMethod",
    "referenceNumber" TEXT,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_commission_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_amount_history" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "oldAmount" DECIMAL(10,2) NOT NULL,
    "newAmount" DECIMAL(10,2) NOT NULL,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_amount_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_commission_payments_saleId_idx" ON "sale_commission_payments"("saleId");

-- CreateIndex
CREATE INDEX "sale_amount_history_saleId_idx" ON "sale_amount_history"("saleId");

-- CreateIndex
CREATE INDEX "sales_commissionEmployeeId_idx" ON "sales"("commissionEmployeeId");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_commissionEmployeeId_fkey" FOREIGN KEY ("commissionEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_commission_payments" ADD CONSTRAINT "sale_commission_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_commission_payments" ADD CONSTRAINT "sale_commission_payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_amount_history" ADD CONSTRAINT "sale_amount_history_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_amount_history" ADD CONSTRAINT "sale_amount_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
