import { useState, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Users, Search } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { DataTable, Column } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { Badge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { useList } from '../hooks/useList';
import { CustomersApi, CustomerInput, AgentsApi } from '../lib/resources';
import { apiErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { Customer, Agent, VatClass, TermsType } from '../lib/types';
import { VAT_LABELS } from '../lib/types';

const VAT_COLOR: Record<VatClass, 'blue' | 'amber' | 'gray'> = {
  VAT: 'blue',
  VAT_ADD: 'blue',
  ZERO_RATED: 'amber',
  VAT_EXEMPT: 'gray',
};

export function CustomersPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'AGENT';
  const canDelete = user?.role === 'ADMIN';

  const [q, setQ] = useState('');
  const { data: customers, loading, reload } = useList<Customer>(() => CustomersApi.list({ q }), [q]);
  const { data: agents } = useList<Agent>(() => AgentsApi.list(), []);

  const [editing, setEditing] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await CustomersApi.remove(toDelete.id);
      toast.success('Customer deleted');
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<Customer>[] = [
    {
      header: 'Customer',
      cell: (c) => (
        <div>
          <span className="font-medium text-slate-800">{c.name}</span>
          {c.address && <p className="text-xs text-slate-500">{c.address}</p>}
        </div>
      ),
    },
    { header: 'TIN', cell: (c) => c.tin || '—' },
    { header: 'Contact', cell: (c) => c.contactNumber || '—' },
    { header: 'VAT', cell: (c) => <Badge color={VAT_COLOR[c.vatClass]}>{VAT_LABELS[c.vatClass]}</Badge> },
    { header: 'Agent', cell: (c) => c.agent?.name || '—' },
    {
      header: '',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (c) =>
        canManage ? (
          <div className="flex justify-end gap-1">
            <button onClick={() => setEditing(c)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-navy" aria-label="Edit">
              <Pencil className="h-4 w-4" />
            </button>
            {canDelete && (
              <button onClick={() => setToDelete(c)} className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label="Delete">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-400">View only</span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        subtitle="Customer records and VAT classification"
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New customer
            </Button>
          ) : undefined
        }
      />

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input placeholder="Search customers…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      <DataTable
        columns={columns}
        rows={customers}
        keyField={(c) => c.id}
        loading={loading}
        empty={<EmptyState icon={Users} title="No customers" message="Add your first customer." />}
      />

      {(creating || editing) && (
        <CustomerForm
          customer={editing}
          agents={agents}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            reload();
          }}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        title="Delete customer"
        message={`Delete "${toDelete?.name}"? This cannot be undone.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function CustomerForm({
  customer,
  agents,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  agents: Agent[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CustomerInput>({
    name: customer?.name ?? '',
    address: customer?.address ?? '',
    tin: customer?.tin ?? '',
    contactNumber: customer?.contactNumber ?? '',
    vatClass: customer?.vatClass ?? 'VAT',
    termsType: customer?.termsType ?? 'COD',
    netDays: customer?.netDays ?? 30,
    agentId: customer?.agentId ?? '',
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: CustomerInput = {
        ...form,
        agentId: form.agentId || null,
        netDays: form.termsType === 'NET' ? Number(form.netDays) || 30 : null,
      };
      if (customer) await CustomersApi.update(customer.id, payload);
      else await CustomersApi.create(payload);
      toast.success(customer ? 'Customer updated' : 'Customer created');
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
      title={customer ? 'Edit customer' : 'New customer'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="customer-form" type="submit" loading={saving}>
            {customer ? 'Save changes' : 'Create customer'}
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={submit} className="space-y-4">
        <Input label="Customer name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus required />
        <Textarea label="Address" rows={2} value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="TIN" value={form.tin ?? ''} onChange={(e) => setForm({ ...form, tin: e.target.value })} />
          <Input label="Contact number" value={form.contactNumber ?? ''} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="VAT classification"
            value={form.vatClass}
            onChange={(e) => setForm({ ...form, vatClass: e.target.value as VatClass })}
          >
            <option value="VAT">VAT (12%)</option>
            <option value="VAT_ADD">Add VAT (12% on top)</option>
            <option value="ZERO_RATED">Zero-Rated</option>
            <option value="VAT_EXEMPT">VAT-Exempt</option>
          </Select>
          <Select label="Agent" value={form.agentId ?? ''} onChange={(e) => setForm({ ...form, agentId: e.target.value })}>
            <option value="">— None —</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Default terms" value={form.termsType ?? 'COD'} onChange={(e) => setForm({ ...form, termsType: e.target.value as TermsType })}>
            <option value="COD">COD</option>
            <option value="NET">Net X days</option>
          </Select>
          {form.termsType === 'NET' && (
            <Input label="Net days" type="number" min={1} value={form.netDays ?? 30} onChange={(e) => setForm({ ...form, netDays: Number(e.target.value) })} />
          )}
        </div>
        <p className="-mt-1 text-xs text-slate-500">These terms auto-fill on the customer's invoices, delivery receipts, and quotations.</p>
      </form>
    </Modal>
  );
}
