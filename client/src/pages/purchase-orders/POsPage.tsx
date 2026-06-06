import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, ShoppingCart, Search, ChevronRight, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { DataTable, Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { PasswordConfirmDialog } from '../../components/ui/PasswordConfirmDialog';
import { useList } from '../../hooks/useList';
import { PurchaseOrdersApi } from '../../lib/resources';
import { apiErrorMessage } from '../../lib/api';
import { peso, formatDate } from '../../lib/format';
import { PO_APPROVAL_COLOR } from '../../lib/po';
import { PAYMENT_COLOR } from '../../lib/invoice';
import { useAuth } from '../../context/AuthContext';
import type { POSummary } from '../../lib/types';
import { PO_APPROVAL_LABEL, PAYMENT_LABEL } from '../../lib/types';

export function POsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreate = user?.role === 'ADMIN' || user?.role === 'WAREHOUSE';

  const [q, setQ] = useState('');
  const [approvalStatus, setApprovalStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');

  const { data: pos, loading, reload } = useList<POSummary>(
    () => PurchaseOrdersApi.list({ q, approvalStatus, paymentStatus }),
    [q, approvalStatus, paymentStatus],
  );

  const isAdmin = user?.role === 'ADMIN';
  const [toDelete, setToDelete] = useState<POSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleForceDelete(password: string) {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await PurchaseOrdersApi.forceDelete(toDelete.id, password);
      toast.success(`PO ${toDelete.number} deleted`);
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<POSummary>[] = [
    {
      header: 'PO #',
      cell: (po) => (
        <button onClick={() => navigate(`/purchase-orders/${po.id}`)} className="font-semibold text-navy hover:underline">
          {po.number}
        </button>
      ),
    },
    { header: 'Date', cell: (po) => formatDate(po.invoiceDate) },
    { header: 'Supplier', cell: (po) => po.supplierName },
    { header: 'Total', headerClassName: 'text-right', className: 'text-right font-medium', cell: (po) => peso(po.total) },
    { header: 'Approval', cell: (po) => <Badge color={PO_APPROVAL_COLOR[po.approvalStatus]}>{PO_APPROVAL_LABEL[po.approvalStatus]}</Badge> },
    { header: 'Payment', cell: (po) => <Badge color={PAYMENT_COLOR[po.paymentStatus]}>{PAYMENT_LABEL[po.paymentStatus]}</Badge> },
    { header: 'Stock', cell: (po) => (po.received ? <Badge color="green">Received</Badge> : <Badge color="gray">Pending</Badge>) },
    {
      header: '',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (po) => (
        <div className="flex items-center justify-end gap-1">
          {isAdmin && (
            <button onClick={() => setToDelete(po)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => navigate(`/purchase-orders/${po.id}`)} className="text-slate-400 hover:text-navy" aria-label="Open">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Purchase Orders"
        subtitle="Order from suppliers — Admin approval required"
        actions={
          canCreate ? (
            <Button onClick={() => navigate('/purchase-orders/new')}>
              <Plus className="h-4 w-4" /> New PO
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input placeholder="Search PO # or supplier…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={approvalStatus} onChange={(e) => setApprovalStatus(e.target.value)} className="sm:w-48">
          <option value="">All approvals</option>
          <option value="PENDING">Pending approval</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </Select>
        <Select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className="sm:w-40">
          <option value="">All payments</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PAID">Paid</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={pos}
        keyField={(po) => po.id}
        loading={loading}
        empty={<EmptyState icon={ShoppingCart} title="No purchase orders" message="Create your first PO to a supplier." />}
      />

      {toDelete && (
        <PasswordConfirmDialog
          title="Delete purchase order"
          message={`Permanently delete ${toDelete.number}? This cannot be undone. Any received stock is reversed and linked payments are unlinked.`}
          loading={deleting}
          onConfirm={handleForceDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
