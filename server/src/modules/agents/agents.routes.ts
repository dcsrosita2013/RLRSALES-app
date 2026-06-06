import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../middleware/error';
import { requireRole } from '../../middleware/rbac';
import { requiredString, optionalString } from '../../lib/validation';
import { writeAudit } from '../../lib/audit';

const router = Router();

const schema = z.object({
  name: requiredString,
  address: optionalString,
  contactNumber: optionalString,
});

// Viewable by roles that assign agents (dropdowns); managed by Admin only.
router.get(
  '/',
  requireRole('ADMIN', 'AGENT', 'FINANCE'),
  asyncHandler(async (_req, res) => {
    const items = await prisma.agent.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { customers: true } } },
    });
    res.json(
      items.map((a) => ({
        id: a.id,
        name: a.name,
        address: a.address,
        contactNumber: a.contactNumber,
        customerCount: a._count.customers,
      })),
    );
  }),
);

router.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const data = schema.parse(req.body);
    const a = await prisma.agent.create({ data });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'CREATE', entityType: 'Agent', entityId: a.id, details: { name: a.name } });
    res.status(201).json(a);
  }),
);

router.put(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const data = schema.parse(req.body);
    const a = await prisma.agent.update({ where: { id: req.params.id }, data });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'UPDATE', entityType: 'Agent', entityId: a.id });
    res.json(a);
  }),
);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const [customers, users] = await Promise.all([
      prisma.customer.count({ where: { agentId: req.params.id } }),
      prisma.user.count({ where: { agentId: req.params.id } }),
    ]);
    if (customers > 0 || users > 0) {
      throw new ApiError(409, `Cannot delete: agent is linked to ${customers} customer(s) and ${users} user(s)`);
    }
    await prisma.agent.delete({ where: { id: req.params.id } });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'DELETE', entityType: 'Agent', entityId: req.params.id });
    res.json({ ok: true });
  }),
);

export default router;
