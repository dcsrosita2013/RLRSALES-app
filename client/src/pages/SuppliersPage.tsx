import { useState, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Building2, Search } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { DataTable, Column } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { useList } from '../hooks/useList';
import { SuppliersApi, SupplierInput } from '../lib/resources';
import { apiErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { Supplier } from '../lib/types';

function termsLabel(s: Supplier) {
  return s.termsType === 'NET' ? `Net ${s.netDays} days` : 'COD';
}

export function SuppliersPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'WAREHOUSE';
  const canDelete = user?.role === 'ADMIN';

  const [q, setQ] = useState('');
  const { data: suppliers, loading, reload } = useList<Supplier>(() => SuppliersApi.list({ q }), [q]);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await SuppliersApi.remove(toDelete.id);
      toast.success('Supplier deleted');
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<Supplier>[] = [
    { header: 'Supplier', cell: (s) => <span className="font-medium text-slate-800">{s.name}</span> },
    { header: 'TIN', cell: (s) => s.tin || '—' },
    { header: 'Contact', cell: (s) => s.contactNumber || '—' },
    { header: 'Terms', cell: (s) => <Badge color="navy">{termsLabel(s)}</Badge> },
    {
      header: '',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (s) =>
        canManage ? (
          <div className="flex justify-end gap-1">
            <button onClick={() => setEditing(s)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-navy" aria-label="Edit">
              <Pencil className="h-4 w-4" />
            </button>
            {canDelete && (
              <button onClick={() => setToDelete(s)} className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label="Delete">
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
        title="Suppliers"
        subtitle="Suppliers and their payment terms"
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New supplier
            </Button>
          ) : undefined
        }
      />

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input placeholder="Search suppliers…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      <DataTable
        columns={columns}
        rows={suppliers}
        keyField={(s) => s.id}
        loading={loading}
        empty={<EmptyState icon={Building2} title="No suppliers" message="Add suppliers you purchase from." />}
      />

      {(creating || editing) && (
        <SupplierForm
          supplier={editing}
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
        title="Delete supplier"
        message={`Delete "${toDelete?.name}"? This cannot be undone.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function SupplierForm({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<SupplierInput>({
    name: supplier?.name ?? '',
    address: supplier?.address ?? '',
    tin: supplier?.tin ?? '',
    contactNumber: supplier?.contactNumber ?? '',
    termsType: supplier?.termsType ?? 'COD',
    netDays: supplier?.netDays ?? 30,
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: SupplierInput = {
        ...form,
        netDays: form.termsType === 'NET' ? Number(form.netDays) : null,
      };
      if (supplier) await SuppliersApi.update(supplier.id, payload);
      else await SuppliersApi.create(payload);
      toast.success(supplier ? 'Supplier updated' : 'Supplier created');
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
      title={supplier ? 'Edit supplier' : 'New supplier'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="supplier-form" type="submit" loading={saving}>
            {supplier ? 'Save changes' : 'Create supplier'}
          </Button>
        </>
      }
    >
      <form id="supplier-form" onSubmit={submit} className="space-y-4">
        <Input label="Supplier name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus required />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="TIN" value={form.tin ?? ''} onChange={(e) => setForm({ ...form, tin: e.target.value })} />
          <Input label="Contact number" value={form.contactNumber ?? ''} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} />
        </div>
        <Input label="Address" value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Payment terms"
            value={form.termsType}
            onChange={(e) => setForm({ ...form, termsType: e.target.value as Supplier['termsType'] })}
          >
            <option value="COD">COD (Cash on Delivery)</option>
            <option value="NET">Net X days</option>
          </Select>
          {form.termsType === 'NET' && (
            <Input
              label="Number of days"
              type="number"
              min={1}
              value={form.netDays ?? ''}
              onChange={(e) => setForm({ ...form, netDays: Number(e.target.value) })}
              required
            />
          )}
        </div>
      </form>
    </Modal>
  );
}
