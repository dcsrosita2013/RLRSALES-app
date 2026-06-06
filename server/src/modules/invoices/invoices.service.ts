import { Prisma, Role, VatClass, TermsType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { nextDocumentNumber } from '../../lib/sequence';
import { writeAudit } from '../../lib/audit';
import { verifyPassword } from '../../lib/password';
import { ApiError } from '../../middleware/error';

const VAT_RATE = 0.12;

export interface Actor {
  id: string;
  username: string;
  role: Role;
}

export interface InvoiceItemInput {
  productId?: string | null;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

export interface InvoiceInput {
  customerId: string;
  number?: string | null;
  date?: string | Date | null;
  termsType: TermsType;
  netDays?: number | null;
  poNumber?: string | null;
  agentId?: string | null;
  addVat: boolean;
  discount: number;
  items: InvoiceItemInput[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const toNum = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === 'number' ? d : Number(d);

const invoiceInclude = {
  items: true,
  customer: { select: { id: true, name: true } },
  agent: { select: { id: true, name: true } },
  createdBy: { select: { id: true, username: true, fullName: true } },
} satisfies Prisma.SalesInvoiceInclude;

type InvoiceWithRelations = Prisma.SalesInvoiceGetPayload<{ include: typeof invoiceInclude }>;

// ---- VAT / totals ----
interface ComputedLine {
  productId: string | null;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
}

export function computeTotals(vatClass: VatClass, addVat: boolean, discount: number, lines: ComputedLine[]) {
  const subtotal = round2(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0));
  const discountClamped = round2(Math.min(Math.max(discount, 0), subtotal));
  const net = round2(subtotal - discountClamped);

  let vatableSales = 0;
  let zeroRatedSales = 0;
  let vatExemptSales = 0;
  let vatAmount = 0;
  let total = net;

  if (vatClass === 'VAT') {
    vatableSales = net;
    if (addVat) {
      vatAmount = round2(net * VAT_RATE);
      total = round2(net + vatAmount);
    }
  } else if (vatClass === 'VAT_ADD') {
    // Add VAT: always add 12% on top (VAT-exclusive pricing).
    vatableSales = net;
    vatAmount = round2(net * VAT_RATE);
    total = round2(net + vatAmount);
  } else if (vatClass === 'ZERO_RATED') {
    zeroRatedSales = net;
  } else {
    vatExemptSales = net;
  }

  const totalCost = round2(lines.reduce((s, l) => s + l.qty * l.unitCost, 0));
  return { subtotal, discount: discountClamped, vatableSales, zeroRatedSales, vatExemptSales, vatAmount, total, totalCost };
}

async function buildLines(client: Prisma.TransactionClient, items: InvoiceItemInput[]): Promise<ComputedLine[]> {
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
      unitPrice: i.unitPrice,
      unitCost: p ? toNum(p.costPrice) : 0,
      lineTotal: round2(i.qty * i.unitPrice),
    };
  });
}

export function serializeInvoice(inv: InvoiceWithRelations) {
  return {
    id: inv.id,
    number: inv.number,
    date: inv.date,
    customerId: inv.customerId,
    customerName: inv.customerName,
    customerTin: inv.customerTin,
    vatClass: inv.vatClass,
    termsType: inv.termsType,
    netDays: inv.netDays,
    poNumber: inv.poNumber,
    agentId: inv.agentId,
    agent: inv.agent ? { id: inv.agent.id, name: inv.agent.name } : null,
    addVat: inv.addVat,
    subtotal: toNum(inv.subtotal),
    discount: toNum(inv.discount),
    vatableSales: toNum(inv.vatableSales),
    zeroRatedSales: toNum(inv.zeroRatedSales),
    vatExemptSales: toNum(inv.vatExemptSales),
    vatAmount: toNum(inv.vatAmount),
    total: toNum(inv.total),
    totalCost: toNum(inv.totalCost),
    status: inv.status,
    paymentStatus: inv.paymentStatus,
    amountPaid: toNum(inv.amountPaid),
    createdBy: inv.createdBy ? { id: inv.createdBy.id, fullName: inv.createdBy.fullName } : null,
    finalizedAt: inv.finalizedAt,
    voidedAt: inv.voidedAt,
    paidAt: inv.paidAt,
    createdAt: inv.createdAt,
    items: inv.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      description: it.description,
      qty: toNum(it.qty),
      unit: it.unit,
      unitPrice: toNum(it.unitPrice),
      lineTotal: toNum(it.lineTotal),
    })),
  };
}

