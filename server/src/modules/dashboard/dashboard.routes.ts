import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../middleware/error';

const router = Router();

const toNum = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === 'number' ? d : Number(d);
const round2 = (n: number) => Math.round(n * 100) / 100;
const dkey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mkey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// Daily + monthly sales monitoring. Agents see their own; others see all.
router.get(
  '/sales-monitor',
  asyncHandler(async (req, res) => {
    const where: Prisma.SalesInvoiceWhereInput = { status: 'FINALIZED' };
    if (req.user!.role === 'AGENT') where.createdById = req.user!.id;

    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const start6mo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const rows = await prisma.salesInvoice.findMany({
      where: { ...where, date: { gte: start6mo } },
      select: { date: true, total: true },
    });

    let todayTotal = 0;
    let todayCount = 0;
    let monthTotal = 0;
    let monthCount = 0;
    const dayMap = new Map<string, number>();
    const monthMap = new Map<string, number>();
    for (const inv of rows) {
      const t = toNum(inv.total);
      if (inv.date >= startToday) {
        todayTotal += t;
        todayCount += 1;
      }
      if (inv.date >= startMonth) {
        monthTotal += t;
        monthCount += 1;
      }
      dayMap.set(dkey(inv.date), (dayMap.get(dkey(inv.date)) ?? 0) + t);
      monthMap.set(mkey(inv.date), (monthMap.get(mkey(inv.date)) ?? 0) + t);
    }

    const byDay: { date: string; total: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(startToday);
      d.setDate(d.getDate() - i);
      byDay.push({ date: dkey(d), total: round2(dayMap.get(dkey(d)) ?? 0) });
    }
    const byMonth: { month: string; label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      byMonth.push({
        month: mkey(d),
        label: d.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }),
        total: round2(monthMap.get(mkey(d)) ?? 0),
      });
    }

    res.json({ todayTotal: round2(todayTotal), todayCount, monthTotal: round2(monthTotal), monthCount, byDay, byMonth });
  }),
);

export default router;
