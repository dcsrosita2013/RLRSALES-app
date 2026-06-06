import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, FileText, Search, ChevronRight, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { DataTable, Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { PasswordConfirmDialog } from '../../components/ui/PasswordConfirmDialog';
import { useList } from '../../hooks/useList';
import { InvoicesApi } from '../../lib/resources';
import { apiErrorMessage } from '../../lib/api';
import { peso, formatDate } from '../../lib/format';
import { STATUS_COLOR, PAYMENT_COLOR } from '../../lib/invoice';
import { useAuth } from '../../context/AuthContext';
import type { InvoiceSummary } from '../../lib/types';
import { INVOICE_STATUS_LABEL, PAYMENT_LABEL } from '../../lib/types';

export function InvoicesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreate = user?.role === 'ADMIN' || user?.role === 'AGENT';

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: invoices, loading, reload } = useList<InvoiceSummary>(
    () => InvoicesApi.list({ q, status, paymentStatus, dateFrom, dateTo }),
    [q, status, paymentStatus, dateFrom, dateTo],
  );

  const isAdmin = user?.role === 'ADMIN';
  const [toDelete, setToDelete] = useState<InvoiceSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleForceDelete(password: string) {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await InvoicesApi.forceDelete(toDelete.id, password);
      toast.success(`Invoice ${toDelete.number ?? 'draft'} deleted`);
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<InvoiceSummary>[] = [
    {
      header: 'Invoice #',
      cell: (inv) => (
        <button onClick={() => navigate(`/invoices/${inv.id}`)} className="font-semibold text-navy hover:underline">
          {inv.number ?? 'Draft'}
        </button>
      ),
    },
    { header: 'Date', cell: (inv) => formatDate(inv.date) },
    { header: 'Customer', cell: (inv) => inv.customerName },
    { header: 'Agent', cell: (inv) => inv.agentName ?? '—' },
    { header: 'Total', headerClassName: 'text-right', className: 'text-right font-medium', cell: (inv) => peso(inv.total) },
    { header: 'Status', cell: (inv) => <Badge color={STATUS_COLOR[inv.status]}>{INVOICE_STATUS_LABEL[inv.status]}</Badge> },
    { header: 'Payment', cell: (inv) => <Badge color={PAYMENT_COLOR[inv.paymentStatus]}>{PAYMENT_LABEL[inv.paymentStatus]}</Badge> },
    {
      header: '',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (inv) => (
        <div className="flex items-center justify-end gap-1">
          {isAdmin && (
            <button onClick={() => setToDelete(inv)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => navigate(`/invoices/${inv.id}`)} className="text-slate-400 hover:text-navy" aria-label="Open">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sales Invoices"
        subtitle="Create, finalize, and track invoices"
        actions={
          canCreate ? (
            <Button onClick={() => navigate('/invoices/new')}>
              <Plus className="h-4 w-4" /> New invoice
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="relative lg:max-w-xs lg:flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input placeholder="Search invoice #, customer, PO…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="lg:w-40">
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="FINALIZED">Finalized</option>
          <option value="VOID">Void</option>
        </Select>
        <Select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className="lg:w-40">
          <option value="">All payments</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PAID">Paid</option>
        </Select>
        <div className="flex items-end gap-2">
          <Input label="From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input label="To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={invoices}
        keyField={(inv) => inv.id}
        loading={loading}
        empty={<EmptyState icon={FileText} title="No invoices" message="Create your first sales invoice." />}
      />

      {toDelete && (
        <PasswordConfirmDialog
          title="Delete invoice"
          message={`Permanently delete invoice ${toDelete.number ?? 'draft'}? This cannot be undone. Any deducted stock is returned and linked records are unlinked.`}
          loading={deleting}
          onConfirm={handleForceDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
