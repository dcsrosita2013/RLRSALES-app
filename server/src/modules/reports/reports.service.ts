import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export interface ReportColumn {
  key: string;
  label: string;
  money?: boolean;
  align?: 'left' | 'right';
}
export interface ReportResult {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, number>;
}

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  agentId?: string;
  supplierId?: string;
  productId?: string;
  /** receivables: collected | uncollected | partial | outstanding | overdue */
  status?: string;
  /** Set for AGENT role: restrict results to this user's own records. */
  selfUserId?: string;
  selfAgentId?: string | null;
  /** Whether the viewer may see cost figures (false for AGENT). */
  canSeeCost?: boolean;
}

// An agent's own records: created by them, or assigned to their linked agent.
// When not self-scoped, falls back to the optional agent filter (admin/finance).
const ownScope = (f: ReportFilters) =>
  f.selfUserId
    ? { OR: [{ createdById: f.selfUserId }, ...(f.selfAgentId ? [{ agentId: f.selfAgentId }] : [])] }
    : f.agentId
      ? { agentId: f.agentId }
      : {};

const toNum = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === 'number' ? d : Number(d);
const round2 = (n: number) => Math.round(n * 100) / 100;
const dateRange = (f: ReportFilters) => {
  const r: Prisma.DateTimeFilter = {};
  if (f.dateFrom) r.gte = new Date(f.dateFrom);
  if (f.dateTo) r.lte = new Date(`${f.dateTo}T23:59:59`);
  return f.dateFrom || f.dateTo ? r : undefined;
};
const day = (d: Date) => new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });

// 1. Sales — detailed (per line item)
export async function salesDetailed(f: ReportFilters): Promise<ReportResult> {
  const invoices = await prisma.salesInvoice.findMany({
    where: { status: 'FINALIZED', date: dateRange(f), ...ownScope(f) },
    include: { items: true },
    orderBy: { date: 'asc' },
  });
  const rows = invoices.flatMap((inv) =>
    inv.items.map((it) => ({
      number: inv.number,
      date: day(inv.date),
      customer: inv.customerName,
      product: it.description,
      qty: toNum(it.qty),
      unit: it.unit,
      price: toNum(it.unitPrice),
      total: toNum(it.lineTotal),
    })),
  );
  return {
    title: 'Sales — Detailed',
    columns: [
      { key: 'number', label: 'Invoice #' },
      { key: 'date', label: 'Date' },
      { key: 'customer', label: 'Customer' },
      { key: 'product', label: 'Product' },
      { key: 'qty', label: 'Qty', align: 'right' },
      { key: 'unit', label: 'Unit' },
      { key: 'price', label: 'Price', money: true },
      { key: 'total', label: 'Total', money: true },
    ],
    rows,
    totals: { total: round2(rows.reduce((s, r) => s + (r.total as number), 0)) },
  };
}

// 2. Sales — summary (per invoice, with profit)
export async function salesSummary(f: ReportFilters): Promise<ReportResult> {
  const invoices = await prisma.salesInvoice.findMany({
    where: { status: 'FINALIZED', date: dateRange(f), ...(f.agentId ? { agentId: f.agentId } : {}) },
    orderBy: { date: 'asc' },
  });
  const rows = invoices.map((inv) => {
    const total = toNum(inv.total);
    const profit = round2(toNum(inv.subtotal) - toNum(inv.discount) - toNum(inv.totalCost));
    return {
      number: inv.number,
      date: day(inv.date),
      customer: inv.customerName,
      cash: inv.termsType === 'COD' ? total : 0,
      charge: inv.termsType === 'NET' ? total : 0,
      total,
      discount: toNum(inv.discount),
      cost: toNum(inv.totalCost),
      profit,
    };
  });
  const sum = (k: string) => round2(rows.reduce((s, r) => s + (r[k as keyof typeof r] as number), 0));
  return {
    title: 'Sales — Summary',
    columns: [
      { key: 'number', label: 'Inv #' },
      { key: 'date', label: 'Date' },
      { key: 'customer', label: 'Customer' },
      { key: 'cash', label: 'Cash', money: true },
      { key: 'charge', label: 'Charge', money: true },
      { key: 'total', label: 'Total', money: true },
      { key: 'discount', label: 'Discount', money: true },
      { key: 'cost', label: 'Cost', money: true },
      { key: 'profit', label: 'Profit', money: true },
    ],
    rows,
    totals: { cash: sum('cash'), charge: sum('charge'), total: sum('total'), discount: sum('discount'), cost: sum('cost'), profit: sum('profit') },
  };
}

