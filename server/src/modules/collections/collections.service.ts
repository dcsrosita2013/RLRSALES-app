import { Prisma, Role, PaymentMethod } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { nextDocumentNumber } from '../../lib/sequence';
import { writeAudit } from '../../lib/audit';
import { ApiError } from '../../middleware/error';

export interface Actor {
  id: string;
  username: string;
  role: Role;
}

export interface CollectionInput {
  number?: string | null;
  date?: string | Date | null;
  customerId: string;
  invoiceId?: string | null;
  amount: number;
  method: PaymentMethod;
  checkNumber?: string | null;
  checkBank?: string | null;
  checkDate?: string | Date | null;
  bankRef?: string | null;
  notes?: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const toNum = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === 'number' ? d : Number(d);

const include = {
  customer: { select: { id: true, name: true } },
  invoice: { select: { id: true, number: true, total: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.CollectionInclude;

type CWithRelations = Prisma.CollectionGetPayload<{ include: typeof include }>;

export function serializeCollection(c: CWithRelations) {
  return {
    id: c.id,
    number: c.number,
    date: c.date,
    customerId: c.customerId,
    customer: c.customer ? { id: c.customer.id, name: c.customer.name } : null,
    invoiceId: c.invoiceId,
    invoiceNumber: c.invoice?.number ?? null,
    amount: toNum(c.amount),
    method: c.method,
    checkNumber: c.checkNumber,
    checkBank: c.checkBank,
    checkDate: c.checkDate,
    bankRef: c.bankRef,
    notes: c.notes,
    createdBy: c.createdBy ? { id: c.createdBy.id, fullName: c.createdBy.fullName } : null,
    createdAt: c.createdAt,
  };
}

// Recompute an invoice's amountPaid/paymentStatus from its collections.
// PAID is only set when an Admin records/confirms full payment (or it was already PAID);
// Finance fully-collecting leaves it PARTIAL pending Admin confirmation.
async function recomputeInvoice(tx: Prisma.TransactionClient, invoiceId: string, actorRole: Role) {
  const inv = await tx.salesInvoice.findUnique({ where: { id: invoiceId }, select: { total: true, paymentStatus: true } });
  if (!inv) return;
  const agg = await tx.collection.aggregate({ where: { invoiceId }, _sum: { amount: true } });
  const paid = round2(toNum(agg._sum.amount));
  const total = toNum(inv.total);
  let status: 'UNPAID' | 'PARTIAL' | 'PAID';
  if (paid <= 0) status = 'UNPAID';
  else if (paid >= total) status = actorRole === 'ADMIN' || inv.paymentStatus === 'PAID' ? 'PAID' : 'PARTIAL';
  else status = 'PARTIAL';
  await tx.salesInvoice.update({
    where: { id: invoiceId },
    data: { amountPaid: paid, paymentStatus: status, paidAt: status === 'PAID' ? new Date() : null },
  });
}

export async function createCollection(input: CollectionInput, actor: Actor) {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new ApiError(400, 'Customer not found');

  if (input.invoiceId) {
    const inv = await prisma.salesInvoice.findUnique({ where: { id: input.invoiceId } });
    if (!inv) throw new ApiError(400, 'Invoice not found');
    if (inv.status !== 'FINALIZED') throw new ApiError(400, 'Payments can only be recorded against a finalized invoice');
    if (inv.customerId !== input.customerId) throw new ApiError(400, 'Invoice belongs to a different customer');
  }

  const created = await prisma.$transaction(async (tx) => {
    const number = input.number?.trim() || (await nextDocumentNumber('COLLECTION', tx));
    const c = await tx.collection.create({
      data: {
        number,
        date: input.date ? new Date(input.date) : new Date(),
        customerId: customer.id,
        invoiceId: input.invoiceId ?? null,
        amount: input.amount,
        method: input.method,
        checkNumber: input.checkNumber ?? null,
        checkBank: input.checkBank ?? null,
        checkDate: input.checkDate ? new Date(input.checkDate) : null,
        bankRef: input.bankRef ?? null,
        notes: input.notes ?? null,
        createdById: actor.id,
      },
      include,
    });
    if (input.invoiceId) await recomputeInvoice(tx, input.invoiceId, actor.role);
    await writeAudit({ userId: actor.id, username: actor.username, action: 'CREATE', entityType: 'Collection', entityId: c.id, details: { number, amount: input.amount, invoiceId: input.invoiceId } }, tx);
    return c;
  });
  return serializeCollection(created);
}

export async function deleteCollection(id: string, actor: Actor) {
  const existing = await prisma.collection.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Collection not found');
  await prisma.$transaction(async (tx) => {
    await tx.collection.delete({ where: { id } });
    if (existing.invoiceId) await recomputeInvoice(tx, existing.invoiceId, actor.role);
    await writeAudit({ userId: actor.id, username: actor.username, action: 'DELETE', entityType: 'Collection', entityId: id }, tx);
  });
  return { ok: true };
}

export async function getCollection(id: string) {
  const c = await prisma.collection.findUnique({ where: { id }, include });
  if (!c) throw new ApiError(404, 'Collection not found');
  return serializeCollection(c);
}

export async function listCollections(filters: { q?: string; customerId?: string; invoiceId?: string; method?: string; dateFrom?: string; dateTo?: string }) {
  const where: Prisma.CollectionWhereInput = {};
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.invoiceId) where.invoiceId = filters.invoiceId;
  if (filters.method) where.method = filters.method as PaymentMethod;
  if (filters.dateFrom || filters.dateTo) {
    where.date = {};
    if (filters.dateFrom) where.date.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.date.lte = new Date(`${filters.dateTo}T23:59:59`);
  }
  if (filters.q) {
    where.OR = [
      { number: { contains: filters.q, mode: 'insensitive' } },
      { checkNumber: { contains: filters.q, mode: 'insensitive' } },
    ];
  }
  const rows = await prisma.collection.findMany({
    where,
    orderBy: { date: 'desc' },
    include: { customer: { select: { name: true } }, invoice: { select: { number: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    date: r.date,
    customerName: r.customer?.name ?? '',
    invoiceNumber: r.invoice?.number ?? null,
    amount: toNum(r.amount),
    method: r.method,
  }));
}
