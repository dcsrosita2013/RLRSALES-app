import type { POApprovalStatus } from './types';

export const PO_APPROVAL_COLOR: Record<POApprovalStatus, 'amber' | 'green' | 'red'> = {
  PENDING: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
};
