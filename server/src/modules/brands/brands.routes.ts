import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../middleware/error';
import { requireRole } from '../../middleware/rbac';
import { requiredString } from '../../lib/validation';
import { writeAudit } from '../../lib/audit';

const router = Router();
const schema = z.object({ name: requiredString });

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await prisma.brand.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    res.json(items.map((b) => ({ id: b.id, name: b.name, productCount: b._count.products })));
  }),
);

router.post(
  '/',
  requireRole('ADMIN', 'WAREHOUSE'),
  asyncHandler(async (req, res) => {
    const { name } = schema.parse(req.body);
    const b = await prisma.brand.create({ data: { name } });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'CREATE', entityType: 'Brand', entityId: b.id, details: { name } });
    res.status(201).json(b);
  }),
);

router.put(
  '/:id',
  requireRole('ADMIN', 'WAREHOUSE'),
  asyncHandler(async (req, res) => {
    const { name } = schema.parse(req.body);
    const b = await prisma.brand.update({ where: { id: req.params.id }, data: { name } });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'UPDATE', entityType: 'Brand', entityId: b.id, details: { name } });
    res.json(b);
  }),
);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const count = await prisma.product.count({ where: { brandId: req.params.id } });
    if (count > 0) throw new ApiError(409, `Cannot delete: ${count} product(s) use this brand`);
    await prisma.brand.delete({ where: { id: req.params.id } });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'DELETE', entityType: 'Brand', entityId: req.params.id });
    res.json({ ok: true });
  }),
);

export default router;
