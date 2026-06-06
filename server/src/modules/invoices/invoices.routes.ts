import { Router, Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireRole } from '../../middleware/rbac';
import { requiredString, optionalString, nonNegativeNumber } from '../../lib/validation';
import * as svc from './invoices.service';
import { streamInvoicePdf } from './invoice.pdf';

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
  unitPrice: nonNegativeNumber,
});

const invoiceSchema = z.object({
  customerId: requiredString,
  number: optionalString,
  date: z.coerce.date().optional(),
  termsType: z.enum(['COD', 'NET']),
  netDays: z.preprocess(
    (v) => (v === '' || v == null ? null : typeof v === 'string' ? Number(v) : v),
    z.number().int().positive().max(365).nullish(),
  ),
  poNumber: optionalString,
  agentId: optionalString,
  addVat: z.boolean().default(true),
  discount: nonNegativeNumber.default(0),
  items: z.array(itemSchema).default([]),
});

const VIEW = requireRole('ADMIN', 'AGENT', 'FINANCE');
const CREATE = requireRole('ADMIN', 'AGENT');

router.get(
  '/',
  VIEW,
  asyncHandler(async (req, res) => {
    const items = await svc.listInvoices(
      {
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        paymentStatus: typeof req.query.paymentStatus === 'string' ? req.query.paymentStatus : undefined,
        dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
        dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
      },
      actor(req),
    );
    res.json(items);
  }),
);

router.get(
  '/:id',
  VIEW,
  asyncHandler(async (req, res) => {
    res.json(await svc.getInvoice(req.params.id, actor(req)));
  }),
);

router.get(
  '/:id/pdf',
  VIEW,
  asyncHandler(async (req, res) => {
    const inv = await svc.getInvoice(req.params.id, actor(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${inv.number ?? 'draft'}.pdf"`);
    streamInvoicePdf(inv, res);
  }),
);

router.post(
  '/',
  CREATE,
  asyncHandler(async (req, res) => {
    const data = invoiceSchema.parse(req.body);
    res.status(201).json(await svc.createInvoice(data, actor(req)));
  }),
);

router.put(
  '/:id',
  CREATE,
  asyncHandler(async (req, res) => {
    const data = invoiceSchema.parse(req.body);
    res.json(await svc.updateInvoice(req.params.id, data, actor(req)));
  }),
);

router.post(
  '/:id/finalize',
  CREATE,
  asyncHandler(async (req, res) => {
    res.json(await svc.finalizeInvoice(req.params.id, actor(req)));
  }),
);

router.post(
  '/:id/void',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    res.json(await svc.voidInvoice(req.params.id, actor(req)));
  }),
);

const paymentSchema = z.object({ paid: z.boolean() });
router.post(
  '/:id/payment',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { paid } = paymentSchema.parse(req.body);
    res.json(await svc.setPaymentStatus(req.params.id, paid, actor(req)));
  }),
);

router.delete(
  '/:id',
  CREATE,
  asyncHandler(async (req, res) => {
    res.json(await svc.deleteInvoice(req.params.id, actor(req)));
  }),
);

const deleteSchema = z.object({ password: z.string().min(1, 'Password is required') });
router.post(
  '/:id/force-delete',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { password } = deleteSchema.parse(req.body);
    res.json(await svc.forceDeleteInvoice(req.params.id, password, actor(req)));
  }),
);

export default router;
