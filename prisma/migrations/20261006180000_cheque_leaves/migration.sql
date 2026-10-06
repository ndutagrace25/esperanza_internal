-- Cheque leaf register: sequential cheque numbers (shown as 000001), payee, amount, description
-- CreateEnum
CREATE TYPE "ChequeLeafStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- CreateTable
CREATE TABLE "cheque_leaves" (
    "id" TEXT NOT NULL,
    "cheque_number" INTEGER NOT NULL,
    "payee" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "cheque_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ChequeLeafStatus" NOT NULL DEFAULT 'ISSUED',
    "cancelled_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cheque_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cheque_leaves_cheque_number_key" ON "cheque_leaves"("cheque_number");

-- CreateIndex
CREATE INDEX "cheque_leaves_cheque_date_idx" ON "cheque_leaves"("cheque_date");

-- CreateIndex
CREATE INDEX "cheque_leaves_status_idx" ON "cheque_leaves"("status");

-- AddForeignKey
ALTER TABLE "cheque_leaves" ADD CONSTRAINT "cheque_leaves_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

