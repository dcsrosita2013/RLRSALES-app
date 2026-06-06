import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../config/env';

export interface JwtPayload {
  sub: string; // user id
  username: string;
  role: Role;
  fullName: string;
}

export function signToken(payload: JwtPayload): string {
  const options = { expiresIn: env.jwtExpiresIn } as unknown as jwt.SignOptions;
  return jwt.sign(payload, env.jwtSecret, options);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret) as unknown as JwtPayload;
}