// 3. Collections
export async function collectionsReport(f: ReportFilters): Promise<ReportResult> {
  const rows0 = await prisma.collection.findMany({
    where: { date: dateRange(f), ...(f.customerId ? { customerId: f.customerId } : {}) },
    include: { customer: { select: { name: true } }, invoice: { select: { number: true } } },
    orderBy: { date: 'asc' },
  });
  const rows = rows0.map((c) => ({
    number: c.number,
    date: day(c.date),
    customer: c.customer?.name ?? '',
    invoice: c.invoice?.number ?? '—',
    method: c.method,
    checkNumber: c.checkNumber ?? '', // blank unless it's a check payment
    checkDate: c.checkDate ? day(c.checkDate) : '',
    amount: toNum(c.amount),
  }));
  return {
    title: 'Collections',
    columns: [
      { key: 'number', label: 'OR / Receipt #' },
      { key: 'date', label: 'Date' },
      { key: 'customer', label: 'Customer' },
      { key: 'invoice', label: 'Invoice' },
      { key: 'method', label: 'Method' },
      { key: 'checkNumber', label: 'Check #' },
      { key: 'checkDate', label: 'Check Date' },
      { key: 'amount', label: 'Amount', money: true },
    ],
    rows,
    totals: { amount: round2(rows.reduce((s, r) => s + (r.amount as number), 0)) },
  };
}

// 4. Customer ledger (charges vs payments, running balance)
export async function customerLedger(f: ReportFilters): Promise<ReportResult> {
  if (!f.customerId) return { title: 'Customer Ledger', columns: [], rows: [] };
  const from = f.dateFrom ? new Date(f.dateFrom) : undefined;
  const [openInv, openCol, invoices, collections, customer] = await Promise.all([
    prisma.salesInvoice.aggregate({ where: { customerId: f.customerId, status: 'FINALIZED', ...(from ? { date: { lt: from } } : {}) }, _sum: { total: true } }),
    prisma.collection.aggregate({ where: { customerId: f.customerId, ...(from ? { date: { lt: from } } : {}) }, _sum: { amount: true } }),
    prisma.salesInvoice.findMany({ where: { customerId: f.customerId, status: 'FINALIZED', date: dateRange(f) }, orderBy: { date: 'asc' } }),
    prisma.collection.findMany({ where: { customerId: f.customerId, date: dateRange(f) }, orderBy: { date: 'asc' } }),
    prisma.customer.findUnique({ where: { id: f.customerId }, select: { name: true } }),
  ]);
  let balance = from ? round2(toNum(openInv._sum.total) - toNum(openCol._sum.amount)) : 0;
  const events = [
    ...invoices.map((i) => ({ d: i.date, type: 'Invoice', ref: i.number ?? '', charge: toNum(i.total), payment: 0 })),
    ...collections.map((c) => ({ d: c.date, type: `Collection (${c.method})`, ref: c.number, charge: 0, payment: toNum(c.amount) })),
  ].sort((a, b) => a.d.getTime() - b.d.getTime());
  const rows: ReportResult['rows'] = [];
  if (from) rows.push({ date: day(from), type: 'Opening balance', ref: '', charge: null, payment: null, balance });
  for (const e of events) {
    balance = round2(balance + e.charge - e.payment);
    rows.push({ date: day(e.d), type: e.type, ref: e.ref, charge: e.charge || null, payment: e.payment || null, balance });
  }
  return {
    title: `Customer Ledger — ${customer?.name ?? ''}`,
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'type', label: 'Type' },
      { key: 'ref', label: 'Ref #' },
      { key: 'charge', label: 'Charge', money: true },
      { key: 'payment', label: 'Payment', money: true },
      { key: 'balance', label: 'Balance', money: true },
    ],
    rows,
  };
}

