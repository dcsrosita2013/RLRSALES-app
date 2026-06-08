import { Prisma, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { nextDocumentNumber } from '../../lib/sequence';
import { writeAudit } from '../../lib/audit';
import { ApiError } from '../../middleware/error';
import { createInvoice } from '../invoices/invoices.service';

export interface Actor {
  id: string;
  username: string;
  role: Role;
}

export interface QuotationItemInput {
  productId?: string | null;
  description: string;
  qty: number;
  unit: string;
  markupOption?: string | null;
  unitPrice: number;
}

export interface QuotationInput {
  number?: string | null;
  date?: string | Date | null;
  customerId: string;
  attention?: string | null;
  department?: string | null;
  prNumber?: string | null;
  agentId?: string | null;
  validUntil?: string | Date | null;
  notes?: string | null;
  items: QuotationItemInput[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const toNum = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === 'number' ? d : Number(d);

const include = {
  items: { include: { product: { select: { brand: { select: { name: true } } } } } },
  customer: { select: { id: true, name: true, address: true, tin: true, contactNumber: true, vatClass: true, termsType: true, netDays: true } },
  agent: { select: { id: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.QuotationInclude;

type QWithRelations = Prisma.QuotationGetPayload<{ include: typeof include }>;

export function serializeQuotation(q: QWithRelations) {
  return {
    id: q.id,
    number: q.number,
    date: q.date,
    customerId: q.customerId,
    customerName: q.customerName,
    attention: q.attention,
    department: q.department,
    prNumber: q.prNumber,
    customer: q.customer
      ? {
          id: q.customer.id,
          name: q.customer.name,
          address: q.customer.address,
          tin: q.customer.tin,
          contactNumber: q.customer.contactNumber,
          vatClass: q.customer.vatClass,
          termsType: q.customer.termsType,
          netDays: q.customer.netDays,
        }
      : null,
    agentId: q.agentId,
    agent: q.agent ? { id: q.agent.id, name: q.agent.name } : null,
    validUntil: q.validUntil,
    notes: q.notes,
    subtotal: toNum(q.subtotal),
    total: toNum(q.total),
    convertedInvoiceId: q.convertedInvoiceId,
    createdBy: q.createdBy ? { id: q.createdBy.id, fullName: q.createdBy.fullName } : null,
    createdAt: q.createdAt,
    items: q.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      description: it.description,
      brand: it.product?.brand?.name ?? '',
      qty: toNum(it.qty),
      unit: it.unit,
      markupOption: it.markupOption,
      unitPrice: toNum(it.unitPrice),
      lineTotal: toNum(it.lineTotal),
    })),
  };
}

async function buildLines(client: Prisma.TransactionClient, items: QuotationItemInput[]) {
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
      markupOption: i.markupOption ?? null,
      unitPrice: i.unitPrice,
      lineTotal: round2(i.qty * i.unitPrice),
    };
  });
}

function totals(lines: { lineTotal: number }[]) {
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  return { subtotal, total: subtotal };
}

async function loadOrThrow(id: string) {
  const q = await prisma.quotation.findUnique({ where: { id }, include });
  if (!q) throw new ApiError(404, 'Quotation not found');
  return q;
}

export async function createQuotation(input: QuotationInput, actor: Actor) {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new ApiError(400, 'Customer not found');
  const created = await prisma.$transaction(async (tx) => {
    const lines = await buildLines(tx, input.items);
    const number = input.number?.trim() || (await nextDocumentNumber('QUOTATION', tx));
    const q = await tx.quotation.create({
      data: {
        number,
        date: input.date ? new Date(input.date) : new Date(),
        customerId: customer.id,
        customerName: customer.name,
        attention: input.attention ?? null,
        department: input.department ?? null,
        prNumber: input.prNumber ?? null,
        agentId: input.agentId ?? null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        notes: input.notes ?? null,
        ...totals(lines),
        createdById: actor.id,
        items: { create: lines },
      },
    });
    await writeAudit({ userId: actor.id, username: actor.username, action: 'CREATE', entityType: 'Quotation', entityId: q.id, details: { number } }, tx);
    return q;
  });
  // Re-read with relations OUTSIDE the transaction (deep include inside an interactive
  // transaction on the connection pooler triggers Prisma P2028).
  return getQuotation(created.id);
}

