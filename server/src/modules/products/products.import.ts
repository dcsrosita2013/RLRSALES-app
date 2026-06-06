import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { Prisma, Floor } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { writeAudit } from '../../lib/audit';
import type { Actor } from './products.service';

export interface ImportResult {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function cellToString(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = v as any;
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
    if (Array.isArray(o.richText)) return o.richText.map((t: { text: string }) => t.text).join('');
    if (v instanceof Date) return v.toISOString();
    return '';
  }
  return String(v);
}

async function parseRows(buffer: Buffer, isCsv: boolean): Promise<Record<string, string>[]> {
  const wb = new ExcelJS.Workbook();
  if (isCsv) await wb.csv.read(Readable.from(buffer.toString('utf8')));
  else await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers[col] = cellToString(cell.value).replace(/^﻿/, '').trim().toLowerCase();
  });

  const rows: Record<string, string>[] = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const obj: Record<string, string> = {};
    row.eachCell((cell, col) => {
      const h = headers[col];
      if (h) obj[h] = cellToString(cell.value).trim();
    });
    if (Object.values(obj).some((x) => x !== '')) rows.push(obj);
  });
  return rows;
}

const ALIASES: Record<string, string[]> = {
  name: ['name', 'item', 'item name', 'itemname', 'product', 'product name', 'productname'],
  description: ['description', 'desc', 'details'],
  category: ['category', 'categories'],
  brand: ['brand', 'make'],
  unit: ['unit', 'uom'],
  cost: ['cost', 'cost price', 'costprice', 'buying price'],
  selling: ['selling price', 'sellingprice', 'price', 'selling', 'srp', 'base price', 'baseprice', 'unit price'],
  floor: ['floor'],
  room: ['room', 'room number', 'room no', 'roomno', 'location'],
  qty: ['qty', 'quantity', 'stock', 'on hand', 'onhand', 'stock on hand'],
};

function field(r: Record<string, string>, key: string): string {
  for (const a of ALIASES[key]) if (r[a] != null && r[a] !== '') return r[a];
  return '';
}
function num(s: string): number {
  const n = Number(String(s).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function parseFloor(s: string): Floor {
  const u = s.toUpperCase();
  return u.includes('SECOND') || u.includes('2') ? 'SECOND' : 'FIRST';
}

async function findOrCreateCategory(tx: Prisma.TransactionClient, name: string): Promise<string> {
  const f = await tx.category.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  return f ? f.id : (await tx.category.create({ data: { name } })).id;
}
async function findOrCreateBrand(tx: Prisma.TransactionClient, name: string): Promise<string> {
  const f = await tx.brand.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  return f ? f.id : (await tx.brand.create({ data: { name } })).id;
}

export async function importProducts(buffer: Buffer, isCsv: boolean, actor: Actor): Promise<ImportResult> {
  const rows = await parseRows(buffer, isCsv);
  let created = 0;
  let updated = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2; // account for header row
    const name = field(r, 'name');
    if (!name) {
      errors.push({ row: rowNum, message: 'Missing item name' });
      continue;
    }
    try {
      const action = await prisma.$transaction(async (tx) => {
        const categoryName = field(r, 'category');
        const brandName = field(r, 'brand');
        const categoryId = categoryName ? await findOrCreateCategory(tx, categoryName) : null;
        const brandId = brandName ? await findOrCreateBrand(tx, brandName) : null;
        const unit = field(r, 'unit') || 'pc';
        const cost = num(field(r, 'cost'));
        const sellStr = field(r, 'selling');
        const selling = sellStr !== '' ? num(sellStr) : round2(cost * 1.3);

        const existing = await tx.product.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
        const data = {
          name,
          description: field(r, 'description') || null,
          categoryId,
          brandId,
          unit,
          costPrice: cost,
          basePrice: selling,
        };
        const product = existing
          ? await tx.product.update({ where: { id: existing.id }, data })
          : await tx.product.create({ data });

        const room = field(r, 'room');
        const qtyStr = field(r, 'qty');
        if (room && qtyStr !== '') {
          const floor = parseFloor(field(r, 'floor'));
          const qty = num(qtyStr);
          const loc = await tx.stockLocation.upsert({
            where: { productId_floor_roomNumber: { productId: product.id, floor, roomNumber: room } },
            update: { quantity: qty },
            create: { productId: product.id, floor, roomNumber: room, quantity: qty },
          });
          await tx.productMovement.create({
            data: { productId: product.id, stockLocationId: loc.id, type: 'IN', quantity: qty, unitValue: cost, refType: 'IMPORT', note: 'Imported', createdById: actor.id },
          });
        }
        return existing ? 'updated' : 'created';
      });
      if (action === 'created') created++;
      else updated++;
    } catch (e) {
      errors.push({ row: rowNum, message: e instanceof Error ? e.message : 'Import error' });
    }
  }

  await writeAudit({ userId: actor.id, username: actor.username, action: 'IMPORT', entityType: 'Product', details: { created, updated, errorCount: errors.length } });
  return { created, updated, errors };
}