// 5. Purchase — detailed (per PO line)
export async function purchaseDetailed(f: ReportFilters): Promise<ReportResult> {
  const pos = await prisma.purchaseOrder.findMany({
    where: { invoiceDate: dateRange(f), ...(f.supplierId ? { supplierId: f.supplierId } : {}) },
    include: { items: true },
    orderBy: { invoiceDate: 'asc' },
  });
  const rows = pos.flatMap((po) =>
    po.items.map((it) => ({
      number: po.number,
      date: day(po.invoiceDate),
      supplier: po.supplierName,
      product: it.description,
      qty: toNum(it.qty),
      unit: it.unit,
      cost: toNum(it.unitCost),
      total: toNum(it.lineTotal),
    })),
  );
  return {
    title: 'Purchases — Detailed',
    columns: [
      { key: 'number', label: 'PO #' },
      { key: 'date', label: 'Date' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'product', label: 'Product' },
      { key: 'qty', label: 'Qty', align: 'right' },
      { key: 'unit', label: 'Unit' },
      { key: 'cost', label: 'Unit Cost', money: true },
      { key: 'total', label: 'Total', money: true },
    ],
    rows,
    totals: { total: round2(rows.reduce((s, r) => s + (r.total as number), 0)) },
  };
}

// 6. Product ledger (movement with running balance)
export async function productLedger(f: ReportFilters): Promise<ReportResult> {
  if (!f.productId) return { title: 'Product Ledger', columns: [], rows: [] };
  const showCost = f.canSeeCost !== false;
  const from = f.dateFrom ? new Date(f.dateFrom) : undefined;
  const [product, opening, movements] = await Promise.all([
    prisma.product.findUnique({ where: { id: f.productId }, select: { name: true, unit: true, costPrice: true, basePrice: true } }),
    from
      ? prisma.productMovement.findMany({ where: { productId: f.productId, createdAt: { lt: from } }, select: { type: true, quantity: true } })
      : Promise.resolve([] as { type: string; quantity: Prisma.Decimal }[]),
    prisma.productMovement.findMany({ where: { productId: f.productId, createdAt: dateRange(f) }, orderBy: { createdAt: 'asc' } }),
  ]);
  const cost = toNum(product?.costPrice);
  const sell = toNum(product?.basePrice);
  let balance = opening.reduce((s, m) => s + (m.type === 'OUT' ? -toNum(m.quantity) : toNum(m.quantity)), 0);
  const rows: ReportResult['rows'] = [];
  if (from) rows.push({ date: day(from), type: 'Opening', ref: '', inQty: null, outQty: null, balance });
  for (const m of movements) {
    const isOut = m.type === 'OUT';
    balance = round2(balance + (isOut ? -toNum(m.quantity) : toNum(m.quantity)));
    // Frozen unit price recorded at the time of the movement; fall back to the
    // current product price for older movements created before price-freezing.
    const value = m.unitValue != null ? toNum(m.unitValue) : isOut ? sell : cost;
    const row: Record<string, string | number | null> = {
      date: day(m.createdAt),
      type: m.type,
      ref: m.refNumber ?? m.refType ?? '',
      inQty: isOut ? null : toNum(m.quantity),
      outQty: isOut ? toNum(m.quantity) : null,
      balance,
    };
    // IN movements show Item Cost; OUT movements show Item Sell — never both on a row.
    if (isOut) row.sell = value;
    else if (showCost) row.cost = value;
    rows.push(row);
  }
  return {
    title: `Product Ledger — ${product?.name ?? ''}`,
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'type', label: 'Type' },
      { key: 'ref', label: 'Reference' },
      { key: 'inQty', label: 'In', align: 'right' },
      { key: 'outQty', label: 'Out', align: 'right' },
      { key: 'balance', label: 'Balance', align: 'right' },
      ...(showCost ? [{ key: 'cost', label: 'Item Cost', money: true }] : []),
      { key: 'sell', label: 'Item Sell', money: true },
    ],
    rows,
  };
}

