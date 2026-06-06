import { Prisma, Role, Floor } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { priceOptions } from '../../lib/pricing';
import { writeAudit } from '../../lib/audit';
import { ApiError } from '../../middleware/error';

export interface Actor {
  id: string;
  username: string;
  role: Role;
}

export interface StockInput {
  floor: Floor;
  roomNumber: string;
  quantity: number;
}

export interface ProductInput {
  name: string;
  description?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  unit: string;
  origin?: string | null;
  costPrice?: number;
  basePrice?: number;
  stocks?: StockInput[];
}

function toNum(d: Prisma.Decimal | number | null | undefined): number {
  if (d == null) return 0;
  return typeof d === 'number' ? d : Number(d);
}

const productInclude = {
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  stocks: { orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }] },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export function serializeProduct(p: ProductWithRelations, lastReceivedAt: Date | null = null) {
  const cost = toNum(p.costPrice);
  const stocks = p.stocks.map((s) => ({
    id: s.id,
    floor: s.floor,
    roomNumber: s.roomNumber,
    quantity: toNum(s.quantity),
  }));
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    unit: p.unit,
    origin: p.origin,
    categoryId: p.categoryId,
    brandId: p.brandId,
    category: p.category ? { id: p.category.id, name: p.category.name } : null,
    brand: p.brand ? { id: p.brand.id, name: p.brand.name } : null,
    costPrice: cost,
    basePrice: toNum(p.basePrice),
    priceOptions: priceOptions(cost),
    isActive: p.isActive,
    stocks,
    totalQuantity: stocks.reduce((sum, s) => sum + s.quantity, 0),
    lastReceivedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// Latest stock-in date per product (for the "last received" column).
async function lastReceivedMap(productIds: string[]): Promise<Map<string, Date | null>> {
  if (productIds.length === 0) return new Map();
  const rows = await prisma.productMovement.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds }, type: 'IN' },
    _max: { createdAt: true },
  });
  return new Map(rows.map((r) => [r.productId, r._max.createdAt]));
}

async function getProductOrThrow(id: string) {
  const p = await prisma.product.findUnique({ where: { id }, include: productInclude });
  if (!p) throw new ApiError(404, 'Product not found');
  const map = await lastReceivedMap([id]);
  return serializeProduct(p, map.get(id) ?? null);
}

export async function listProducts(filters: { q?: string; categoryId?: string; brandId?: string; limit?: number }) {
  const products = await prisma.product.findMany({
    where: {
      ...(filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: 'insensitive' } },
              { description: { contains: filters.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.brandId ? { brandId: filters.brandId } : {}),
    },
    include: productInclude,
    orderBy: { name: 'asc' },
    ...(filters.limit ? { take: filters.limit } : {}),
  });
  const map = await lastReceivedMap(products.map((p) => p.id));
  return products.map((p) => serializeProduct(p, map.get(p.id) ?? null));
}

export const getProduct = getProductOrThrow;

export async function createProduct(input: ProductInput, actor: Actor) {
  const created = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        categoryId: input.categoryId ?? null,
        brandId: input.brandId ?? null,
        unit: input.unit,
        origin: input.origin || 'Philippines',
        // Admin and Warehouse may both set pricing.
        costPrice: input.costPrice ?? 0,
        basePrice: input.basePrice ?? 0,
      },
    });
    for (const s of input.stocks ?? []) {
      const loc = await tx.stockLocation.create({
        data: { productId: p.id, floor: s.floor, roomNumber: s.roomNumber, quantity: s.quantity },
      });
      if (s.quantity > 0) {
        await tx.productMovement.create({
          data: {
            productId: p.id,
            stockLocationId: loc.id,
            type: 'IN',
            quantity: s.quantity,
            unitValue: toNum(p.costPrice),
            refType: 'Initial',
            note: 'Initial stock',
            createdById: actor.id,
          },
        });
      }
    }
    await writeAudit(
      { userId: actor.id, username: actor.username, action: 'CREATE', entityType: 'Product', entityId: p.id, details: { name: p.name } },
      tx,
    );
    return p;
  });
  return getProductOrThrow(created.id);
}

