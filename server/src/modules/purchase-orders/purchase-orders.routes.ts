import { Router, Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireRole } from '../../middleware/rbac';
import { requiredString, optionalString, nonNegativeNumber } from '../../lib/validation';
import * as svc from './purchase-orders.service';
import { streamPOPdf } from './purchase-order.pdf';

const router = Router();

function actor(req: Request): svc.Actor {
  return { id: req.user!.id, username: req.user!.username, role: req.user!.role };
}

const positiveNumber = z.preprocess(
  (v) => (typeof v === 'string' ? Number(v) : v),
  z.number({ invalid_type_error: 'Must be a number' }).positive('Must be greater than 0'),
);

const itemSchema = z.object({
  productId: optionalString,
  description: z.string().trim().max(500).optional().default(''),
  qty: positiveNumber,
  unit: requiredString,
  unitCost: nonNegativeNumber,
  floor: z.preprocess((v) => (v === '' || v == null ? null : v), z.enum(['FIRST', 'SECOND']).nullish()),
  roomNumber: optionalString,
});

const poSchema = z.object({
  supplierId: requiredString,
  invoiceDate: z.coerce.date().optional(),
  termsType: z.enum(['COD', 'NET']),
  netDays: z.preprocess(
    (v) => (v === '' || v == null ? null : typeof v === 'string' ? Number(v) : v),
    z.number().int().positive().max(365).nullish(),
  ),
  notes: optionalString,
  items: z.array(itemSchema).min(1, 'Add at least one line item'),
});

const VIEW = requireRole('ADMIN', 'WAREHOUSE', 'FINANCE');
const MANAGE = requireRole('ADMIN', 'WAREHOUSE');

router.get('/', VIEW, asyncHandler(async (req, res) => {
  res.json(
    await svc.listPOs({
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      approvalStatus: typeof req.query.approvalStatus === 'string' ? req.query.approvalStatus : undefined,
      paymentStatus: typeof req.query.paymentStatus === 'string' ? req.query.paymentStatus : undefined,
      received: typeof req.query.received === 'string' ? req.query.received : undefined,
      supplierId: typeof req.query.supplierId === 'string' ? req.query.supplierId : undefined,
      dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
    }),
  );
}));

router.get('/:id', VIEW, asyncHandler(async (req, res) => {
  res.json(await svc.getPO(req.params.id));
}));

router.get('/:id/pdf', VIEW, asyncHandler(async (req, res) => {
  const po = await svc.getPO(req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="po-${po.number}.pdf"`);
  streamPOPdf(po, res);
}));

router.post('/', MANAGE, asyncHandler(async (req, res) => {
  res.status(201).json(await svc.createPO(poSchema.parse(req.body), actor(req)));
}));

router.put('/:id', MANAGE, asyncHandler(async (req, res) => {
  res.json(await svc.updatePO(req.params.id, poSchema.parse(req.body), actor(req)));
}));

// Admin-only approval
router.post('/:id/approve', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  res.json(await svc.approvePO(req.params.id, actor(req)));
}));

const rejectSchema = z.object({ reason: optionalString });
router.post('/:id/reject', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { reason } = rejectSchema.parse(req.body);
  res.json(await svc.rejectPO(req.params.id, (reason as string | null) ?? null, actor(req)));
}));

router.post('/:id/receive', MANAGE, asyncHandler(async (req, res) => {
  res.json(await svc.receivePO(req.params.id, actor(req)));
}));

const paymentSchema = z.object({ paid: z.boolean() });
router.post('/:id/payment', requireRole('ADMIN', 'FINANCE'), asyncHandler(async (req, res) => {
  const { paid } = paymentSchema.parse(req.body);
  res.json(await svc.setPOPayment(req.params.id, paid, actor(req)));
}));

router.delete('/:id', MANAGE, asyncHandler(async (req, res) => {
  res.json(await svc.deletePO(req.params.id, actor(req)));
}));

const deleteSchema = z.object({ password: z.string().min(1, 'Password is required') });
router.post('/:id/force-delete', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { password } = deleteSchema.parse(req.body);
  res.json(await svc.forceDeletePO(req.params.id, password, actor(req)));
}));

export default router;
