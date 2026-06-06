import { Router, Request } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { asyncHandler, ApiError } from '../../middleware/error';
import { requireRole } from '../../middleware/rbac';
import { requiredString, optionalString, nonNegativeNumber } from '../../lib/validation';
import * as svc from './products.service';
import { importProducts } from './products.import';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function actor(req: Request): svc.Actor {
  return { id: req.user!.id, username: req.user!.username, role: req.user!.role };
}

const stockSchema = z.object({
  floor: z.enum(['FIRST', 'SECOND']),
  roomNumber: requiredString,
  quantity: nonNegativeNumber,
});

const productSchema = z.object({
  name: requiredString,
  description: optionalString,
  categoryId: optionalString,
  brandId: optionalString,
  unit: requiredString,
  origin: optionalString,
  costPrice: nonNegativeNumber.optional(),
  basePrice: nonNegativeNumber.optional(),
  stocks: z.array(stockSchema).optional(),
});

const adjustSchema = z.object({
  delta: z.preprocess(
    (v) => (typeof v === 'string' ? Number(v) : v),
    z.number().refine((n) => n !== 0, 'Adjustment cannot be zero'),
  ),
  note: optionalString,
});

const VIEW = requireRole('ADMIN', 'WAREHOUSE', 'AGENT');
const MANAGE = requireRole('ADMIN', 'WAREHOUSE');

// Origin (China/PH) is used for commission, so it is hidden from sales agents.
const hideOrigin = (req: Request) => req.user!.role === 'AGENT';

router.get(
  '/',
  VIEW,
  asyncHandler(async (req, res) => {
    const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : NaN;
    const items = await svc.listProducts({
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      categoryId: typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined,
      brandId: typeof req.query.brandId === 'string' ? req.query.brandId : undefined,
      limit: Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : undefined,
    });
    res.json(hideOrigin(req) ? items.map((p) => ({ ...p, origin: null })) : items);
  }),
);

router.get(
  '/:id',
  VIEW,
  asyncHandler(async (req, res) => {
    const p = await svc.getProduct(req.params.id);
    res.json(hideOrigin(req) ? { ...p, origin: null } : p);
  }),
);

router.post(
  '/',
  MANAGE,
  asyncHandler(async (req, res) => {
    const data = productSchema.parse(req.body);
    res.status(201).json(await svc.createProduct(data, actor(req)));
  }),
);

// Bulk import products + stock from a CSV or Excel file (Admin only).
router.post(
  '/import',
  requireRole('ADMIN'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'No file uploaded');
    const isCsv = req.file.originalname.toLowerCase().endsWith('.csv') || (req.file.mimetype || '').includes('csv');
    res.json(await importProducts(req.file.buffer, isCsv, actor(req)));
  }),
);

router.put(
  '/:id',
  MANAGE,
  asyncHandler(async (req, res) => {
    const data = productSchema.parse(req.body);
    res.json(await svc.updateProduct(req.params.id, data, actor(req)));
  }),
);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    res.json(await svc.deleteProduct(req.params.id, actor(req)));
  }),
);

// ---- Stock locations ----
router.post(
  '/:id/stock',
  MANAGE,
  asyncHandler(async (req, res) => {
    const data = stockSchema.parse(req.body);
    res.status(201).json(await svc.addStockLocation(req.params.id, data, actor(req)));
  }),
);

router.post(
  '/:id/stock/:stockId/adjust',
  MANAGE,
  asyncHandler(async (req, res) => {
    const data = adjustSchema.parse(req.body);
    res.json(await svc.adjustStock(req.params.id, req.params.stockId, data, actor(req)));
  }),
);

router.delete(
  '/:id/stock/:stockId',
  MANAGE,
  asyncHandler(async (req, res) => {
    res.json(await svc.deleteStockLocation(req.params.id, req.params.stockId, actor(req)));
  }),
);

export default router;
