import { Router, Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireRole } from '../../middleware/rbac';
import { requiredString, optionalString, nonNegativeNumber } from '../../lib/validation';
import * as svc from './quotations.service';
import { streamQuotationPdf } from './quotation.pdf';

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
  markupOption: optionalString,
  unitPrice: nonNegativeNumber,
});

const quotationSchema = z.object({
  number: optionalString,
  date: z.coerce.date().optional(),
  customerId: requiredString,
  attention: optionalString,
  department: optionalString,
  prNumber: optionalString,
  agentId: optionalString,
  validUntil: z.coerce.date().optional().nullable(),
  notes: optionalString,
  items: z.array(itemSchema).min(1, 'Add at least one line item'),
});

const MANAGE = requireRole('ADMIN', 'AGENT');

router.get('/', MANAGE, asyncHandler(async (req, res) => {
  res.json(
    await svc.listQuotations({
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
    }),
  );
}));

router.get('/:id', MANAGE, asyncHandler(async (req, res) => {
  res.json(await svc.getQuotation(req.params.id));
}));

router.get('/:id/pdf', MANAGE, asyncHandler(async (req, res) => {
  const q = await svc.getQuotation(req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="quotation-${q.number}.pdf"`);
  streamQuotationPdf(q, res);
}));

router.post('/', MANAGE, asyncHandler(async (req, res) => {
  res.status(201).json(await svc.createQuotation(quotationSchema.parse(req.body), actor(req)));
}));

router.put('/:id', MANAGE, asyncHandler(async (req, res) => {
  res.json(await svc.updateQuotation(req.params.id, quotationSchema.parse(req.body), actor(req)));
}));

router.post('/:id/convert', MANAGE, asyncHandler(async (req, res) => {
  res.status(201).json(await svc.convertToInvoice(req.params.id, actor(req)));
}));

router.delete('/:id', MANAGE, asyncHandler(async (req, res) => {
  res.json(await svc.deleteQuotation(req.params.id, actor(req)));
}));

export default router;