export async function updateProduct(id: string, input: ProductInput, actor: Actor) {
  // Admin and Warehouse may both set pricing.
  const data: Prisma.ProductUpdateInput = {
    name: input.name,
    description: input.description ?? null,
    unit: input.unit,
    origin: input.origin || 'Philippines',
    category: input.categoryId ? { connect: { id: input.categoryId } } : { disconnect: true },
    brand: input.brandId ? { connect: { id: input.brandId } } : { disconnect: true },
    costPrice: input.costPrice ?? 0,
    basePrice: input.basePrice ?? 0,
  };
  await prisma.product.update({ where: { id }, data });
  await writeAudit({ userId: actor.id, username: actor.username, action: 'UPDATE', entityType: 'Product', entityId: id });
  return getProductOrThrow(id);
}

export async function deleteProduct(id: string, actor: Actor) {
  const [inv, dr, po, qt] = await Promise.all([
    prisma.salesInvoiceItem.count({ where: { productId: id } }),
    prisma.deliveryReceiptItem.count({ where: { productId: id } }),
    prisma.purchaseOrderItem.count({ where: { productId: id } }),
    prisma.quotationItem.count({ where: { productId: id } }),
  ]);
  if (inv + dr + po + qt > 0) {
    throw new ApiError(409, 'Cannot delete: product is used in documents. Mark it inactive instead.');
  }
  // StockLocation and ProductMovement cascade-delete with the product.
  await prisma.product.delete({ where: { id } });
  await writeAudit({ userId: actor.id, username: actor.username, action: 'DELETE', entityType: 'Product', entityId: id });
  return { ok: true };
}

export async function addStockLocation(productId: string, input: StockInput, actor: Actor) {
  const existing = await prisma.stockLocation.findUnique({
    where: { productId_floor_roomNumber: { productId, floor: input.floor, roomNumber: input.roomNumber } },
  });
  if (existing) {
    throw new ApiError(409, `A stock record already exists for ${input.floor} floor, room ${input.roomNumber}`);
  }
  await prisma.$transaction(async (tx) => {
    const loc = await tx.stockLocation.create({
      data: { productId, floor: input.floor, roomNumber: input.roomNumber, quantity: input.quantity },
    });
    if (input.quantity > 0) {
      const prod = await tx.product.findUnique({ where: { id: productId }, select: { costPrice: true } });
      await tx.productMovement.create({
        data: {
          productId,
          stockLocationId: loc.id,
          type: 'IN',
          quantity: input.quantity,
          unitValue: toNum(prod?.costPrice),
          refType: 'Adjustment',
          note: 'New stock location',
          createdById: actor.id,
        },
      });
    }
    await writeAudit(
      { userId: actor.id, username: actor.username, action: 'CREATE', entityType: 'StockLocation', entityId: loc.id, details: { productId, floor: input.floor, roomNumber: input.roomNumber, quantity: input.quantity } },
      tx,
    );
  });
  return getProductOrThrow(productId);
}

export async function adjustStock(
  productId: string,
  stockId: string,
  input: { delta: number; note?: string | null },
  actor: Actor,
) {
  const loc = await prisma.stockLocation.findFirst({ where: { id: stockId, productId } });
  if (!loc) throw new ApiError(404, 'Stock location not found');
  const current = toNum(loc.quantity);
  const next = current + input.delta;
  if (next < 0) throw new ApiError(400, 'Adjustment would make stock negative');

  const prod = await prisma.product.findUnique({ where: { id: productId }, select: { costPrice: true, basePrice: true } });
  await prisma.$transaction(async (tx) => {
    await tx.stockLocation.update({ where: { id: stockId }, data: { quantity: next } });
    await tx.productMovement.create({
      data: {
        productId,
        stockLocationId: stockId,
        type: input.delta >= 0 ? 'IN' : 'OUT',
        quantity: Math.abs(input.delta),
        unitValue: input.delta >= 0 ? toNum(prod?.costPrice) : toNum(prod?.basePrice),
        refType: 'Adjustment',
        note: input.note ?? 'Manual adjustment',
        createdById: actor.id,
      },
    });
    await writeAudit(
      { userId: actor.id, username: actor.username, action: 'ADJUST_STOCK', entityType: 'StockLocation', entityId: stockId, details: { delta: input.delta, from: current, to: next, note: input.note } },
      tx,
    );
  });
  return getProductOrThrow(productId);
}

export async function deleteStockLocation(productId: string, stockId: string, actor: Actor) {
  const loc = await prisma.stockLocation.findFirst({ where: { id: stockId, productId } });
  if (!loc) throw new ApiError(404, 'Stock location not found');
  await prisma.stockLocation.delete({ where: { id: stockId } });
  await writeAudit({ userId: actor.id, username: actor.username, action: 'DELETE', entityType: 'StockLocation', entityId: stockId, details: { productId } });
  return getProductOrThrow(productId);
}
