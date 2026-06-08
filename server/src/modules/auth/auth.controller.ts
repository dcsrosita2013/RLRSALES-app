import { Request, Response } from 'express';
import { z } from 'zod';
import * as authService from './auth.service';
import { asyncHandler, ApiError } from '../../middleware/error';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = loginSchema.parse(req.body);
  const result = await authService.login(username, password);
  res.json(result);
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new ApiError(401, 'Authentication required');
  const user = await authService.getMe(req.user.id);
  res.json({ user });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .regex(/[A-Za-z]/, 'Include at least one letter')
    .regex(/[0-9]/, 'Include at least one number'),
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new ApiError(401, 'Authentication required');
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const result = await authService.changePassword(req.user.id, currentPassword, newPassword);
  res.json(result);
});

export const getSignature = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new ApiError(401, 'Authentication required');
  res.json(await authService.getMySignature(req.user.id));
});

const signatureSchema = z.object({ signature: z.string().nullable() });

export const setSignature = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new ApiError(401, 'Authentication required');
  const { signature } = signatureSchema.parse(req.body);
  res.json(await authService.setMySignature(req.user.id, signature));
});
