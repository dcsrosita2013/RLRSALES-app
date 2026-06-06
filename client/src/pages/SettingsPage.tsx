import { useState, FormEvent } from 'react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Hash, DatabaseBackup, History, Users as UsersIcon, Plus, KeyRound, Save, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DataTable, Column } from '../components/ui/DataTable';
import { useList } from '../hooks/useList';
import { AdminApi, AgentsApi, CreateUserInput } from '../lib/resources';
import { apiErrorMessage } from '../lib/api';
import { formatDate } from '../lib/format';
import { ROLE_LABELS } from '../lib/types';
import type { DocSequence, BackupRow, AuditEntry, AdminUser, Agent, Role } from '../lib/types';

const TABS = [
  { key: 'numbering', label: 'Document numbering', icon: Hash },
  { key: 'backup', label: 'Backup & restore', icon: DatabaseBackup },
  { key: 'audit', label: 'Audit trail', icon: History },
  { key: 'users', label: 'Users', icon: UsersIcon },
] as const;

export function SettingsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('numbering');
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="System administration" />
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition',
                tab === t.key ? 'border-navy text-navy' : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === 'numbering' && <NumberingTab />}
      {tab === 'backup' && <BackupTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'users' && <UsersTab />}
    </div>
  );
}

const DOC_LABEL: Record<string, string> = {
  INVOICE: 'Sales Invoice',
  DELIVERY_RECEIPT: 'Delivery Receipt',
  PURCHASE_ORDER: 'Purchase Order',
  CHECK_VOUCHER: 'Check Voucher',
  QUOTATION: 'Quotation',
  COLLECTION: 'Collection',
};

function NumberingTab() {
  const { data: seqs, reload } = useList<DocSequence>(() => AdminApi.sequences(), []);
  return (
    <Card className="p-5">
      <p className="mb-4 text-sm text-slate-500">
        Set the prefix, the next number, and zero-padding for each document type. Use this to continue an existing series
        (e.g. set Sales Invoice next number to 5235).
      </p>
      <div className="space-y-3">
        {seqs.map((s) => (
          <SequenceRow key={s.docType} seq={s} onSaved={reload} />
        ))}
      </div>
    </Card>
  );
}

