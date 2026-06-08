import { User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { verifyPassword, hashPassword } from '../../lib/password';
import { signToken } from '../../lib/jwt';
import { writeAudit } from '../../lib/audit';
import { ApiError } from '../../middleware/error';

function publicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    agentId: user.agentId,
    isActive: user.isActive,
    hasSignature: Boolean(user.signature),
  };
}

export async function login(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.isActive) {
    throw new ApiError(401, 'Invalid username or password');
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw new ApiError(401, 'Invalid username or password');
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await writeAudit({
    userId: user.id,
    username: user.username,
    action: 'LOGIN',
    entityType: 'User',
    entityId: user.id,
  });

  const token = signToken({
    sub: user.id,
    username: user.username,
    role: user.role,
    fullName: user.fullName,
  });
  return { token, user: publicUser(user) };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');
  return publicUser(user);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw new ApiError(400, 'Current password is incorrect');

  if (currentPassword === newPassword) {
    throw new ApiError(400, 'New password must be different from the current password');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: false },
  });
  await writeAudit({
    userId: user.id,
    username: user.username,
    action: 'CHANGE_PASSWORD',
    entityType: 'User',
    entityId: user.id,
  });
  return { ok: true };
}

// The signing user's own e-signature (base64 data URL), used on PO "Prepared by".
export async function getMySignature(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { signature: true } });
  if (!user) throw new ApiError(404, 'User not found');
  return { signature: user.signature ?? null };
}

export async function setMySignature(userId: string, signature: string | null) {
  const value = signature && signature.trim() ? signature.trim() : null;
  if (value && value.length > 700_000) {
    throw new ApiError(400, 'Signature image is too large — please use a smaller / simpler image');
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { signature: value },
    select: { username: true, signature: true },
  });
  await writeAudit({
    userId,
    username: updated.username,
    action: value ? 'SET_SIGNATURE' : 'CLEAR_SIGNATURE',
    entityType: 'User',
    entityId: userId,
  });
  return { hasSignature: Boolean(updated.signature) };
}
