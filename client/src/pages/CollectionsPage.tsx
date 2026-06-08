import { useState, useMemo, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Plus, Wallet, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { Badge } from '../components/ui/Badge';
import { DataTable, Column } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { useList } from '../hooks/useList';
import { CollectionsApi, CollectionInput, CustomersApi, InvoicesApi } from '../lib/resources';
import { apiErrorMessage } from '../lib/api';
import { peso, formatDate } from '../lib/format';
import type { CollectionSummary, Customer, InvoiceSummary, PaymentMethod } from '../lib/types';
import { PAYMENT_METHOD_LABEL } from '../lib/types';

export function CollectionsPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { data: rows, loading, reload } = useList<CollectionSummary>(() => CollectionsApi.list({ dateFrom, dateTo }), [dateFrom, dateTo]);
  const { data: customers } = useList<Customer>(() => CustomersApi.list(), []);
  const { data: invoices } = useList<InvoiceSummary>(() => InvoicesApi.list(), []);

  const [recording, setRecording] = useState(false);
  const [toDelete, setToDelete] = useState<CollectionSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const total = rows.reduce((s, r) => s + r.amount, 0);

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await CollectionsApi.remove(toDelete.id);
      toast.success('Collection deleted');
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<CollectionSummary>[] = [
    { header: 'Receipt #', cell: (r) => <span className="font-semibold text-navy">{r.number}</span> },
    { header: 'Date', cell: (r) => formatDate(r.date) },
    { header: 'Customer', cell: (r) => r.customerName },
    { header: 'Invoice', cell: (r) => (r.invoiceNumber ? <Badge color="blue">{r.invoiceNumber}</Badge> : '—') },
    { header: 'Method', cell: (r) => PAYMENT_METHOD_LABEL[r.method] },
    { header: 'Amount', headerClassName: 'text-right', className: 'text-right font-medium', cell: (r) => peso(r.amount) },
    {
      header: '',
      className: 'text-right',
      cell: (r) => (
        <button onClick={() => setToDelete(r)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete">
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Collections"
        subtitle="Customer payments received"
        actions={
          <Button onClick={() => setRecording(true)}>
            <Plus className="h-4 w-4" /> Record collection
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <Input label="From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input label="To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <div className="ml-auto rounded-md bg-navy/5 px-4 py-2 text-sm">
          <span className="text-slate-500">Total collected: </span>
          <span className="font-bold text-navy">{peso(total)}</span>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        keyField={(r) => r.id}
        loading={loading}
        empty={<EmptyState icon={Wallet} title="No collections" message="Record a customer payment to get started." />}
      />

      {recording && (
        <RecordCollection
          customers={customers}
          invoices={invoices}
          onClose={() => setRecording(false)}
          onSaved={() => {
            setRecording(false);
            reload();
          }}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        title="Delete collection"
        message="Delete this collection? If it was applied to an invoice, the invoice balance will be recalculated."
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function RecordCollection({
  customers,
  invoices,
  onClose,
  onSaved,
}: {
  customers: Customer[];
  invoices: InvoiceSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CollectionInput>({
    customerId: '',
    invoiceId: '',
    amount: 0,
    method: 'CASH',
    date: new Date().toISOString().slice(0, 10),
  });
  const [amountStr, setAmountStr] = useState('');
  const [saving, setSaving] = useState(false);

  const customerInvoices = useMemo(
    () => invoices.filter((i) => i.customerId === form.customerId && i.status === 'FINALIZED'),
    [invoices, form.customerId],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.customerId) {
      toast.error('Select a customer');
      return;
    }
    const amount = Number(amountStr);
    if (!amount || amount <= 0) {
      toast.error('Enter an amount');
      return;
    }
    setSaving(true);
    try {
      await CollectionsApi.create({ ...form, amount, invoiceId: form.invoiceId || null });
      toast.success('Collection recorded');
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record collection"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="collection-form" type="submit" loading={saving}>
            Record
          </Button>
        </>
      }
    >
      <form id="collection-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Customer" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value, invoiceId: '' })} required>
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select label="Apply to invoice (optional)" value={form.invoiceId ?? ''} onChange={(e) => setForm({ ...form, invoiceId: e.target.value })} disabled={!form.customerId}>
            <option value="">— None —</option>
            {customerInvoices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.number} — bal {peso(i.total - i.amountPaid)}
              </option>
            ))}
          </Select>
        </div>
        <Input
          label="OR / Receipt #"
          value={form.number ?? ''}
          onChange={(e) => setForm({ ...form, number: e.target.value })}
          placeholder="Your official receipt number — leave blank to auto-generate (COL-…)"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Amount (₱)" type="number" step="0.01" min={0} value={amountStr} onChange={(e) => setAmountStr(e.target.value)} required />
          <Input label="Date" type="date" value={form.date ?? ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Select label="Method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}>
            <option value="CASH">Cash</option>
            <option value="CHECK">Check</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
          </Select>
        </div>
        {form.method === 'CHECK' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input label="Check #" value={form.checkNumber ?? ''} onChange={(e) => setForm({ ...form, checkNumber: e.target.value })} />
            <Input label="Bank" value={form.checkBank ?? ''} onChange={(e) => setForm({ ...form, checkBank: e.target.value })} />
            <Input label="Check date" type="date" value={form.checkDate ?? ''} onChange={(e) => setForm({ ...form, checkDate: e.target.value })} />
          </div>
        )}
        {form.method === 'BANK_TRANSFER' && (
          <Input label="Bank reference" value={form.bankRef ?? ''} onChange={(e) => setForm({ ...form, bankRef: e.target.value })} />
        )}
        <Textarea label="Notes" rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </form>
    </Modal>
  );
}
