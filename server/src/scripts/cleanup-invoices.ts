import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// Dev helper: wipes all sales invoices + their stock movements and resets the
// INVOICE number sequence. For clearing test data only.
const prisma = new PrismaClient();

async function main() {
  if (process.env.RLR_ALLOW_DESTRUCTIVE !== 'yes') {
    console.error('REFUSING: this deletes ALL invoices. This is a dev/test-only tool.');
    console.error('If you are sure (e.g. a throwaway test DB), re-run with RLR_ALLOW_DESTRUCTIVE=yes');
    process.exit(1);
  }
  await prisma.productMovement.deleteMany({ where: { refType: { in: ['SALES_INVOICE', 'SALES_INVOICE_REVERSAL'] } } });
  const del = await prisma.salesInvoice.deleteMany({});
  await prisma.documentSequence.update({ where: { docType: 'INVOICE' }, data: { nextNumber: 1 } });
  // eslint-disable-next-line no-console
  console.log(`cleaned ${del.count} invoice(s) + reset INVOICE sequence to 1`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