// ---- Stock helpers ----
async function deductStock(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  invoiceNumber: string,
  lines: ComputedLine[],
  actor: Actor,
) {
  const needed = new Map<string, number>();
  const priceByPid = new Map<string, number>(); // sell price per product, to freeze on the OUT movement
  for (const l of lines) {
    if (l.productId && l.qty > 0) {
      needed.set(l.productId, (needed.get(l.productId) ?? 0) + l.qty);
      priceByPid.set(l.productId, l.unitPrice);
    }
  }
  if (needed.size === 0) return;

  const products = await tx.product.findMany({
    where: { id: { in: [...needed.keys()] } },
    include: { stocks: { orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }] } },
  });
  const pmap = new Map(products.map((p) => [p.id, p]));

  const shortages: string[] = [];
  for (const [pid, qty] of needed) {
    const p = pmap.get(pid);
    const avail = p ? p.stocks.reduce((s, loc) => s + toNum(loc.quantity), 0) : 0;
    if (!p || avail < qty) shortages.push(`${p?.name ?? 'Unknown item'} (need ${qty}, have ${avail})`);
  }
  if (shortages.length) {
    throw new ApiError(400, `Insufficient stock to finalize: ${shortages.join('; ')}`);
  }

  for (const [pid, qty] of needed) {
    const p = pmap.get(pid)!;
    let remaining = qty;
    for (const loc of p.stocks) {
      if (remaining <= 0) break;
      const locQty = toNum(loc.quantity);
      const take = Math.min(remaining, locQty);
      if (take <= 0) continue;
      await tx.stockLocation.update({ where: { id: loc.id }, data: { quantity: round2(locQty - take) } });
      await tx.productMovement.create({
        data: {
          productId: pid,
          stockLocationId: loc.id,
          type: 'OUT',
          quantity: take,
          unitValue: priceByPid.get(pid) ?? null,
          refType: 'SALES_INVOICE',
          refId: invoiceId,
          refNumber: invoiceNumber,
          note: 'Invoice finalized',
          createdById: actor.id,
        },
      });
      remaining -= take;
    }
  }
}

// Returns any still-deducted stock for an invoice (used on void and before re-deducting on edit).
async function returnStock(tx: Prisma.TransactionClient, invoiceId: string, actor: Actor) {
  const outs = await tx.productMovement.findMany({ where: { refType: 'SALES_INVOICE', refId: invoiceId } });
  const ins = await tx.productMovement.findMany({ where: { refType: 'SALES_INVOICE_REVERSAL', refId: invoiceId } });
  const net = new Map<string, { productId: string; qty: number }>();
  for (const m of outs) {
    if (!m.stockLocationId) continue;
    const e = net.get(m.stockLocationId) ?? { productId: m.productId, qty: 0 };
    e.qty += toNum(m.quantity);
    net.set(m.stockLocationId, e);
  }
  for (const m of ins) {
    if (!m.stockLocationId) continue;
    const e = net.get(m.stockLocationId) ?? { productId: m.productId, qty: 0 };
    e.qty -= toNum(m.quantity);
    net.set(m.stockLocationId, e);
  }
  const costByPid = new Map(
    (
      await tx.product.findMany({
        where: { id: { in: [...new Set([...net.values()].map((e) => e.productId))] } },
        select: { id: true, costPrice: true },
      })
    ).map((p) => [p.id, toNum(p.costPrice)]),
  );
  for (const [locId, e] of net) {
    if (e.qty <= 0) continue;
    const loc = await tx.stockLocation.findUnique({ where: { id: locId } });
    if (!loc) continue; // location was removed; cannot return there
    await tx.stockLocation.update({ where: { id: locId }, data: { quantity: round2(toNum(loc.quantity) + e.qty) } });
    await tx.productMovement.create({
      data: {
        productId: e.productId,
        stockLocationId: locId,
        type: 'IN',
        quantity: e.qty,
        unitValue: costByPid.get(e.productId) ?? null,
        refType: 'SALES_INVOICE_REVERSAL',
        refId: invoiceId,
        note: 'Stock returned',
        createdById: actor.id,
      },
    });
  }
}

// ---- Permissions ----
function assertCanEdit(invoice: { status: string; createdById: string | null }, actor: Actor) {
  if (invoice.status === 'VOID') throw new ApiError(400, 'Voided invoices cannot be edited');
  if (invoice.status === 'FINALIZED' && actor.role !== 'ADMIN') {
    throw new ApiError(403, 'This invoice is finalized — only an Admin can edit it');
  }
  if (invoice.status === 'DRAFT') {
    const ok = actor.role === 'ADMIN' || (actor.role === 'AGENT' && invoice.createdById === actor.id);
    if (!ok) throw new ApiError(403, 'You cannot edit this invoice');
  }
}

// ---- CRUD / lifecycle ----
async function loadOrThrow(id: string) {
  const inv = await prisma.salesInvoice.findUnique({ where: { id }, include: invoiceInclude });
  if (!inv) throw new ApiError(404, 'Invoice not found');
  return inv;
}

