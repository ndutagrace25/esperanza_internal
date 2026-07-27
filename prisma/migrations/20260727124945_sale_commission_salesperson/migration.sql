/*
  Warnings:

  - You are about to drop the column `commissionEmployeeId` on the `sales` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "SalesPersonStatus" AS ENUM ('active', 'inactive');

-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_commissionEmployeeId_fkey";

-- DropIndex
DROP INDEX "sales_commissionEmployeeId_idx";

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "salesPersonId" TEXT;

-- AlterTable
ALTER TABLE "sales" DROP COLUMN "commissionEmployeeId",
ADD COLUMN     "commissionSalesPersonId" TEXT;

-- CreateTable
CREATE TABLE "sales_people" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "employeeId" TEXT,
    "status" "SalesPersonStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_people_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_people_employeeId_idx" ON "sales_people"("employeeId");

-- CreateIndex
CREATE INDEX "sales_people_status_idx" ON "sales_people"("status");

-- CreateIndex
CREATE INDEX "clients_salesPersonId_idx" ON "clients"("salesPersonId");

-- CreateIndex
CREATE INDEX "sales_commissionSalesPersonId_idx" ON "sales"("commissionSalesPersonId");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_salesPersonId_fkey" FOREIGN KEY ("salesPersonId") REFERENCES "sales_people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_commissionSalesPersonId_fkey" FOREIGN KEY ("commissionSalesPersonId") REFERENCES "sales_people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_people" ADD CONSTRAINT "sales_people_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
