/*
  Warnings:

  - You are about to drop the column `commissionType` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `commissionValue` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `salesPersonId` on the `clients` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "clients" DROP CONSTRAINT "clients_salesPersonId_fkey";

-- DropIndex
DROP INDEX "clients_salesPersonId_idx";

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "commissionType",
DROP COLUMN "commissionValue",
DROP COLUMN "salesPersonId";
