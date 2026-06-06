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
    const items = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    res.json(items.map((c) => ({ id: c.id, name: c.name, productCount: c._count.products })));
  }),
);

router.post(
  '/',
  requireRole('ADMIN', 'WAREHOUSE'),
  asyncHandler(async (req, res) => {
    const { name } = schema.parse(req.body);
    const c = await prisma.category.create({ data: { name } });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'CREATE', entityType: 'Category', entityId: c.id, details: { name } });
    res.status(201).json(c);
  }),
);

router.put(
  '/:id',
  requireRole('ADMIN', 'WAREHOUSE'),
  asyncHandler(async (req, res) => {
    const { name } = schema.parse(req.body);
    const c = await prisma.category.update({ where: { id: req.params.id }, data: { name } });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'UPDATE', entityType: 'Category', entityId: c.id, details: { name } });
    res.json(c);
  }),
);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const count = await prisma.product.count({ where: { categoryId: req.params.id } });
    if (count > 0) throw new ApiError(409, `Cannot delete: ${count} product(s) use this category`);
    await prisma.category.delete({ where: { id: req.params.id } });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'DELETE', entityType: 'Category', entityId: req.params.id });
    res.json({ ok: true });
  }),
);

export default router;
