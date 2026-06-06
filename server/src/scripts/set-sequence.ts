import 'dotenv/config';
import { PrismaClient, DocType } from '@prisma/client';

// Admin utility: set the next auto-number for a document type.
// Useful when migrating an existing business — e.g. continue your invoice series:
//   npm run set-seq -- INVOICE 5235      (next auto invoice becomes INV-05235)
//   npm run set-seq -- DELIVERY_RECEIPT 1
const prisma = new PrismaClient();

async function main() {
  const [docTypeArg, numArg] = process.argv.slice(2);
  const valid = Object.values(DocType);
  if (!docTypeArg || !valid.includes(docTypeArg as DocType)) {
    console.error(`Usage: npm run set-seq -- <${valid.join('|')}> <nextNumber>`);
    process.exit(1);
  }
  const n = parseInt(numArg, 10);
  if (!Number.isInteger(n) || n < 1) {
    console.error('nextNumber must be a positive integer');
    process.exit(1);
  }
  const seq = await prisma.documentSequence.update({
    where: { docType: docTypeArg as DocType },
    data: { nextNumber: n },
  });
  // eslint-disable-next-line no-console
  console.log(`${seq.docType}: next auto-number -> ${seq.prefix}${String(n).padStart(seq.padding, '0')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
