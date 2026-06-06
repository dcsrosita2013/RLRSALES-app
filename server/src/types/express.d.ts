import { Role } from '@prisma/client';

// Augments Express Request with the authenticated user set by requireAuth.
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        role: Role;
        fullName: string;
      };
    }
  }
}

export {};
