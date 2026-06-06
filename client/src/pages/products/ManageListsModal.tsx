import { useState, KeyboardEvent } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { CategoriesApi, BrandsApi } from '../../lib/resources';
import { apiErrorMessage } from '../../lib/api';
import type { Category, Brand } from '../../lib/types';

interface ListItem {
  id: string;
  name: string;
  productCount?: number;
}

interface ListApi {
  create: (name: string) => Promise<unknown>;
  update: (id: string, name: string) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}

function ListEditor({
  title,
  items,
  api,
  onChanged,
}: {
  title: string;
  items: ListItem[];
  api: ListApi;
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await api.create(newName.trim());
      setNewName('');
      onChanged();
      toast.success(`${title.replace(/s$/, '')} added`);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function save(id: string) {
    if (!editName.trim()) return;
    setBusy(true);
    try {
      await api.update(id, editName.trim());
      setEditingId(null);
      onChanged();
      toast.success('Renamed');
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string) {
    setBusy(true);
    try {
      await api.remove(id);
      onChanged();
      toast.success('Deleted');
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const onAddKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  };

  return (
    <div className="flex-1">
      <h4 className="mb-2 text-sm font-semibold text-navy">{title}</h4>
      <div className="mb-2 flex gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`New ${title.toLowerCase().replace(/s$/, '')}…`} onKeyDown={onAddKey} />
        <Button onClick={add} loading={busy} aria-label="Add">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
        {items.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-slate-400">None yet</p>
        ) : (
          items.map((it) => (
            <div key={it.id} className="flex items-center gap-2 px-3 py-2">
              {editingId === it.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        save(it.id);
                      }
                    }}
                  />
                  <Button onClick={() => save(it.id)} loading={busy}>
                    Save
                  </Button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-slate-500 hover:text-slate-700">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-slate-700">{it.name}</span>
                  <span className="text-xs text-slate-400" title="Products using this">
                    {it.productCount ?? 0}
                  </span>
                  <button onClick={() => { setEditingId(it.id); setEditName(it.name); }} className="rounded p-1 text-slate-400 hover:text-navy" aria-label="Rename">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => del(it.id)} className="rounded p-1 text-slate-400 hover:text-red-600" aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function ManageListsModal({
  categories,
  brands,
  onChanged,
  onClose,
}: {
  categories: Category[];
  brands: Brand[];
  onChanged: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Manage categories & brands"
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-6 sm:flex-row">
        <ListEditor title="Categories" items={categories} api={CategoriesApi} onChanged={onChanged} />
        <ListEditor title="Brands" items={brands} api={BrandsApi} onChanged={onChanged} />
      </div>
    </Modal>
  );
}
