import { Router, Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireRole } from '../../middleware/rbac';
import { requiredString, optionalString } from '../../lib/validation';
import * as svc from './collections.service';

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
  customerId: requiredString,
  invoiceId: optionalString,
  amount: positiveNumber,
  method: z.enum(['CASH', 'CHECK', 'BANK_TRANSFER']),
  checkNumber: optionalString,
  checkBank: optionalString,
  checkDate: z.coerce.date().optional().nullable(),
  bankRef: optionalString,
  notes: optionalString,
});

const MANAGE = requireRole('ADMIN', 'FINANCE');

router.get('/', MANAGE, asyncHandler(async (req, res) => {
  res.json(
    await svc.listCollections({
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      customerId: typeof req.query.customerId === 'string' ? req.query.customerId : undefined,
      invoiceId: typeof req.query.invoiceId === 'string' ? req.query.invoiceId : undefined,
      method: typeof req.query.method === 'string' ? req.query.method : undefined,
      dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
    }),
  );
}));

router.get('/:id', MANAGE, asyncHandler(async (req, res) => {
  res.json(await svc.getCollection(req.params.id));
}));

router.post('/', MANAGE, asyncHandler(async (req, res) => {
  res.status(201).json(await svc.createCollection(schema.parse(req.body), actor(req)));
}));

// Deleting a recorded payment is Admin-only (safety — Finance can record but not delete).
router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  res.json(await svc.deleteCollection(req.params.id, actor(req)));
}));

export default router;
