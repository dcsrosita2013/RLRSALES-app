import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export interface AuditInput {
  userId?: string | null;
  username?: string | null;
  action: string; // LOGIN, CREATE, UPDATE, FINALIZE, VOID, MARK_PAID, MARK_UNPAID, RECEIVE, BACKUP...
  entityType: string;
  entityId?: string | null;
  details?: Prisma.InputJsonValue;
}

// Records who did what. Pass a transaction client to keep the log atomic with the change.
export async function writeAudit(
  input: AuditInput,
  client: Prisma.TransactionClient = prisma,
): Promise<void> {
  await client.auditLog.create({
    data: {
      userId: input.userId ?? null,
      username: input.username ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      details: input.details,
    },
  });
}
