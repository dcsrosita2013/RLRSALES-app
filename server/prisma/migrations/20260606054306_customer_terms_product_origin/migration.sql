-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "netDays" INTEGER,
ADD COLUMN     "termsType" "TermsType" NOT NULL DEFAULT 'COD';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'Philippines';
