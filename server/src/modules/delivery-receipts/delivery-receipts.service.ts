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

export interface DRItemInput {
  productId?: string | null;
  description: string;
  qty: number;
  unit: string;
}

export interface DRInput {
  number?: string | null;
  date?: string | Date | null;
  poNumber?: string | null;
  customerId: string;
  agentId?: string | null;
  termsType: TermsType;
  netDays?: number | null;
  invoiceId?: string | null;
  notes?: string | null;
  items: DRItemInput[];
}

const toNum = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === 'number' ? d : Number(d);

const drInclude = {
  items: true,
  customer: { select: { id: true, name: true } },
  agent: { select: { id: true, name: true } },
  invoice: { select: { id: true, number: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.DeliveryReceiptInclude;

type DRWithRelations = Prisma.DeliveryReceiptGetPayload<{ include: typeof drInclude }>;

export function serializeDR(dr: DRWithRelations) {
  return {
    id: dr.id,
    number: dr.number,
    date: dr.date,
    poNumber: dr.poNumber,
    customerId: dr.customerId,
    customerName: dr.customerName,
    customer: dr.customer ? { id: dr.customer.id, name: dr.customer.name } : null,
    agentId: dr.agentId,
    agent: dr.agent ? { id: dr.agent.id, name: dr.agent.name } : null,
    termsType: dr.termsType,
    netDays: dr.netDays,
    invoiceId: dr.invoiceId,
    invoiceNumber: dr.invoice?.number ?? null,
    notes: dr.notes,
    createdBy: dr.createdBy ? { id: dr.createdBy.id, fullName: dr.createdBy.fullName } : null,
    createdAt: dr.createdAt,
    items: dr.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      description: it.description,
      qty: toNum(it.qty),
      unit: it.unit,
    })),
  };
}

async function buildItems(client: Prisma.TransactionClient, items: DRItemInput[]) {
  const ids = items.filter((i) => i.productId).map((i) => i.productId as string);
  const products = ids.length ? await client.product.findMany({ where: { id: { in: ids } } }) : [];
  const map = new Map(products.map((p) => [p.id, p]));
  return items.map((i) => {
    const p = i.productId ? map.get(i.productId) : undefined;
    if (i.productId && !p) throw new ApiError(400, 'A selected product no longer exists');
    return {
      productId: i.productId ?? null,
      description: (i.description ?? '').trim() || p?.name || 'Item',
      qty: i.qty,
      unit: i.unit || p?.unit || 'pc',
    };
  });
}

async function loadOrThrow(id: string) {
  const dr = await prisma.deliveryReceipt.findUnique({ where: { id }, include: drInclude });
  if (!dr) throw new ApiError(404, 'Delivery receipt not found');
  return dr;
}

export async function createDR(input: DRInput, actor: Actor) {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new ApiError(400, 'Customer not found');

  const created = await prisma.$transaction(async (tx) => {
    const items = await buildItems(tx, input.items);
    const number = input.number?.trim() || (await nextDocumentNumber('DELIVERY_RECEIPT', tx));
    const dr = await tx.deliveryReceipt.create({
      data: {
        number,
        date: input.date ? new Date(input.date) : new Date(),
        poNumber: input.poNumber ?? null,
        customerId: customer.id,
        customerName: customer.name,
        agentId: input.agentId ?? null,
        termsType: input.termsType,
        netDays: input.termsType === 'NET' ? input.netDays ?? null : null,
        invoiceId: input.invoiceId ?? null,
        notes: input.notes ?? null,
        createdById: actor.id,
        items: { create: items },
      },
      include: drInclude,
    });
    await writeAudit({ userId: actor.id, username: actor.username, action: 'CREATE', entityType: 'DeliveryReceipt', entityId: dr.id, details: { number } }, tx);
    return dr;
  });
  return serializeDR(created);
}

export async function updateDR(id: string, input: DRInput, actor: Actor) {
  const existing = await loadOrThrow(id);
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new ApiError(400, 'Customer not found');

  const updated = await prisma.$transaction(async (tx) => {
    const items = await buildItems(tx, input.items);
    await tx.deliveryReceipt.update({
      where: { id },
      data: {
        number: input.number?.trim() || existing.number,
        date: input.date ? new Date(input.date) : existing.date,
        poNumber: input.poNumber ?? null,
        customerId: customer.id,
        customerName: customer.name,
        agentId: input.agentId ?? null,
        termsType: input.termsType,
        netDays: input.termsType === 'NET' ? input.netDays ?? null : null,
        invoiceId: input.invoiceId ?? null,
        notes: input.notes ?? null,
        items: { deleteMany: {}, create: items },
      },
    });
    await writeAudit({ userId: actor.id, username: actor.username, action: 'UPDATE', entityType: 'DeliveryReceipt', entityId: id }, tx);
    return tx.deliveryReceipt.findUnique({ where: { id }, include: drInclude });
  });
  return serializeDR(updated!);
}

export async function deleteDR(id: string, actor: Actor) {
  const existing = await loadOrThrow(id);
  if (actor.role !== 'ADMIN' && existing.createdById !== actor.id) {
    throw new ApiError(403, 'You can only delete delivery receipts you created');
  }
  await prisma.deliveryReceipt.delete({ where: { id } });
  await writeAudit({ userId: actor.id, username: actor.username, action: 'DELETE', entityType: 'DeliveryReceipt', entityId: id });
  return { ok: true };
}

export async function getDR(id: string) {
  return serializeDR(await loadOrThrow(id));
}

export async function listDRs(filters: { q?: string; customerId?: string; dateFrom?: string; dateTo?: string }) {
  const where: Prisma.DeliveryReceiptWhereInput = {};
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.dateFrom || filters.dateTo) {
    where.date = {};
    if (filters.dateFrom) where.date.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.date.lte = new Date(`${filters.dateTo}T23:59:59`);
  }
  if (filters.q) {
    where.OR = [
      { number: { contains: filters.q, mode: 'insensitive' } },
      { customerName: { contains: filters.q, mode: 'insensitive' } },
      { poNumber: { contains: filters.q, mode: 'insensitive' } },
    ];
  }
  const rows = await prisma.deliveryReceipt.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      number: true,
      date: true,
      customerName: true,
      poNumber: true,
      invoice: { select: { number: true } },
      _count: { select: { items: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    date: r.date,
    customerName: r.customerName,
    poNumber: r.poNumber,
    invoiceNumber: r.invoice?.number ?? null,
    itemCount: r._count.items,
  }));
}
