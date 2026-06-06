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
  tin: optionalString,
  contactNumber: optionalString,
  vatClass: z.enum(['VAT', 'VAT_ADD', 'ZERO_RATED', 'VAT_EXEMPT']),
  termsType: z.enum(['COD', 'NET']).default('COD'),
  netDays: z.preprocess(
    (v) => (v === '' || v == null ? null : typeof v === 'string' ? Number(v) : v),
    z.number().int().positive().max(365).nullish(),
  ),
  commissionable: z.boolean().optional().default(false),
  agentId: optionalString,
});

function serialize(c: {
  id: string; name: string; address: string | null; tin: string | null;
  contactNumber: string | null; vatClass: string; termsType: string; netDays: number | null;
  commissionable: boolean; agentId: string | null; agent: { id: string; name: string } | null; createdAt: Date;
}) {
  return {
    id: c.id,
    name: c.name,
    address: c.address,
    tin: c.tin,
    contactNumber: c.contactNumber,
    vatClass: c.vatClass,
    termsType: c.termsType,
    netDays: c.netDays,
    commissionable: c.commissionable,
    agentId: c.agentId,
    agent: c.agent ? { id: c.agent.id, name: c.agent.name } : null,
    createdAt: c.createdAt,
  };
}

router.get(
  '/',
  requireRole('ADMIN', 'AGENT', 'FINANCE'),
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const agentId = typeof req.query.agentId === 'string' ? req.query.agentId : undefined;
    const items = await prisma.customer.findMany({
      where: {
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
        ...(agentId ? { agentId } : {}),
      },
      orderBy: { name: 'asc' },
      include: { agent: { select: { id: true, name: true } } },
    });
    res.json(items.map(serialize));
  }),
);

router.post(
  '/',
  requireRole('ADMIN', 'AGENT'),
  asyncHandler(async (req, res) => {
    const data = schema.parse(req.body);
    const c = await prisma.customer.create({
      data: { ...data, agentId: data.agentId ?? null, netDays: data.termsType === 'NET' ? data.netDays ?? null : null },
      include: { agent: { select: { id: true, name: true } } },
    });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'CREATE', entityType: 'Customer', entityId: c.id, details: { name: c.name } });
    res.status(201).json(serialize(c));
  }),
);

router.put(
  '/:id',
  requireRole('ADMIN', 'AGENT'),
  asyncHandler(async (req, res) => {
    const data = schema.parse(req.body);
    const c = await prisma.customer.update({
      where: { id: req.params.id },
      data: { ...data, agentId: data.agentId ?? null, netDays: data.termsType === 'NET' ? data.netDays ?? null : null },
      include: { agent: { select: { id: true, name: true } } },
    });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'UPDATE', entityType: 'Customer', entityId: c.id });
    res.json(serialize(c));
  }),
);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const [invoices, quotations, drs, collections] = await Promise.all([
      prisma.salesInvoice.count({ where: { customerId: req.params.id } }),
      prisma.quotation.count({ where: { customerId: req.params.id } }),
      prisma.deliveryReceipt.count({ where: { customerId: req.params.id } }),
      prisma.collection.count({ where: { customerId: req.params.id } }),
    ]);
    const refs = invoices + quotations + drs + collections;
    if (refs > 0) throw new ApiError(409, `Cannot delete: customer has ${refs} related document(s)`);
    await prisma.customer.delete({ where: { id: req.params.id } });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'DELETE', entityType: 'Customer', entityId: req.params.id });
    res.json({ ok: true });
  }),
);

export default router;
