import { Prisma, DocType } from '@prisma/client';
import { prisma } from './prisma';
import { ApiError } from '../middleware/error';

// Atomically reserves and formats the next document number for a type,
// e.g. INV-00001. Pass a transaction client so numbering is rolled back
// with the document if the surrounding transaction fails.
export async function nextDocumentNumber(
  docType: DocType,
  client: Prisma.TransactionClient = prisma,
): Promise<string> {
  const seq = await client.documentSequence.findUnique({ where: { docType } });
  if (!seq) {
    throw new ApiError(500, `Document sequence not configured for ${docType}. Run the seed.`);
  }
  // increment returns the post-update row; the reserved value is the prior number.
  const updated = await client.documentSequence.update({
    where: { docType },
    data: { nextNumber: { increment: 1 } },
  });
  const reserved = updated.nextNumber - 1;
  return `${seq.prefix}${String(reserved).padStart(seq.padding, '0')}`;
}