// 7. Inventory on hand (by item + floor/room)
export async function inventoryReport(): Promise<ReportResult> {
  const locs = await prisma.stockLocation.findMany({
    include: { product: { include: { category: { select: { name: true } }, brand: { select: { name: true } } } } },
    orderBy: [{ product: { name: 'asc' } }, { floor: 'asc' }, { roomNumber: 'asc' }],
  });
  const rows = locs.map((l) => ({
    product: l.product.name,
    category: l.product.category?.name ?? '—',
    brand: l.product.brand?.name ?? '—',
    floor: l.floor === 'FIRST' ? 'First Floor' : 'Second Floor',
    room: l.roomNumber,
    unit: l.product.unit,
    qty: toNum(l.quantity),
  }));
  return {
    title: 'Inventory — On Hand',
    columns: [
      { key: 'product', label: 'Product' },
      { key: 'category', label: 'Category' },
      { key: 'brand', label: 'Brand' },
      { key: 'floor', label: 'Floor' },
      { key: 'room', label: 'Room' },
      { key: 'unit', label: 'Unit' },
      { key: 'qty', label: 'Qty on hand', align: 'right' },
    ],
    rows,
    totals: { qty: round2(rows.reduce((s, r) => s + (r.qty as number), 0)) },
  };
}

// 8. Customers per agent
export async function customersPerAgent(f: ReportFilters): Promise<ReportResult> {
  // Agents see only their own customers; an unlinked agent sees none.
  const custScope = f.selfUserId
    ? { agentId: f.selfAgentId ?? '__none__' }
    : f.agentId
      ? { agentId: f.agentId }
      : {};
  const customers = await prisma.customer.findMany({
    where: custScope,
    include: { agent: { select: { name: true } } },
    orderBy: [{ agent: { name: 'asc' } }, { name: 'asc' }],
  });
  const vat = { VAT: 'VAT (12%)', VAT_ADD: 'Add VAT (12%)', ZERO_RATED: 'Zero-Rated', VAT_EXEMPT: 'VAT-Exempt' } as const;
  return {
    title: 'Customers per Agent',
    columns: [
      { key: 'agent', label: 'Agent' },
      { key: 'customer', label: 'Customer' },
      { key: 'tin', label: 'TIN' },
      { key: 'contact', label: 'Contact' },
      { key: 'vat', label: 'VAT' },
    ],
    rows: customers.map((c) => ({
      agent: c.agent?.name ?? '(no agent)',
      customer: c.name,
      tin: c.tin ?? '—',
      contact: c.contactNumber ?? '—',
      vat: vat[c.vatClass],
    })),
  };
}

// 9. Sales summary per agent
export async function salesPerAgent(f: ReportFilters): Promise<ReportResult> {
  const invoices = await prisma.salesInvoice.findMany({
    where: { status: 'FINALIZED', date: dateRange(f) },
    include: { agent: { select: { name: true } } },
  });
  const map = new Map<string, { agent: string; count: number; sales: number; cost: number; profit: number }>();
  for (const inv of invoices) {
    const key = inv.agentId ?? 'none';
    const e = map.get(key) ?? { agent: inv.agent?.name ?? '(no agent)', count: 0, sales: 0, cost: 0, profit: 0 };
    e.count += 1;
    e.sales = round2(e.sales + toNum(inv.total));
    e.cost = round2(e.cost + toNum(inv.totalCost));
    e.profit = round2(e.profit + toNum(inv.subtotal) - toNum(inv.discount) - toNum(inv.totalCost));
    map.set(key, e);
  }
  const rows = [...map.values()].sort((a, b) => b.sales - a.sales);
  return {
    title: 'Sales Summary per Agent',
    columns: [
      { key: 'agent', label: 'Agent' },
      { key: 'count', label: '# Invoices', align: 'right' },
      { key: 'sales', label: 'Total Sales', money: true },
      { key: 'cost', label: 'Cost', money: true },
      { key: 'profit', label: 'Profit', money: true },
    ],
    rows,
    totals: {
      count: rows.reduce((s, r) => s + r.count, 0),
      sales: round2(rows.reduce((s, r) => s + r.sales, 0)),
      cost: round2(rows.reduce((s, r) => s + r.cost, 0)),
      profit: round2(rows.reduce((s, r) => s + r.profit, 0)),
    },
  };
}