export async function updateQuotation(id: string, input: QuotationInput, actor: Actor) {
  const existing = await loadOrThrow(id);
  if (existing.convertedInvoiceId) throw new ApiError(400, 'This quotation was already converted to an invoice and cannot be edited');
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new ApiError(400, 'Customer not found');
  await prisma.$transaction(async (tx) => {
    const lines = await buildLines(tx, input.items);
    await tx.quotation.update({
      where: { id },
      data: {
        number: input.number?.trim() || existing.number,
        date: input.date ? new Date(input.date) : existing.date,
        customerId: customer.id,
        customerName: customer.name,
        attention: input.attention ?? null,
        department: input.department ?? null,
        prNumber: input.prNumber ?? null,
        agentId: input.agentId ?? null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        notes: input.notes ?? null,
        ...totals(lines),
        items: { deleteMany: {}, create: lines },
      },
    });
    await writeAudit({ userId: actor.id, username: actor.username, action: 'UPDATE', entityType: 'Quotation', entityId: id }, tx);
  });
  return getQuotation(id);
}

export async function deleteQuotation(id: string, actor: Actor) {
  await loadOrThrow(id);
  await prisma.quotation.delete({ where: { id } });
  await writeAudit({ userId: actor.id, username: actor.username, action: 'DELETE', entityType: 'Quotation', entityId: id });
  return { ok: true };
}

export async function getQuotation(id: string) {
  return serializeQuotation(await loadOrThrow(id));
}

export async function listQuotations(filters: { q?: string; dateFrom?: string; dateTo?: string }) {
  const where: Prisma.QuotationWhereInput = {};
  if (filters.dateFrom || filters.dateTo) {
    where.date = {};
    if (filters.dateFrom) where.date.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.date.lte = new Date(`${filters.dateTo}T23:59:59`);
  }
  if (filters.q) {
    where.OR = [
      { number: { contains: filters.q, mode: 'insensitive' } },
      { customerName: { contains: filters.q, mode: 'insensitive' } },
    ];
  }
  const rows = await prisma.quotation.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: { id: true, number: true, date: true, customerName: true, total: true, validUntil: true, convertedInvoiceId: true },
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    date: r.date,
    customerName: r.customerName,
    total: toNum(r.total),
    validUntil: r.validUntil,
    converted: Boolean(r.convertedInvoiceId),
  }));
}

// Convert a quotation into a DRAFT sales invoice.
export async function convertToInvoice(id: string, actor: Actor) {
  const q = await loadOrThrow(id);
  if (q.convertedInvoiceId) throw new ApiError(400, 'This quotation was already converted');
  const customer = await prisma.customer.findUnique({ where: { id: q.customerId } });
  if (!customer) throw new ApiError(400, 'Customer no longer exists');

  const invoice = await createInvoice(
    {
      customerId: q.customerId,
      termsType: 'COD',
      agentId: q.agentId,
      addVat: customer.vatClass === 'VAT',
      discount: 0,
      items: q.items.map((it) => ({
        productId: it.productId,
        description: it.description,
        qty: toNum(it.qty),
        unit: it.unit,
        unitPrice: toNum(it.unitPrice),
      })),
    },
    actor,
  );
  await prisma.quotation.update({ where: { id }, data: { convertedInvoiceId: invoice.id } });
  await writeAudit({ userId: actor.id, username: actor.username, action: 'CONVERT', entityType: 'Quotation', entityId: id, details: { invoiceId: invoice.id } });
  return invoice;
}
