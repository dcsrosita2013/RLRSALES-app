import { Prisma, Role, TermsType, Floor } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { nextDocumentNumber } from '../../lib/sequence';
import { writeAudit } from '../../lib/audit';
import { verifyPassword } from '../../lib/password';
import { ApiError } from '../../middleware/error';

export interface Actor {
  id: string;
  username: string;
  role: Role;
}

export interface POItemInput {
  productId?: string | null;
  description: string;
  qty: number;
  unit: string;
  unitCost: number;
  floor?: Floor | null;
  roomNumber?: string | null;
}

export interface POInput {
  supplierId: string;
  invoiceDate?: string | Date | null;
  termsType: TermsType;
  netDays?: number | null;
  notes?: string | null;
  items: POItemInput[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const toNum = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === 'number' ? d : Number(d);

const poInclude = {
  items: { include: { product: { select: { brand: { select: { name: true } } } } } },
  supplier: { select: { id: true, name: true, address: true, contactNumber: true, tin: true } },
  createdBy: { select: { id: true, fullName: true, signature: true } },
  approvedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.PurchaseOrderInclude;

type POWithRelations = Prisma.PurchaseOrderGetPayload<{ include: typeof poInclude }>;

interface ComputedLine {
  productId: string | null;
  description: string;
  qty: number;
  unit: string;
  unitCost: number;
  lineTotal: number;
  floor: Floor | null;
  roomNumber: string | null;
}

async function buildLines(client: Prisma.TransactionClient, items: POItemInput[]): Promise<ComputedLine[]> {
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
      unitCost: i.unitCost,
      lineTotal: round2(i.qty * i.unitCost),
      floor: i.floor ?? null,
      roomNumber: i.roomNumber?.trim() || null,
    };
  });
}

export function serializePO(po: POWithRelations) {
  return {
    id: po.id,
    number: po.number,
    supplierId: po.supplierId,
    supplierName: po.supplierName,
    supplier: po.supplier
      ? { id: po.supplier.id, name: po.supplier.name, address: po.supplier.address, contactNumber: po.supplier.contactNumber, tin: po.supplier.tin }
      : null,
    invoiceDate: po.invoiceDate,
    termsType: po.termsType,
    netDays: po.netDays,
    notes: po.notes,
    subtotal: toNum(po.subtotal),
    total: toNum(po.total),
    approvalStatus: po.approvalStatus,
    approvedBy: po.approvedBy ? { id: po.approvedBy.id, fullName: po.approvedBy.fullName } : null,
    approvedAt: po.approvedAt,
    rejectionReason: po.rejectionReason,
    paymentStatus: po.paymentStatus,
    amountPaid: toNum(po.amountPaid),
    paidAt: po.paidAt,
    received: po.received,
    receivedAt: po.receivedAt,
    createdBy: po.createdBy ? { id: po.createdBy.id, fullName: po.createdBy.fullName, signature: po.createdBy.signature ?? null } : null,
    createdAt: po.createdAt,
    items: po.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      description: it.description,
      brand: it.product?.brand?.name ?? '',
      qty: toNum(it.qty),
      unit: it.unit,
      unitCost: toNum(it.unitCost),
      lineTotal: toNum(it.lineTotal),
      floor: it.floor,
      roomNumber: it.roomNumber,
    })),
  };
}

function computeTotals(lines: ComputedLine[]) {
  const subtotal = round2(lines.reduce((s, l) => s + l.qty * l.unitCost, 0));
  return { subtotal, total: subtotal };
}

async function loadOrThrow(id: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: poInclude });
  if (!po) throw new ApiError(404, 'Purchase order not found');
  return po;
}

export async function createPO(input: POInput, actor: Actor) {
  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw new ApiError(400, 'Supplier not found');

  const created = await prisma.$transaction(async (tx) => {
    const lines = await buildLines(tx, input.items);
    const totals = computeTotals(lines);
    const number = await nextDocumentNumber('PURCHASE_ORDER', tx);
    const po = await tx.purchaseOrder.create({
      data: {
        number,
        supplierId: supplier.id,
        supplierName: supplier.name,
        invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : new Date(),
        termsType: input.termsType,
        netDays: input.termsType === 'NET' ? input.netDays ?? null : null,
        notes: input.notes ?? null,
        ...totals,
        approvalStatus: 'PENDING',
        paymentStatus: 'UNPAID',
        createdById: actor.id,
        items: { create: lines },
      },
    });
    await writeAudit({ userId: actor.id, username: actor.username, action: 'CREATE', entityType: 'PurchaseOrder', entityId: po.id, details: { number } }, tx);
    return po;
  });
  // Re-read with relations OUTSIDE the transaction (a deep include inside an interactive
  // transaction on the connection pooler triggers Prisma P2028).
  return getPO(created.id);
}

