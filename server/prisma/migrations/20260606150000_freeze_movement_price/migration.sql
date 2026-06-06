-- Remove the commission-base override (reverted per user).
ALTER TABLE "SalesInvoice" DROP COLUMN "commissionBase";

-- Freeze each stock movement's unit price at the time it happened
-- (Item Cost for IN, Item Sell for OUT) so reports keep old prices when the
-- product's price changes later.
ALTER TABLE "ProductMovement" ADD COLUMN "unitValue" DECIMAL(14,2);

-- Backfill existing rows from the actual transaction where possible:
--  - invoice OUT  -> the invoice line's sell price
UPDATE "ProductMovement" m
SET "unitValue" = ii."unitPrice"
FROM "SalesInvoiceItem" ii
WHERE m."refType" = 'SALES_INVOICE' AND m."type" = 'OUT'
  AND ii."invoiceId" = m."refId" AND ii."productId" = m."productId"
  AND m."unitValue" IS NULL;

--  - PO IN -> the PO line's cost
UPDATE "ProductMovement" m
SET "unitValue" = pi."unitCost"
FROM "PurchaseOrderItem" pi
WHERE m."refType" = 'PURCHASE_ORDER' AND m."type" = 'IN'
  AND pi."poId" = m."refId" AND pi."productId" = m."productId"
  AND m."unitValue" IS NULL;

--  - any remaining IN (initial / adjustment / import) -> current product cost
UPDATE "ProductMovement" m
SET "unitValue" = p."costPrice"
FROM "Product" p
WHERE p."id" = m."productId" AND m."type" <> 'OUT' AND m."unitValue" IS NULL;

--  - any remaining OUT (non-invoice) -> current product sell
UPDATE "ProductMovement" m
SET "unitValue" = p."basePrice"
FROM "Product" p
WHERE p."id" = m."productId" AND m."type" = 'OUT' AND m."unitValue" IS NULL;