// 10. Quotations
export async function quotationsReport(f: ReportFilters): Promise<ReportResult> {
  const qs = await prisma.quotation.findMany({ where: { date: dateRange(f), ...ownScope(f) }, orderBy: { date: 'asc' } });
  return {
    title: 'Quotations',
    columns: [
      { key: 'number', label: 'Quotation #' },
      { key: 'date', label: 'Date' },
      { key: 'customer', label: 'Customer' },
      { key: 'total', label: 'Total', money: true },
      { key: 'validUntil', label: 'Valid Until' },
      { key: 'status', label: 'Status' },
    ],
    rows: qs.map((q) => ({
      number: q.number,
      date: day(q.date),
      customer: q.customerName,
      total: toNum(q.total),
      validUntil: q.validUntil ? day(q.validUntil) : '—',
      status: q.convertedInvoiceId ? 'Converted' : 'Open',
    })),
  };
}

// 11. Purchase Orders per supplier
export async function purchaseOrdersReport(f: ReportFilters): Promise<ReportResult> {
  const pos = await prisma.purchaseOrder.findMany({
    where: { invoiceDate: dateRange(f), ...(f.supplierId ? { supplierId: f.supplierId } : {}) },
    orderBy: { invoiceDate: 'asc' },
  });
  return {
    title: 'Purchase Orders',
    columns: [
      { key: 'number', label: 'PO #' },
      { key: 'date', label: 'Invoice Date' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'terms', label: 'Terms' },
      { key: 'total', label: 'Total', money: true },
      { key: 'approval', label: 'Approval' },
      { key: 'payment', label: 'Payment' },
    ],
    rows: pos.map((po) => ({
      number: po.number,
      date: day(po.invoiceDate),
      supplier: po.supplierName,
      terms: po.termsType === 'NET' ? `Net ${po.netDays} days` : 'COD',
      total: toNum(po.total),
      approval: po.approvalStatus,
      payment: po.paymentStatus,
    })),
    totals: { total: round2(pos.reduce((s, p) => s + toNum(p.total), 0)) },
  };
}

// 12. Agent commission. Markup = (price - cost) / cost per line — matches the
//   25/30/35% price options (% added to cost).
//   Philippines origin: markup >= 25% -> 3.5% of gross sales.
//   China origin:       markup >= 30% -> 5.0% of gross sales.
const COMMISSION = {
  ph: { threshold: 0.25, rate: 0.035 },
  china: { threshold: 0.3, rate: 0.05 },
};
export async function agentCommission(f: ReportFilters): Promise<ReportResult> {
  // Commission is earned only when the invoice is fully collected (PAID), and is
  // recognised in the month it was paid — so the date filter applies to paidAt.
  const invoices = await prisma.salesInvoice.findMany({
    where: { status: 'FINALIZED', paymentStatus: 'PAID', paidAt: dateRange(f) },
    include: {
      items: true,
      agent: { select: { name: true } },
      createdBy: { select: { agentId: true, agent: { select: { name: true } } } },
    },
  });
  const productIds = [...new Set(invoices.flatMap((i) => i.items.map((it) => it.productId).filter((x): x is string => Boolean(x))))];
  const products = productIds.length ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, origin: true } }) : [];
  const originMap = new Map(products.map((p) => [p.id, p.origin]));
  const map = new Map<string, { agent: string; phSales: number; phComm: number; cnSales: number; cnComm: number }>();
  for (const inv of invoices) {
    // Attribute to the invoice's agent, falling back to the creating agent.
    const effId = inv.agentId ?? inv.createdBy?.agentId ?? 'none';
    if (f.agentId && effId !== f.agentId) continue;
    const effName = inv.agent?.name ?? inv.createdBy?.agent?.name ?? '(no agent)';
    const e = map.get(effId) ?? { agent: effName, phSales: 0, phComm: 0, cnSales: 0, cnComm: 0 };
    for (const it of inv.items) {
      const price = toNum(it.unitPrice);
      if (price <= 0) continue;
      const cost = toNum(it.unitCost);
      // Markup = profit as % of cost (cost 0 => treat as fully qualifying).
      const markup = cost > 0 ? (price - cost) / cost : Number.POSITIVE_INFINITY;
      const lineSales = round2(toNum(it.qty) * price);
      const isChina = it.productId ? (originMap.get(it.productId) || '').toLowerCase().includes('china') : false;
      if (isChina) {
        if (markup >= COMMISSION.china.threshold) {
          e.cnSales = round2(e.cnSales + lineSales);
          e.cnComm = round2(e.cnComm + lineSales * COMMISSION.china.rate);
        }
      } else if (markup >= COMMISSION.ph.threshold) {
        e.phSales = round2(e.phSales + lineSales);
        e.phComm = round2(e.phComm + lineSales * COMMISSION.ph.rate);
      }
    }
    map.set(effId, e);
  }
  const rows = [...map.values()]
    .map((e) => ({ agent: e.agent, phSales: e.phSales, phComm: e.phComm, cnSales: e.cnSales, cnComm: e.cnComm, total: round2(e.phComm + e.cnComm) }))
    .filter((r) => r.phSales > 0 || r.cnSales > 0)
    .sort((a, b) => b.total - a.total);
  const sum = (k: string) => round2(rows.reduce((s, r) => s + (r[k as keyof typeof r] as number), 0));
  return {
    title: 'Agent Commission (paid invoices only)',
    columns: [
      { key: 'agent', label: 'Agent' },
      { key: 'phSales', label: 'PH Qual. Sales (≥25% markup)', money: true },
      { key: 'phComm', label: 'PH Comm. (3.5%)', money: true },
      { key: 'cnSales', label: 'China Qual. Sales (≥30% markup)', money: true },
      { key: 'cnComm', label: 'China Comm. (5%)', money: true },
      { key: 'total', label: 'Total Commission', money: true },
    ],
    rows,
    totals: { phSales: sum('phSales'), phComm: sum('phComm'), cnSales: sum('cnSales'), cnComm: sum('cnComm'), total: sum('total') },
  };
}