export async function updatePO(id: string, input: POInput, actor: Actor) {
  const existing = await loadOrThrow(id);
  if (existing.received) throw new ApiError(400, 'A received purchase order can no longer be edited');
  if (existing.approvalStatus === 'APPROVED' && actor.role !== 'ADMIN') {
    throw new ApiError(403, 'This PO is approved — only an Admin can edit it');
  }

  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw new ApiError(400, 'Supplier not found');

  await prisma.$transaction(async (tx) => {
    const lines = await buildLines(tx, input.items);
    const totals = computeTotals(lines);
    // Editing a rejected PO re-submits it for approval.
    const approvalStatus = existing.approvalStatus === 'REJECTED' ? 'PENDING' : existing.approvalStatus;
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: supplier.id,
        supplierName: supplier.name,
        invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : existing.invoiceDate,
        termsType: input.termsType,
        netDays: input.termsType === 'NET' ? input.netDays ?? null : null,
        notes: input.notes ?? null,
        ...totals,
        approvalStatus,
        rejectionReason: approvalStatus === 'PENDING' ? null : existing.rejectionReason,
        items: { deleteMany: {}, create: lines },
      },
    });
    await writeAudit({ userId: actor.id, username: actor.username, action: 'UPDATE', entityType: 'PurchaseOrder', entityId: id }, tx);
  });
  return getPO(id);
}

export async function approvePO(id: string, actor: Actor) {
  const existing = await loadOrThrow(id);
  if (existing.approvalStatus !== 'PENDING') throw new ApiError(400, `PO is already ${existing.approvalStatus.toLowerCase()}`);
  const po = await prisma.purchaseOrder.update({
    where: { id },
    data: { approvalStatus: 'APPROVED', approvedById: actor.id, approvedAt: new Date(), rejectionReason: null },
    include: poInclude,
  });
  await writeAudit({ userId: actor.id, username: actor.username, action: 'APPROVE', entityType: 'PurchaseOrder', entityId: id });
  return serializePO(po);
}

export async function rejectPO(id: string, reason: string | null, actor: Actor) {
  const existing = await loadOrThrow(id);
  if (existing.approvalStatus !== 'PENDING') throw new ApiError(400, `PO is already ${existing.approvalStatus.toLowerCase()}`);
  const po = await prisma.purchaseOrder.update({
    where: { id },
    data: { approvalStatus: 'REJECTED', approvedById: actor.id, approvedAt: new Date(), rejectionReason: reason },
    include: poInclude,
  });
  await writeAudit({ userId: actor.id, username: actor.username, action: 'REJECT', entityType: 'PurchaseOrder', entityId: id, details: { reason } });
  return serializePO(po);
}

export async function receivePO(id: string, actor: Actor) {
  const existing = await loadOrThrow(id);
  if (existing.approvalStatus !== 'APPROVED') throw new ApiError(400, 'Only an approved PO can be received');
  if (existing.received) throw new ApiError(400, 'This PO has already been received');

  await prisma.$transaction(async (tx) => {
    for (const it of existing.items) {
      if (!it.productId || toNum(it.qty) <= 0) continue;
      const floor: Floor = it.floor ?? 'FIRST';
      const room = it.roomNumber || 'RECEIVING';
      const qty = toNum(it.qty);
      const loc = await tx.stockLocation.upsert({
        where: { productId_floor_roomNumber: { productId: it.productId, floor, roomNumber: room } },
        update: { quantity: { increment: qty } },
        create: { productId: it.productId, floor, roomNumber: room, quantity: qty },
      });
      await tx.productMovement.create({
        data: {
          productId: it.productId,
          stockLocationId: loc.id,
          type: 'IN',
          quantity: qty,
          unitValue: toNum(it.unitCost),
          refType: 'PURCHASE_ORDER',
          refId: id,
          refNumber: existing.number,
          note: 'PO received',
          createdById: actor.id,
        },
      });
    }
    await tx.purchaseOrder.update({ where: { id }, data: { received: true, receivedAt: new Date() } });
    await writeAudit({ userId: actor.id, username: actor.username, action: 'RECEIVE', entityType: 'PurchaseOrder', entityId: id }, tx);
  });
  return getPO(id);
}

