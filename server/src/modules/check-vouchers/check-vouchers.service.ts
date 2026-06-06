import { Prisma, Role, TermsType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { nextDocumentNumber } from '../../lib/sequence';
import { writeAudit } from '../../lib/audit';
import { ApiError } from '../../middleware/error';

export interface Actor {
  id: string;
  username: string;
  role: Role;
}

export interface CVInput {
  number?: string | null;
  date?: string | Date | null;
  payee: string;
  bank?: string | null;
  checkNumber?: string | null;
  checkDate?: string | Date | null;
  termsType?: TermsType | null;
  amount: number;
  purpose?: string | null;
  supplierId?: string | null;
  poId?: string | null; // pay a specific purchase order
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const toNum = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === 'number' ? d : Number(d);

const include = {
  supplier: { select: { id: true, name: true } },
  supplierPayments: { include: { po: { select: { id: true, number: true } } } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.CheckVoucherInclude;

type CVWithRelations = Prisma.CheckVoucherGetPayload<{ include: typeof include }>;

export function serializeCV(cv: CVWithRelations) {
  const link = cv.supplierPayments[0];
  return {
    id: cv.id,
    number: cv.number,
    date: cv.date,
    payee: cv.payee,
    bank: cv.bank,
    checkNumber: cv.checkNumber,
    checkDate: cv.checkDate,
    termsType: cv.termsType,
    amount: toNum(cv.amount),
    purpose: cv.purpose,
    supplierId: cv.supplierId,
    supplier: cv.supplier ? { id: cv.supplier.id, name: cv.supplier.name } : null,
    poId: link?.poId ?? null,
    poNumber: link?.po?.number ?? null,
    createdBy: cv.createdBy ? { id: cv.createdBy.id, fullName: cv.createdBy.fullName } : null,
    createdAt: cv.createdAt,
  };
}

async function recomputePO(tx: Prisma.TransactionClient, poId: string) {
  const po = await tx.purchaseOrder.findUnique({ where: { id: poId }, select: { total: true } });
  if (!po) return;
  const agg = await tx.supplierPayment.aggregate({ where: { poId }, _sum: { amount: true } });
  const paid = round2(toNum(agg._sum.amount));
  const total = toNum(po.total);
  const status = paid <= 0 ? 'UNPAID' : paid >= total ? 'PAID' : 'PARTIAL';
  await tx.purchaseOrder.update({
    where: { id: poId },
    data: { amountPaid: paid, paymentStatus: status, paidAt: status === 'PAID' ? new Date() : null },
  });
}

export async function createCV(input: CVInput, actor: Actor) {
  let supplierId = input.supplierId ?? null;
  if (input.poId) {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: input.poId } });
    if (!po) throw new ApiError(400, 'Purchase order not found');
    if (po.approvalStatus !== 'APPROVED') throw new ApiError(400, 'Only an approved PO can be paid');
    supplierId = po.supplierId;
  }

  const created = await prisma.$transaction(async (tx) => {
    const number = input.number?.trim() || (await nextDocumentNumber('CHECK_VOUCHER', tx));
    const cv = await tx.checkVoucher.create({
      data: {
        number,
        date: input.date ? new Date(input.date) : new Date(),
        payee: input.payee,
        bank: input.bank ?? null,
        checkNumber: input.checkNumber ?? null,
        checkDate: input.checkDate ? new Date(input.checkDate) : null,
        termsType: input.termsType ?? null,
        amount: input.amount,
        purpose: input.purpose ?? null,
        supplierId,
        createdById: actor.id,
      },
    });

    // Record a supplier payment when this voucher pays a supplier/PO.
    if (input.poId || supplierId) {
      await tx.supplierPayment.create({
        data: {
          date: input.date ? new Date(input.date) : new Date(),
          supplierId,
          poId: input.poId ?? null,
          checkVoucherId: cv.id,
          amount: input.amount,
          method: input.checkNumber ? 'CHECK' : 'CASH',
          notes: input.purpose ?? null,
          createdById: actor.id,
        },
      });
      if (input.poId) await recomputePO(tx, input.poId);
    }

    await writeAudit({ userId: actor.id, username: actor.username, action: 'CREATE', entityType: 'CheckVoucher', entityId: cv.id, details: { number, amount: input.amount, poId: input.poId } }, tx);
    return tx.checkVoucher.findUnique({ where: { id: cv.id }, include });
  });
  return serializeCV(created!);
}

export async function deleteCV(id: string, actor: Actor) {
  const existing = await prisma.checkVoucher.findUnique({ where: { id }, include: { supplierPayments: true } });
  if (!existing) throw new ApiError(404, 'Check voucher not found');
  const poIds = existing.supplierPayments.map((sp) => sp.poId).filter((x): x is string => Boolean(x));
  await prisma.$transaction(async (tx) => {
    await tx.supplierPayment.deleteMany({ where: { checkVoucherId: id } });
    await tx.checkVoucher.delete({ where: { id } });
    for (const poId of poIds) await recomputePO(tx, poId);
    await writeAudit({ userId: actor.id, username: actor.username, action: 'DELETE', entityType: 'CheckVoucher', entityId: id }, tx);
  });
  return { ok: true };
}

export async function getCV(id: string) {
  const cv = await prisma.checkVoucher.findUnique({ where: { id }, include });
  if (!cv) throw new ApiError(404, 'Check voucher not found');
  return serializeCV(cv);
}

export async function listCVs(filters: { q?: string; dateFrom?: string; dateTo?: string }) {
  const where: Prisma.CheckVoucherWhereInput = {};
  if (filters.dateFrom || filters.dateTo) {
    where.date = {};
    if (filters.dateFrom) where.date.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.date.lte = new Date(`${filters.dateTo}T23:59:59`);
  }
  if (filters.q) {
    where.OR = [
      { number: { contains: filters.q, mode: 'insensitive' } },
      { payee: { contains: filters.q, mode: 'insensitive' } },
      { checkNumber: { contains: filters.q, mode: 'insensitive' } },
    ];
  }
  const rows = await prisma.checkVoucher.findMany({
    where,
    orderBy: { date: 'desc' },
    select: { id: true, number: true, date: true, payee: true, checkNumber: true, amount: true },
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    date: r.date,
    payee: r.payee,
    checkNumber: r.checkNumber,
    amount: toNum(r.amount),
  }));
}