function SequenceRow({ seq, onSaved }: { seq: DocSequence; onSaved: () => void }) {
  const [prefix, setPrefix] = useState(seq.prefix);
  const [nextNumber, setNextNumber] = useState(String(seq.nextNumber));
  const [padding, setPadding] = useState(String(seq.padding));
  const [saving, setSaving] = useState(false);

  const preview = `${prefix}${String(Number(nextNumber) || 0).padStart(Number(padding) || 1, '0')}`;

  async function save() {
    setSaving(true);
    try {
      await AdminApi.updateSequence(seq.docType, { prefix, nextNumber: Number(nextNumber), padding: Number(padding) });
      toast.success(`${DOC_LABEL[seq.docType] ?? seq.docType} updated`);
      onSaved();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-12 items-end gap-2 rounded-lg border border-slate-200 p-3">
      <div className="col-span-12 sm:col-span-3">
        <p className="text-sm font-medium text-slate-700">{DOC_LABEL[seq.docType] ?? seq.docType}</p>
        <p className="text-xs text-slate-400">Next: {preview}</p>
      </div>
      <div className="col-span-4 sm:col-span-2">
        <Input label="Prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
      </div>
      <div className="col-span-4 sm:col-span-3">
        <Input label="Next number" type="number" min={1} value={nextNumber} onChange={(e) => setNextNumber(e.target.value)} />
      </div>
      <div className="col-span-4 sm:col-span-2">
        <Input label="Padding" type="number" min={1} max={10} value={padding} onChange={(e) => setPadding(e.target.value)} />
      </div>
      <div className="col-span-12 sm:col-span-2">
        <Button onClick={save} loading={saving} className="w-full">
          <Save className="h-4 w-4" /> Save
        </Button>
      </div>
    </div>
  );
}

function BackupTab() {
  const { data: backups, loading, reload } = useList<BackupRow>(() => AdminApi.backups(), []);
  const [busy, setBusy] = useState(false);

  async function backupNow() {
    setBusy(true);
    try {
      const r = await AdminApi.backupNow();
      toast.success(`Backup created: ${r.filename}`);
      reload();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-col items-start justify-between gap-3 p-5 sm:flex-row sm:items-center">
        <div>
          <h3 className="font-semibold text-navy">Database backup</h3>
          <p className="text-sm text-slate-500">Creates a timestamped SQL dump in the server's backups folder.</p>
        </div>
        <Button onClick={backupNow} loading={busy}>
          <DatabaseBackup className="h-4 w-4" /> Backup now
        </Button>
      </Card>

      <DataTable
        columns={[
          { header: 'File', cell: (b: BackupRow) => <span className="font-mono text-xs">{b.filename}</span> },
          { header: 'Size', cell: (b: BackupRow) => (b.sizeBytes ? `${Math.round(b.sizeBytes / 1024).toLocaleString()} KB` : '—') },
          { header: 'Created', cell: (b: BackupRow) => formatDate(b.createdAt) },
          { header: 'By', cell: (b: BackupRow) => b.createdBy ?? 'Scheduled' },
        ]}
        rows={backups}
        keyField={(b) => b.id}
        loading={loading}
      />

      <Card className="p-5 text-sm text-slate-600">
        <h4 className="mb-2 font-semibold text-navy">How to restore</h4>
        <p className="mb-2">Backups are stored in <span className="font-mono">/backups</span>. To restore one:</p>
        <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{`# Using the Docker database container (recommended):
Get-Content backups\\<file>.sql | docker exec -i rlr_postgres psql -U rlr -d rlr_db

# Or with a local psql:
psql "postgresql://rlr:rlr_password@localhost:5433/rlr_db" -f backups\\<file>.sql`}</pre>
        <p className="mt-2 text-xs text-slate-500">
          Tip: set <span className="font-mono">BACKUP_INTERVAL_HOURS=24</span> in <span className="font-mono">server/.env</span> for daily
          automatic backups, or schedule <span className="font-mono">npm run backup</span> with Windows Task Scheduler.
        </p>
      </Card>
    </div>
  );
}

function AuditTab() {
  const [entityType, setEntityType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { data: rows, loading } = useList<AuditEntry>(() => AdminApi.audit({ entityType, dateFrom, dateTo }), [entityType, dateFrom, dateTo]);

  const columns: Column<AuditEntry>[] = [
    { header: 'When', cell: (a) => <span className="whitespace-nowrap">{new Date(a.createdAt).toLocaleString('en-PH')}</span> },
    { header: 'User', cell: (a) => a.username ?? '—' },
    { header: 'Action', cell: (a) => <Badge color="navy">{a.action}</Badge> },
    { header: 'Entity', cell: (a) => a.entityType },
    { header: 'Details', cell: (a) => <span className="text-xs text-slate-500">{a.details ? JSON.stringify(a.details) : a.entityId ?? ''}</span> },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Select label="Entity" value={entityType} onChange={(e) => setEntityType(e.target.value)} className="min-w-[12rem]">
            <option value="">All</option>
            <option value="SalesInvoice">Sales Invoice</option>
            <option value="PurchaseOrder">Purchase Order</option>
            <option value="DeliveryReceipt">Delivery Receipt</option>
            <option value="Quotation">Quotation</option>
            <option value="Collection">Collection</option>
            <option value="CheckVoucher">Check Voucher</option>
            <option value="Product">Product</option>
            <option value="User">User</option>
          </Select>
          <Input label="From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input label="To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </Card>
      <DataTable columns={columns} rows={rows} keyField={(a) => a.id} loading={loading} />
    </div>
  );
}

function UsersTab() {
  const { data: users, loading, reload } = useList<AdminUser>(() => AdminApi.users(), []);
  const { data: agents } = useList<Agent>(() => AgentsApi.list().catch(() => []), []);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [pwFor, setPwFor] = useState<AdminUser | null>(null);
  const [toDelete, setToDelete] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [credential, setCredential] = useState<{ username: string; password: string } | null>(null);

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await AdminApi.deleteUser(toDelete.id);
      toast.success(`Deleted @${toDelete.username}`);
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  }
  async function toggleActive(u: AdminUser) {
    try {
      await AdminApi.updateUser(u.id, { fullName: u.fullName, role: u.role, isActive: !u.isActive, agentId: u.agentId });
      toast.success(u.isActive ? 'User deactivated' : 'User activated');
      reload();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  const columns: Column<AdminUser>[] = [
    {
      header: 'User',
      cell: (u) => (
        <div>
          <span className="font-medium text-slate-800">{u.fullName}</span>
          <p className="text-xs text-slate-500">@{u.username}</p>
        </div>
      ),
    },
    { header: 'Role', cell: (u) => <Badge color="navy">{ROLE_LABELS[u.role]}</Badge> },
    { header: 'Status', cell: (u) => (u.isActive ? <Badge color="green">Active</Badge> : <Badge color="red">Inactive</Badge>) },
    { header: 'Last login', cell: (u) => (u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never') },
    {
      header: '',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (u) => (
        <div className="flex justify-end gap-2">
          <button onClick={() => setPwFor(u)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-navy" title="Set / reset password">
            <KeyRound className="h-4 w-4" />
          </button>
          <button onClick={() => setEditing(u)} className="text-xs font-medium text-navy hover:underline">
            Edit
          </button>
          <button onClick={() => toggleActive(u)} className="text-xs font-medium text-slate-500 hover:underline">
            {u.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button onClick={() => setToDelete(u)} className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete user">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Add user
        </Button>
      </div>
      <DataTable columns={columns} rows={users} keyField={(u) => u.id} loading={loading} />

      {creating && <UserForm agents={agents} onClose={() => setCreating(false)} onSaved={(cred) => { setCreating(false); reload(); if (cred) setCredential(cred); }} />}
      {editing && <EditUserForm user={editing} agents={agents} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {pwFor && <SetPasswordModal user={pwFor} onClose={() => setPwFor(null)} onTemp={(cred) => setCredential(cred)} />}
      <ConfirmDialog
        open={!!toDelete}
        title="Delete user"
        message={`Permanently delete @${toDelete?.username} (${toDelete?.fullName})? Their documents stay but lose the "created by" link. Consider Deactivate instead if unsure.`}
        confirmLabel="Delete user"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
      {credential && credential.password && (
        <Modal open onClose={() => setCredential(null)} title="Temporary password" size="sm" footer={<Button onClick={() => setCredential(null)}>Done</Button>}>
          <p className="text-sm text-slate-600">Give these credentials to the user. They'll be required to change the password on first login.</p>
          <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
            <p>Username: <span className="font-mono font-semibold">{credential.username}</span></p>
            <p>Password: <span className="font-mono font-semibold text-navy">{credential.password}</span></p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SetPasswordModal({ user, onClose, onTemp }: { user: AdminUser; onClose: () => void; onTemp: (cred: { username: string; password: string }) => void }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  async function setSpecific() {
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setSaving(true);
    try {
      await AdminApi.resetPassword(user.id, password);
      toast.success(`Password set for @${user.username}`);
      onClose();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  async function generateTemp() {
    setSaving(true);
    try {
      const r = await AdminApi.resetPassword(user.id);
      onClose();
      if (r.tempPassword) onTemp({ username: user.username, password: r.tempPassword });
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Set password — @${user.username}`}
      size="sm"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={generateTemp} loading={saving}>
            Generate temporary
          </Button>
          <Button onClick={setSpecific} loading={saving} disabled={password.length < 8}>
            Set password
          </Button>
        </div>
      }
    >
      <p className="text-sm text-slate-600">
        Type a new password for <span className="font-medium">{user.fullName}</span> — they can log in with it right away. Or generate a
        temporary one they must change on first login.
      </p>
      <div className="mt-3">
        <Input label="New password" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
      </div>
    </Modal>
  );
}

function UserForm({ agents, onClose, onSaved }: { agents: Agent[]; onClose: () => void; onSaved: (cred?: { username: string; password: string }) => void }) {
  const [form, setForm] = useState<CreateUserInput>({ username: '', fullName: '', role: 'AGENT', agentId: '' });
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await AdminApi.createUser({ ...form, agentId: form.agentId || null });
      toast.success('User created');
      onSaved({ username: r.username, password: r.tempPassword });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Add user" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="user-form" type="submit" loading={saving}>Create</Button></>}>
      <form id="user-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <Input label="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            <option value="ADMIN">Admin / Owner</option>
            <option value="AGENT">Sales Agent</option>
            <option value="WAREHOUSE">Warehouse</option>
            <option value="FINANCE">Finance / Collections</option>
          </Select>
          {form.role === 'AGENT' && (
            <Select label="Linked agent (optional)" value={form.agentId ?? ''} onChange={(e) => setForm({ ...form, agentId: e.target.value })}>
              <option value="">— None —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
        </div>
        <p className="text-xs text-slate-500">A temporary password will be generated and shown after creation.</p>
      </form>
    </Modal>
  );
}

function EditUserForm({ user, agents, onClose, onSaved }: { user: AdminUser; agents: Agent[]; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(user.fullName);
  const [role, setRole] = useState<Role>(user.role);
  const [agentId, setAgentId] = useState(user.agentId ?? '');
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await AdminApi.updateUser(user.id, { fullName, role, isActive: user.isActive, agentId: agentId || null });
      toast.success('User updated');
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Edit @${user.username}`} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form="edit-user-form" type="submit" loading={saving}>Save</Button></>}>
      <form id="edit-user-form" onSubmit={submit} className="space-y-4">
        <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="ADMIN">Admin / Owner</option>
          <option value="AGENT">Sales Agent</option>
          <option value="WAREHOUSE">Warehouse</option>
          <option value="FINANCE">Finance / Collections</option>
        </Select>
        {role === 'AGENT' && (
          <Select label="Linked agent (optional)" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">— None —</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        )}
      </form>
    </Modal>
  );
}