export async function setPOPayment(id: string, paid: boolean, actor: Actor) {
  const existing = await loadOrThrow(id);
  if (existing.approvalStatus !== 'APPROVED') throw new ApiError(400, 'Only an approved PO can be marked paid/unpaid');
  const po = await prisma.purchaseOrder.update({
    where: { id },
    data: paid
      ? { paymentStatus: 'PAID', amountPaid: existing.total, paidAt: new Date() }
      : { paymentStatus: 'UNPAID', amountPaid: 0, paidAt: null },
    include: poInclude,
  });
  await writeAudit({ userId: actor.id, username: actor.username, action: paid ? 'MARK_PAID' : 'MARK_UNPAID', entityType: 'PurchaseOrder', entityId: id });
  return serializePO(po);
}

export async function deletePO(id: string, actor: Actor) {
  const existing = await loadOrThrow(id);
  if (existing.received) throw new ApiError(400, 'A received PO cannot be deleted');
  if (existing.approvalStatus === 'APPROVED') throw new ApiError(400, 'An approved PO cannot be deleted');
  await prisma.purchaseOrder.delete({ where: { id } });
  await writeAudit({ userId: actor.id, username: actor.username, action: 'DELETE', entityType: 'PurchaseOrder', entityId: id });
  return { ok: true };
}

export async function getPO(id: string) {
  const po = await loadOrThrow(id);
  return serializePO(po);
}

// Admin-only permanent delete of ANY purchase order, guarded by password re-entry.
// Reverses received stock and detaches linked supplier payments first.
export async function forceDeletePO(id: string, password: string, actor: Actor) {
  if (actor.role !== 'ADMIN') throw new ApiError(403, 'Only an Admin can delete purchase orders');
  const user = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(403, 'Incorrect password');
  }
  const existing = await loadOrThrow(id);
  await prisma.$transaction(async (tx) => {
    if (existing.received) {
      const ins = await tx.productMovement.findMany({ where: { refType: 'PURCHASE_ORDER', refId: id } });
      for (const m of ins) {
        if (m.stockLocationId) {
          await tx.stockLocation.update({ where: { id: m.stockLocationId }, data: { quantity: { decrement: toNum(m.quantity) } } }).catch(() => undefined);
        }
      }
    }
    await tx.productMovement.deleteMany({ where: { refType: 'PURCHASE_ORDER', refId: id } });
    await tx.supplierPayment.updateMany({ where: { poId: id }, data: { poId: null } });
    await tx.purchaseOrder.delete({ where: { id } });
    await writeAudit({ userId: actor.id, username: actor.username, action: 'DELETE_FORCE', entityType: 'PurchaseOrder', entityId: id, details: { number: existing.number } }, tx);
  });
  return { ok: true };
}

export async function listPOs(filters: {
  q?: string;
  approvalStatus?: string;
  paymentStatus?: string;
  received?: string;
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const where: Prisma.PurchaseOrderWhereInput = {};
  if (filters.approvalStatus) where.approvalStatus = filters.approvalStatus as Prisma.EnumPOApprovalStatusFilter['equals'];
  if (filters.paymentStatus) where.paymentStatus = filters.paymentStatus as Prisma.EnumPaymentStatusFilter['equals'];
  if (filters.received === 'true') where.received = true;
  if (filters.received === 'false') where.received = false;
  if (filters.supplierId) where.supplierId = filters.supplierId;
  if (filters.dateFrom || filters.dateTo) {
    where.invoiceDate = {};
    if (filters.dateFrom) where.invoiceDate.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.invoiceDate.lte = new Date(`${filters.dateTo}T23:59:59`);
  }
  if (filters.q) {
    where.OR = [
      { number: { contains: filters.q, mode: 'insensitive' } },
      { supplierName: { contains: filters.q, mode: 'insensitive' } },
    ];
  }
  const rows = await prisma.purchaseOrder.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      number: true,
      invoiceDate: true,
      supplierName: true,
      total: true,
      approvalStatus: true,
      paymentStatus: true,
      received: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    invoiceDate: r.invoiceDate,
    supplierName: r.supplierName,
    total: toNum(r.total),
    approvalStatus: r.approvalStatus,
    paymentStatus: r.paymentStatus,
    received: r.received,
  }));
}
