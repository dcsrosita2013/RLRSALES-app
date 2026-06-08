-- Add the user e-signature (base64 data URL), printed on the PO "Prepared by" block.
ALTER TABLE "User" ADD COLUMN "signature" TEXT;
