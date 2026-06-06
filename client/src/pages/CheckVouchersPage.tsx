import { useState, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Plus, ReceiptText, Printer, Trash2 } from 'lucide-react';
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
import { CheckVouchersApi, CVInput, PurchaseOrdersApi } from '../lib/resources';
import { apiErrorMessage } from '../lib/api';
import { openPdfInNewTab } from '../lib/invoice';
import { peso, formatDate } from '../lib/format';
import type { CVSummary, POSummary } from '../lib/types';

export function CheckVouchersPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { data: rows, loading, reload } = useList<CVSummary>(() => CheckVouchersApi.list({ dateFrom, dateTo }), [dateFrom, dateTo]);
  const { data: pos } = useList<POSummary>(() => PurchaseOrdersApi.list({ approvalStatus: 'APPROVED' }), []);
  const payablePos = pos.filter((p) => p.paymentStatus !== 'PAID');

  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<CVSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function printPdf(id: string) {
    try {
      openPdfInNewTab(await CheckVouchersApi.pdf(id));
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }
  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await CheckVouchersApi.remove(toDelete.id);
      toast.success('Voucher deleted');
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<CVSummary>[] = [
    { header: 'CV #', cell: (r) => <span className="font-semibold text-navy">{r.number}</span> },
    { header: 'Date', cell: (r) => formatDate(r.date) },
    { header: 'Payee', cell: (r) => r.payee },
    { header: 'Check #', cell: (r) => r.checkNumber || '—' },
    { header: 'Amount', headerClassName: 'text-right', className: 'text-right font-medium', cell: (r) => peso(r.amount) },
    {
      header: '',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <button onClick={() => printPdf(r.id)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-navy" aria-label="Print">
            <Printer className="h-4 w-4" />
          </button>
          <button onClick={() => setToDelete(r)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Check Vouchers"
        subtitle="Payments out — suppliers and expenses"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New voucher
          </Button>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <Input label="From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input label="To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        keyField={(r) => r.id}
        loading={loading}
        empty={<EmptyState icon={ReceiptText} title="No check vouchers" message="Create a voucher to pay a supplier or expense." />}
      />

      {creating && (
        <CreateVoucher
          payablePos={payablePos}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        title="Delete check voucher"
        message="Delete this voucher? If it paid a purchase order, that PO's payment status will be reversed."
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function CreateVoucher({ payablePos, onClose, onSaved }: { payablePos: POSummary[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CVInput>({
    payee: '',
    amount: 0,
    date: new Date().toISOString().slice(0, 10),
    poId: '',
  });
  const [amountStr, setAmountStr] = useState('');
  const [saving, setSaving] = useState(false);

  function onPickPO(poId: string) {
    const po = payablePos.find((p) => p.id === poId);
    if (po) {
      setForm({ ...form, poId, payee: po.supplierName });
      setAmountStr(String(po.total));
    } else {
      setForm({ ...form, poId: '' });
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.payee.trim()) {
      toast.error('Enter a payee');
      return;
    }
    const amount = Number(amountStr);
    if (!amount || amount <= 0) {
      toast.error('Enter an amount');
      return;
    }
    setSaving(true);
    try {
      await CheckVouchersApi.create({ ...form, amount, poId: form.poId || null });
      toast.success('Check voucher created');
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
      title="New check voucher"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="cv-form" type="submit" loading={saving}>
            Create voucher
          </Button>
        </>
      }
    >
      <form id="cv-form" onSubmit={submit} className="space-y-4">
        <Select label="Pay a purchase order (optional)" value={form.poId ?? ''} onChange={(e) => onPickPO(e.target.value)}>
          <option value="">— Not for a PO —</option>
          {payablePos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.number} — {p.supplierName} ({p.paymentStatus})
            </option>
          ))}
        </Select>
        {form.poId && (
          <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
            <Badge color="blue">Pays PO</Badge> This voucher will mark the selected PO as paid.
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Payee" value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} required />
          <Input label="Amount (₱)" type="number" step="0.01" min={0} value={amountStr} onChange={(e) => setAmountStr(e.target.value)} required />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Date" type="date" value={form.date ?? ''} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Input label="Bank" value={form.bank ?? ''} onChange={(e) => setForm({ ...form, bank: e.target.value })} />
          <Input label="Check #" value={form.checkNumber ?? ''} onChange={(e) => setForm({ ...form, checkNumber: e.target.value })} />
        </div>
        <Textarea label="Purpose / notes" rows={2} value={form.purpose ?? ''} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
      </form>
    </Modal>
  );
}
