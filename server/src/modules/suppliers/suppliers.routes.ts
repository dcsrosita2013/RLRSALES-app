import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../middleware/error';
import { requireRole } from '../../middleware/rbac';
import { requiredString, optionalString } from '../../lib/validation';
import { writeAudit } from '../../lib/audit';

const router = Router();

const schema = z
  .object({
    name: requiredString,
    address: optionalString,
    tin: optionalString,
    contactNumber: optionalString,
    termsType: z.enum(['COD', 'NET']),
    netDays: z.preprocess(
      (v) => (v === '' || v == null ? null : typeof v === 'string' ? Number(v) : v),
      z.number().int().positive().max(365).nullish(),
    ),
  })
  .refine((d) => d.termsType !== 'NET' || (d.netDays != null && d.netDays > 0), {
    message: 'Net terms require a number of days',
    path: ['netDays'],
  });

router.get(
  '/',
  requireRole('ADMIN', 'WAREHOUSE', 'FINANCE'),
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const items = await prisma.supplier.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
      orderBy: { name: 'asc' },
    });
    res.json(items);
  }),
);

router.post(
  '/',
  requireRole('ADMIN', 'WAREHOUSE'),
  asyncHandler(async (req, res) => {
    const data = schema.parse(req.body);
    const s = await prisma.supplier.create({
      data: { ...data, netDays: data.termsType === 'NET' ? data.netDays ?? null : null },
    });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'CREATE', entityType: 'Supplier', entityId: s.id, details: { name: s.name } });
    res.status(201).json(s);
  }),
);

router.put(
  '/:id',
  requireRole('ADMIN', 'WAREHOUSE'),
  asyncHandler(async (req, res) => {
    const data = schema.parse(req.body);
    const s = await prisma.supplier.update({
      where: { id: req.params.id },
      data: { ...data, netDays: data.termsType === 'NET' ? data.netDays ?? null : null },
    });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'UPDATE', entityType: 'Supplier', entityId: s.id });
    res.json(s);
  }),
);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const [pos, payments, vouchers] = await Promise.all([
      prisma.purchaseOrder.count({ where: { supplierId: req.params.id } }),
      prisma.supplierPayment.count({ where: { supplierId: req.params.id } }),
      prisma.checkVoucher.count({ where: { supplierId: req.params.id } }),
    ]);
    const refs = pos + payments + vouchers;
    if (refs > 0) throw new ApiError(409, `Cannot delete: supplier has ${refs} related record(s)`);
    await prisma.supplier.delete({ where: { id: req.params.id } });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'DELETE', entityType: 'Supplier', entityId: req.params.id });
    res.json({ ok: true });
  }),
);

export default router;