// 13. Collections status — per finalized invoice, whether it is collected or not,
//   how much is still outstanding, and whether it is past its due date.
export async function receivablesStatus(f: ReportFilters): Promise<ReportResult> {
  const invoices = await prisma.salesInvoice.findMany({
    where: {
      status: 'FINALIZED',
      date: dateRange(f),
      ...(f.customerId ? { customerId: f.customerId } : {}),
      ...(f.agentId ? { agentId: f.agentId } : {}),
    },
    include: { agent: { select: { name: true } } },
    orderBy: { date: 'asc' },
  });
  const now = new Date();
  const label: Record<string, string> = { PAID: 'Collected', PARTIAL: 'Partial', UNPAID: 'Not collected' };
  const want = (f.status ?? '').toLowerCase();
  const rows = invoices
    .map((inv) => {
      const total = toNum(inv.total);
      const collected = toNum(inv.amountPaid);
      const balance = round2(total - collected);
      const due =
        inv.termsType === 'NET' && inv.netDays != null
          ? new Date(new Date(inv.date).getTime() + inv.netDays * 86400000)
          : null;
      const overdue = balance > 0.005 && due != null && due < now;
      return { inv, total, collected, balance, due, overdue };
    })
    .filter((r) => {
      switch (want) {
        case 'collected':
          return r.inv.paymentStatus === 'PAID';
        case 'uncollected':
          return r.inv.paymentStatus === 'UNPAID';
        case 'partial':
          return r.inv.paymentStatus === 'PARTIAL';
        case 'outstanding':
          return r.balance > 0.005; // anything still owed (unpaid + partial)
        case 'overdue':
          return r.overdue;
        default:
          return true;
      }
    })
    .map((r) => {
      const status = label[r.inv.paymentStatus] ?? r.inv.paymentStatus;
      return {
        number: r.inv.number ?? '(no #)',
        date: day(r.inv.date),
        customer: r.inv.customerName,
        agent: r.inv.agent?.name ?? '—',
        due: r.due ? day(r.due) : 'COD',
        total: r.total,
        collected: r.collected,
        balance: r.balance,
        status: r.overdue ? `${status} · OVERDUE` : status,
      };
    });
  return {
    title: 'Collections Status (Receivables)',
    columns: [
      { key: 'number', label: 'Invoice #' },
      { key: 'date', label: 'Date' },
      { key: 'customer', label: 'Customer' },
      { key: 'agent', label: 'Agent' },
      { key: 'due', label: 'Due' },
      { key: 'total', label: 'Total', money: true },
      { key: 'collected', label: 'Collected', money: true },
      { key: 'balance', label: 'Balance', money: true },
      { key: 'status', label: 'Status' },
    ],
    rows,
    totals: {
      total: round2(rows.reduce((s, r) => s + (r.total as number), 0)),
      collected: round2(rows.reduce((s, r) => s + (r.collected as number), 0)),
      balance: round2(rows.reduce((s, r) => s + (r.balance as number), 0)),
    },
  };
}

