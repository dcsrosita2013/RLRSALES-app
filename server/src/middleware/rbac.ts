import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { ApiError } from './error';

// Guards a route so only the listed roles may proceed. Enforced server-side.
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(401, 'Authentication required');
    }
    if (!roles.includes(req.user.role)) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }
    next();
  };
}