export async function createInvoice(input: InvoiceInput, actor: Actor) {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new ApiError(400, 'Customer not found');

  // Credit the sale to the creating agent when no agent is explicitly chosen.
  let agentId = input.agentId ?? null;
  if (!agentId && actor.role === 'AGENT') {
    const u = await prisma.user.findUnique({ where: { id: actor.id }, select: { agentId: true } });
    agentId = u?.agentId ?? null;
  }

  const lines = await buildLines(prisma, input.items);
  const totals = computeTotals(customer.vatClass, input.addVat, input.discount, lines);

  const created = await prisma.salesInvoice.create({
    data: {
      number: input.number ?? null,
      date: input.date ? new Date(input.date) : new Date(),
      customerId: customer.id,
      customerName: customer.name,
      customerTin: customer.tin,
      vatClass: customer.vatClass,
      termsType: input.termsType,
      netDays: input.termsType === 'NET' ? input.netDays ?? null : null,
      poNumber: input.poNumber ?? null,
      agentId,
      addVat: customer.vatClass === 'VAT_ADD' ? true : input.addVat,
      ...totals,
      status: 'DRAFT',
      paymentStatus: 'UNPAID',
      createdById: actor.id,
      items: { create: lines },
    },
    include: invoiceInclude,
  });
  await writeAudit({ userId: actor.id, username: actor.username, action: 'CREATE', entityType: 'SalesInvoice', entityId: created.id });
  return serializeInvoice(created);
}

export async function updateInvoice(id: string, input: InvoiceInput, actor: Actor) {
  const existing = await loadOrThrow(id);
  assertCanEdit(existing, actor);

  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new ApiError(400, 'Customer not found');

  const updated = await prisma.$transaction(async (tx) => {
    const lines = await buildLines(tx, input.items);
    const totals = computeTotals(customer.vatClass, input.addVat, input.discount, lines);

    // For a finalized invoice, reverse the old stock then re-deduct the new lines.
    if (existing.status === 'FINALIZED') {
      await returnStock(tx, id, actor);
    }

    await tx.salesInvoice.update({
      where: { id },
      data: {
        number: input.number ?? null,
        date: input.date ? new Date(input.date) : existing.date,
        customerId: customer.id,
        customerName: customer.name,
        customerTin: customer.tin,
        vatClass: customer.vatClass,
        termsType: input.termsType,
        netDays: input.termsType === 'NET' ? input.netDays ?? null : null,
        poNumber: input.poNumber ?? null,
        agentId: input.agentId ?? null,
        addVat: customer.vatClass === 'VAT_ADD' ? true : input.addVat,
        ...totals,
        items: { deleteMany: {}, create: lines },
      },
    });

    if (existing.status === 'FINALIZED') {
      await deductStock(tx, id, existing.number ?? '', lines, actor);
    }

    await writeAudit({ userId: actor.id, username: actor.username, action: 'UPDATE', entityType: 'SalesInvoice', entityId: id }, tx);
    return tx.salesInvoice.findUnique({ where: { id }, include: invoiceInclude });
  });
  return serializeInvoice(updated!);
}

export async function finalizeInvoice(id: string, actor: Actor) {
  const existing = await loadOrThrow(id);
  const canFinalize = actor.role === 'ADMIN' || (actor.role === 'AGENT' && existing.createdById === actor.id);
  if (!canFinalize) throw new ApiError(403, 'You cannot finalize this invoice');
  if (existing.status !== 'DRAFT') throw new ApiError(400, `Invoice is already ${existing.status.toLowerCase()}`);
  if (existing.items.length === 0) throw new ApiError(400, 'Cannot finalize an invoice with no line items');

  const updated = await prisma.$transaction(async (tx) => {
    // Keep a manually-entered number; otherwise pull the next auto number.
    const number = existing.number ?? (await nextDocumentNumber('INVOICE', tx));
    const lines: ComputedLine[] = existing.items.map((it) => ({
      productId: it.productId,
      description: it.description,
      qty: toNum(it.qty),
      unit: it.unit,
      unitPrice: toNum(it.unitPrice),
      unitCost: toNum(it.unitCost),
      lineTotal: toNum(it.lineTotal),
    }));
    await deductStock(tx, id, number, lines, actor);
    await tx.salesInvoice.update({ where: { id }, data: { status: 'FINALIZED', number, finalizedAt: new Date() } });
    await writeAudit({ userId: actor.id, username: actor.username, action: 'FINALIZE', entityType: 'SalesInvoice', entityId: id, details: { number } }, tx);
    return tx.salesInvoice.findUnique({ where: { id }, include: invoiceInclude });
  });
  return serializeInvoice(updated!);
}

