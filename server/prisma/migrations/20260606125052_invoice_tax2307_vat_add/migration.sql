-- AlterEnum
ALTER TYPE "VatClass" ADD VALUE 'VAT_ADD';

-- AlterTable
ALTER TABLE "SalesInvoice" ADD COLUMN     "tax2307" DECIMAL(5,2) NOT NULL DEFAULT 0;
