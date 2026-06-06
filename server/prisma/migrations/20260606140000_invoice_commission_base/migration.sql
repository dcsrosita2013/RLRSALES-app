-- Replace the per-invoice 2307 % field with an absolute commission base (₱).
-- AlterTable
ALTER TABLE "SalesInvoice" DROP COLUMN "tax2307",
ADD COLUMN     "commissionBase" DECIMAL(14,2) NOT NULL DEFAULT 0;
