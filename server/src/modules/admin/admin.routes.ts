import { Router } from 'express';
import { z } from 'zod';
import { DocType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../middleware/error';
import { requireRole } from '../../middleware/rbac';
import { requiredString } from '../../lib/validation';
import { hashPassword } from '../../lib/password';
import { writeAudit } from '../../lib/audit';
import { runBackup } from '../../lib/backup';

const router = Router();
router.use(requireRole('ADMIN'));

function tempPassword(): string {
  return `Rlr-${Math.random().toString(36).slice(2, 8)}${Math.floor(10 + Math.random() * 89)}`;
}

// ---- Backups ----
router.post(
  '/backup',
  asyncHandler(async (req, res) => {
    const result = await runBackup(req.user!.id);
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'BACKUP', entityType: 'Backup', details: { filename: result.filename } });
    res.status(201).json({ filename: result.filename, sizeBytes: result.sizeBytes });
  }),
);

router.get(
  '/backups',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.backup.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { createdBy: { select: { fullName: true } } },
    });
    res.json(
      rows.map((b) => ({ id: b.id, filename: b.filename, sizeBytes: b.sizeBytes, createdAt: b.createdAt, createdBy: b.createdBy?.fullName ?? null })),
    );
  }),
);

// ---- Audit trail ----
router.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const where: Record<string, unknown> = {};
    if (typeof req.query.entityType === 'string' && req.query.entityType) where.entityType = req.query.entityType;
    if (typeof req.query.action === 'string' && req.query.action) where.action = req.query.action;
    if (typeof req.query.dateFrom === 'string' || typeof req.query.dateTo === 'string') {
      const range: Record<string, Date> = {};
      if (typeof req.query.dateFrom === 'string' && req.query.dateFrom) range.gte = new Date(req.query.dateFrom);
      if (typeof req.query.dateTo === 'string' && req.query.dateTo) range.lte = new Date(`${req.query.dateTo}T23:59:59`);
      where.createdAt = range;
    }
    const rows = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300 });
    res.json(
      rows.map((a) => ({
        id: a.id,
        createdAt: a.createdAt,
        username: a.username,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        details: a.details,
      })),
    );
  }),
);

// ---- Document numbering ----
router.get(
  '/sequences',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.documentSequence.findMany({ orderBy: { docType: 'asc' } });
    res.json(rows.map((s) => ({ docType: s.docType, prefix: s.prefix, nextNumber: s.nextNumber, padding: s.padding })));
  }),
);

const seqSchema = z.object({
  prefix: z.string().trim().max(12),
  nextNumber: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().int().positive().max(99999999)),
  padding: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().int().min(1).max(10)),
});
router.put(
  '/sequences/:docType',
  asyncHandler(async (req, res) => {
    const docType = req.params.docType as DocType;
    if (!Object.values(DocType).includes(docType)) throw new ApiError(400, 'Unknown document type');
    const data = seqSchema.parse(req.body);
    const s = await prisma.documentSequence.update({ where: { docType }, data });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'UPDATE', entityType: 'DocumentSequence', entityId: docType, details: data });
    res.json({ docType: s.docType, prefix: s.prefix, nextNumber: s.nextNumber, padding: s.padding });
  }),
);

// ---- Users ----
router.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { username: 'asc' },
      select: { id: true, username: true, fullName: true, role: true, isActive: true, mustChangePassword: true, lastLoginAt: true, agentId: true },
    });
    res.json(users);
  }),
);

const createUserSchema = z.object({
  username: requiredString.regex(/^[a-zA-Z0-9._-]+$/, 'Letters, numbers, . _ - only'),
  fullName: requiredString,
  role: z.enum(['ADMIN', 'AGENT', 'WAREHOUSE', 'FINANCE']),
  agentId: z.string().optional().nullable(),
  password: z.string().min(8).optional(),
});
router.post(
  '/users',
  asyncHandler(async (req, res) => {
    const data = createUserSchema.parse(req.body);
    const pw = data.password || tempPassword();
    const user = await prisma.user.create({
      data: {
        username: data.username,
        fullName: data.fullName,
        role: data.role,
        agentId: data.agentId || null,
        passwordHash: await hashPassword(pw),
        mustChangePassword: true,
      },
    });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'CREATE', entityType: 'User', entityId: user.id, details: { username: user.username, role: user.role } });
    res.status(201).json({ id: user.id, username: user.username, tempPassword: pw });
  }),
);

const updateUserSchema = z.object({
  fullName: requiredString,
  role: z.enum(['ADMIN', 'AGENT', 'WAREHOUSE', 'FINANCE']),
  isActive: z.boolean(),
  agentId: z.string().optional().nullable(),
});
router.put(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const data = updateUserSchema.parse(req.body);
    if (req.params.id === req.user!.id && !data.isActive) throw new ApiError(400, 'You cannot deactivate your own account');
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { fullName: data.fullName, role: data.role, isActive: data.isActive, agentId: data.agentId || null },
      select: { id: true, username: true, fullName: true, role: true, isActive: true },
    });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'UPDATE', entityType: 'User', entityId: user.id });
    res.json(user);
  }),
);

// Reset password: with no body → random temp (user must change on next login);
// with { password } → admin sets that exact password (ready to use immediately).
const resetPwSchema = z.object({ password: z.string().min(8, 'Password must be at least 8 characters').optional() });
router.post(
  '/users/:id/reset-password',
  asyncHandler(async (req, res) => {
    const { password } = resetPwSchema.parse(req.body ?? {});
    const pw = password || tempPassword();
    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash: await hashPassword(pw), mustChangePassword: !password },
    });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: password ? 'SET_PASSWORD' : 'RESET_PASSWORD', entityType: 'User', entityId: req.params.id });
    res.json({ tempPassword: password ? null : pw });
  }),
);

// Hard-delete a user. Linked documents keep their data (created-by is set to null).
router.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.id) throw new ApiError(400, 'You cannot delete your own account');
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { username: true, role: true } });
    if (!target) throw new ApiError(404, 'User not found');
    if (target.role === 'ADMIN') {
      const admins = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (admins <= 1) throw new ApiError(400, 'Cannot delete the last admin account');
    }
    await prisma.user.delete({ where: { id: req.params.id } });
    await writeAudit({ userId: req.user!.id, username: req.user!.username, action: 'DELETE', entityType: 'User', entityId: req.params.id, details: { username: target.username } });
    res.json({ ok: true });
  }),
);

export default router;
