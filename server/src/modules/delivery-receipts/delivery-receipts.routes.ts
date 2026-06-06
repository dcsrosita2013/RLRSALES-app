import { Router, Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireRole } from '../../middleware/rbac';
import { requiredString, optionalString } from '../../lib/validation';
import * as svc from './delivery-receipts.service';
import { streamDRPdf } from './delivery-receipt.pdf';

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
});

const drSchema = z.object({
  number: optionalString,
  date: z.coerce.date().optional(),
  poNumber: optionalString,
  customerId: requiredString,
  agentId: optionalString,
  termsType: z.enum(['COD', 'NET']),
  netDays: z.preprocess(
    (v) => (v === '' || v == null ? null : typeof v === 'string' ? Number(v) : v),
    z.number().int().positive().max(365).nullish(),
  ),
  invoiceId: optionalString,
  notes: optionalString,
  items: z.array(itemSchema).min(1, 'Add at least one line item'),
});

// Delivery receipts: viewable/editable by Admin, Agent, Warehouse.
const ALL = requireRole('ADMIN', 'AGENT', 'WAREHOUSE');

router.get('/', ALL, asyncHandler(async (req, res) => {
  res.json(
    await svc.listDRs({
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      customerId: typeof req.query.customerId === 'string' ? req.query.customerId : undefined,
      dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
    }),
  );
}));

router.get('/:id', ALL, asyncHandler(async (req, res) => {
  res.json(await svc.getDR(req.params.id));
}));

router.get('/:id/pdf', ALL, asyncHandler(async (req, res) => {
  const dr = await svc.getDR(req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="dr-${dr.number}.pdf"`);
  streamDRPdf(dr, res);
}));

router.post('/', ALL, asyncHandler(async (req, res) => {
  res.status(201).json(await svc.createDR(drSchema.parse(req.body), actor(req)));
}));

router.put('/:id', ALL, asyncHandler(async (req, res) => {
  res.json(await svc.updateDR(req.params.id, drSchema.parse(req.body), actor(req)));
}));

router.delete('/:id', ALL, asyncHandler(async (req, res) => {
  res.json(await svc.deleteDR(req.params.id, actor(req)));
}));

export default router;
