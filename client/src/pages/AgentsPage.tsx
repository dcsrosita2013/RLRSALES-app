import { useState, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, UserCog } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { DataTable, Column } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { useList } from '../hooks/useList';
import { AgentsApi, AgentInput } from '../lib/resources';
import { apiErrorMessage } from '../lib/api';
import type { Agent } from '../lib/types';

export function AgentsPage() {
  const { data: agents, loading, reload } = useList<Agent>(() => AgentsApi.list(), []);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await AgentsApi.remove(toDelete.id);
      toast.success('Agent deleted');
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<Agent>[] = [
    { header: 'Name', cell: (a) => <span className="font-medium text-slate-800">{a.name}</span> },
    { header: 'Contact', cell: (a) => a.contactNumber || '—' },
    { header: 'Address', cell: (a) => a.address || '—' },
    { header: 'Customers', cell: (a) => a.customerCount ?? 0 },
    {
      header: '',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (a) => (
        <div className="flex justify-end gap-1">
          <button onClick={() => setEditing(a)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-navy" aria-label="Edit">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={() => setToDelete(a)} className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Agents"
        subtitle="Sales agents used for per-agent reporting"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New agent
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={agents}
        keyField={(a) => a.id}
        loading={loading}
        empty={<EmptyState icon={UserCog} title="No agents yet" message="Add your first sales agent." />}
      />

      {(creating || editing) && (
        <AgentForm
          agent={editing}
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
        title="Delete agent"
        message={`Delete "${toDelete?.name}"? This cannot be undone.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function AgentForm({ agent, onClose, onSaved }: { agent: Agent | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<AgentInput>({
    name: agent?.name ?? '',
    address: agent?.address ?? '',
    contactNumber: agent?.contactNumber ?? '',
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (agent) await AgentsApi.update(agent.id, form);
      else await AgentsApi.create(form);
      toast.success(agent ? 'Agent updated' : 'Agent created');
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
      title={agent ? 'Edit agent' : 'New agent'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="agent-form" type="submit" loading={saving}>
            {agent ? 'Save changes' : 'Create agent'}
          </Button>
        </>
      }
    >
      <form id="agent-form" onSubmit={submit} className="space-y-4">
        <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus required />
        <Input label="Contact number" value={form.contactNumber ?? ''} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} />
        <Input label="Address" value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </form>
    </Modal>
  );
}
