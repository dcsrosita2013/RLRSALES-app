import { Router, Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireRole } from '../../middleware/rbac';
import { requiredString, optionalString } from '../../lib/validation';
import * as svc from './check-vouchers.service';
import { streamCVPdf } from './check-voucher.pdf';

const router = Router();

function actor(req: Request): svc.Actor {
  return { id: req.user!.id, username: req.user!.username, role: req.user!.role };
}

const positiveNumber = z.preprocess(
  (v) => (typeof v === 'string' ? Number(v) : v),
  z.number({ invalid_type_error: 'Must be a number' }).positive('Amount must be greater than 0'),
);

const schema = z.object({
  number: optionalString,
  date: z.coerce.date().optional(),
  payee: requiredString,
  bank: optionalString,
  checkNumber: optionalString,
  checkDate: z.coerce.date().optional().nullable(),
  termsType: z.preprocess((v) => (v === '' || v == null ? null : v), z.enum(['COD', 'NET']).nullish()),
  amount: positiveNumber,
  purpose: optionalString,
  supplierId: optionalString,
  poId: optionalString,
});

const MANAGE = requireRole('ADMIN', 'FINANCE');

router.get('/', MANAGE, asyncHandler(async (req, res) => {
  res.json(
    await svc.listCVs({
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
    }),
  );
}));

router.get('/:id', MANAGE, asyncHandler(async (req, res) => {
  res.json(await svc.getCV(req.params.id));
}));

router.get('/:id/pdf', MANAGE, asyncHandler(async (req, res) => {
  const cv = await svc.getCV(req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="cv-${cv.number}.pdf"`);
  streamCVPdf(cv, res);
}));

router.post('/', MANAGE, asyncHandler(async (req, res) => {
  res.status(201).json(await svc.createCV(schema.parse(req.body), actor(req)));
}));

router.delete('/:id', MANAGE, asyncHandler(async (req, res) => {
  res.json(await svc.deleteCV(req.params.id, actor(req)));
}));

export default router;