// 14. Agent commission — detailed. One row per line of each PAID invoice, showing
//   cost, selling price, markup, and the commission earned (rate × line sales).
//   Totals match the Agent Commission summary. Same paid-only + paidAt period rule.
export async function agentCommissionDetailed(f: ReportFilters): Promise<ReportResult> {
  const invoices = await prisma.salesInvoice.findMany({
    where: { status: 'FINALIZED', paymentStatus: 'PAID', paidAt: dateRange(f) },
    include: {
      items: true,
      agent: { select: { name: true } },
      createdBy: { select: { agentId: true, agent: { select: { name: true } } } },
    },
    orderBy: { date: 'asc' },
  });
  const productIds = [...new Set(invoices.flatMap((i) => i.items.map((it) => it.productId).filter((x): x is string => Boolean(x))))];
  const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, origin: true } });
  const originMap = new Map(products.map((p) => [p.id, p.origin]));

  const rows: ReportResult['rows'] = [];
  for (const inv of invoices) {
    const effId = inv.agentId ?? inv.createdBy?.agentId ?? 'none';
    if (f.agentId && effId !== f.agentId) continue;
    const effName = inv.agent?.name ?? inv.createdBy?.agent?.name ?? '(no agent)';
    for (const it of inv.items) {
      const price = toNum(it.unitPrice);
      const cost = toNum(it.unitCost);
      const qty = toNum(it.qty);
      const markup = cost > 0 ? (price - cost) / cost : Number.POSITIVE_INFINITY;
      const origin = it.productId ? originMap.get(it.productId) ?? '' : '';
      const isChina = origin.toLowerCase().includes('china');
      const lineSales = round2(qty * price);
      let rate = 0;
      if (isChina) {
        if (markup >= COMMISSION.china.threshold) rate = COMMISSION.china.rate;
      } else if (markup >= COMMISSION.ph.threshold) {
        rate = COMMISSION.ph.rate;
      }
      rows.push({
        number: inv.number ?? '(no #)',
        date: day(inv.date),
        customer: inv.customerName,
        agent: effName,
        item: it.description,
        origin: origin || '—',
        qty,
        cost,
        sell: price,
        markup: Number.isFinite(markup) ? round2(markup * 100) : 100,
        sales: lineSales,
        rate: rate ? `${round2(rate * 100)}%` : '—',
        commission: round2(lineSales * rate),
      });
    }
  }
  return {
    title: 'Agent Commission — Detailed (paid invoices)',
    columns: [
      { key: 'number', label: 'Invoice #' },
      { key: 'date', label: 'Date' },
      { key: 'customer', label: 'Customer' },
      { key: 'agent', label: 'Agent' },
      { key: 'item', label: 'Item' },
      { key: 'origin', label: 'Origin' },
      { key: 'qty', label: 'Qty', align: 'right' },
      { key: 'cost', label: 'Cost', money: true },
      { key: 'sell', label: 'Sell', money: true },
      { key: 'markup', label: 'Markup %', align: 'right' },
      { key: 'sales', label: 'Line Sales', money: true },
      { key: 'rate', label: 'Rate' },
      { key: 'commission', label: 'Commission', money: true },
    ],
    totals: {
      sales: round2(rows.reduce((s, r) => s + (r.sales as number), 0)),
      commission: round2(rows.reduce((s, r) => s + (r.commission as number), 0)),
    },
    rows,
  };
}