export async function voidInvoice(id: string, actor: Actor) {
  const existing = await loadOrThrow(id);
  if (existing.status !== 'FINALIZED') throw new ApiError(400, 'Only a finalized invoice can be voided');

  const updated = await prisma.$transaction(async (tx) => {
    await returnStock(tx, id, actor);
    await tx.salesInvoice.update({ where: { id }, data: { status: 'VOID', voidedAt: new Date() } });
    await writeAudit({ userId: actor.id, username: actor.username, action: 'VOID', entityType: 'SalesInvoice', entityId: id }, tx);
    return tx.salesInvoice.findUnique({ where: { id }, include: invoiceInclude });
  });
  return serializeInvoice(updated!);
}

export async function setPaymentStatus(id: string, paid: boolean, actor: Actor) {
  const existing = await loadOrThrow(id);
  if (existing.status !== 'FINALIZED') throw new ApiError(400, 'Only a finalized invoice can be marked paid/unpaid');

  const updated = await prisma.salesInvoice.update({
    where: { id },
    data: paid
      ? { paymentStatus: 'PAID', amountPaid: existing.total, paidAt: new Date() }
      : { paymentStatus: 'UNPAID', amountPaid: 0, paidAt: null },
    include: invoiceInclude,
  });
  await writeAudit({ userId: actor.id, username: actor.username, action: paid ? 'MARK_PAID' : 'MARK_UNPAID', entityType: 'SalesInvoice', entityId: id });
  return serializeInvoice(updated);
}

export async function deleteInvoice(id: string, actor: Actor) {
  const existing = await loadOrThrow(id);
  if (existing.status !== 'DRAFT') throw new ApiError(400, 'Only draft invoices can be deleted. Void a finalized invoice instead.');
  const ok = actor.role === 'ADMIN' || (actor.role === 'AGENT' && existing.createdById === actor.id);
  if (!ok) throw new ApiError(403, 'You cannot delete this invoice');
  await prisma.salesInvoice.delete({ where: { id } });
  await writeAudit({ userId: actor.id, username: actor.username, action: 'DELETE', entityType: 'SalesInvoice', entityId: id });
  return { ok: true };
}

// Admin-only permanent delete of ANY invoice (draft/finalized/void), guarded by
// password re-entry. Returns deducted stock and detaches linked records first.
export async function forceDeleteInvoice(id: string, password: string, actor: Actor) {
  if (actor.role !== 'ADMIN') throw new ApiError(403, 'Only an Admin can delete invoices');
  const user = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(403, 'Incorrect password');
  }
  const existing = await loadOrThrow(id);
  await prisma.$transaction(async (tx) => {
    if (existing.status === 'FINALIZED') await returnStock(tx, id, actor);
    await tx.productMovement.deleteMany({ where: { refId: id, refType: { in: ['SALES_INVOICE', 'SALES_INVOICE_REVERSAL'] } } });
    await tx.collection.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } });
    await tx.deliveryReceipt.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } });
    await tx.salesInvoice.delete({ where: { id } });
    await writeAudit({ userId: actor.id, username: actor.username, action: 'DELETE_FORCE', entityType: 'SalesInvoice', entityId: id, details: { number: existing.number, status: existing.status } }, tx);
  });
  return { ok: true };
}

export async function getInvoice(id: string, actor: Actor) {
  const inv = await loadOrThrow(id);
  if (actor.role === 'AGENT' && inv.createdById !== actor.id) {
    throw new ApiError(403, 'You can only view your own invoices');
  }
  return serializeInvoice(inv);
}

export async function listInvoices(
  filters: { q?: string; status?: string; paymentStatus?: string; dateFrom?: string; dateTo?: string },
  actor: Actor,
) {
  const where: Prisma.SalesInvoiceWhereInput = {};
  if (actor.role === 'AGENT') where.createdById = actor.id;
  if (filters.status) where.status = filters.status as Prisma.EnumInvoiceStatusFilter['equals'];
  if (filters.paymentStatus) where.paymentStatus = filters.paymentStatus as Prisma.EnumPaymentStatusFilter['equals'];
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

  const rows = await prisma.salesInvoice.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      number: true,
      date: true,
      customerId: true,
      customerName: true,
      vatClass: true,
      total: true,
      amountPaid: true,
      status: true,
      paymentStatus: true,
      agent: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    date: r.date,
    customerId: r.customerId,
    customerName: r.customerName,
    vatClass: r.vatClass,
    total: toNum(r.total),
    amountPaid: toNum(r.amountPaid),
    status: r.status,
    paymentStatus: r.paymentStatus,
    agentName: r.agent?.name ?? null,
  }));
}

export { loadOrThrow };
