import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// Dev helper: reverses PO-received stock, wipes all purchase orders + their
// movements, and resets the PURCHASE_ORDER number sequence. Test data only.
const prisma = new PrismaClient();

async function main() {
  if (process.env.RLR_ALLOW_DESTRUCTIVE !== 'yes') {
    console.error('REFUSING: this deletes ALL purchase orders. This is a dev/test-only tool.');
    console.error('If you are sure (e.g. a throwaway test DB), re-run with RLR_ALLOW_DESTRUCTIVE=yes');
    process.exit(1);
  }
  const ins = await prisma.productMovement.findMany({ where: { refType: 'PURCHASE_ORDER' } });
  for (const m of ins) {
    if (m.stockLocationId) {
      await prisma.stockLocation
        .update({ where: { id: m.stockLocationId }, data: { quantity: { decrement: Number(m.quantity) } } })
        .catch(() => undefined);
    }
  }
  await prisma.productMovement.deleteMany({ where: { refType: 'PURCHASE_ORDER' } });
  const del = await prisma.purchaseOrder.deleteMany({});
  await prisma.documentSequence.update({ where: { docType: 'PURCHASE_ORDER' }, data: { nextNumber: 1 } });
  // eslint-disable-next-line no-console
  console.log(`cleaned ${del.count} PO(s), reversed PO stock, reset PO sequence`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
