-- Add quotation header fields (Attention / Department / PR Number) for the printed Product Quotation.
ALTER TABLE "Quotation" ADD COLUMN "attention" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "department" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "prNumber" TEXT;
