import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Package, Search, Boxes, Tags, Upload } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { DataTable, Column } from '../../components/ui/DataTable';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { useList } from '../../hooks/useList';
import { ProductsApi, CategoriesApi, BrandsApi } from '../../lib/resources';
import { apiErrorMessage } from '../../lib/api';
import { peso, num, formatDate } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import type { Product, Category, Brand } from '../../lib/types';
import { FLOOR_LABELS } from '../../lib/types';
import { ProductFormModal } from './ProductFormModal';
import { StockManagerModal } from './StockManagerModal';
import { ManageListsModal } from './ManageListsModal';
import { ImportProductsModal } from './ImportProductsModal';

export function ProductsPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'WAREHOUSE';
  const canDelete = user?.role === 'ADMIN';
  const isAdmin = user?.role === 'ADMIN';
  const canSeeCost = user?.role === 'ADMIN' || user?.role === 'WAREHOUSE';

  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');

  const { data: products, loading, reload } = useList<Product>(
    () => ProductsApi.list({ q, categoryId, brandId }),
    [q, categoryId, brandId],
  );
  const { data: categories, reload: reloadCategories } = useList<Category>(() => CategoriesApi.list(), []);
  const { data: brands, reload: reloadBrands } = useList<Brand>(() => BrandsApi.list(), []);

  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [stockFor, setStockFor] = useState<Product | null>(null);
  const [managingLists, setManagingLists] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toDelete, setToDelete] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  function reloadLists() {
    reloadCategories();
    reloadBrands();
  }

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await ProductsApi.remove(toDelete.id);
      toast.success('Product deleted');
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<Product>[] = [
    {
      header: 'Item',
      cell: (p) => (
        <div>
          <span className="font-medium text-slate-800">{p.name}</span>
          <p className="text-xs text-slate-500">
            {p.brand?.name ?? 'No brand'}
            {p.origin ? ` · ${p.origin}` : ''}
          </p>
        </div>
      ),
    },
    { header: 'Category', cell: (p) => p.category?.name ?? '—' },
    { header: 'Unit', cell: (p) => p.unit },
    ...(canSeeCost
      ? [{ header: 'Cost', className: 'text-right', headerClassName: 'text-right', cell: (p: Product) => peso(p.costPrice) }]
      : []),
    {
      header: 'Selling price',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (p) => (
        <div>
          <span className="font-semibold text-navy">{peso(p.basePrice)}</span>
          <p className="text-[11px] text-slate-400">
            {p.priceOptions.map((o) => `${o.markup}%: ${peso(o.price)}`).join('  ·  ')}
          </p>
        </div>
      ),
    },
    {
      header: 'On hand',
      cell: (p) => (
        <div>
          <span className="font-medium text-slate-800">
            {num(p.totalQuantity)} {p.unit}
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            {p.stocks.slice(0, 3).map((s) => (
              <Badge key={s.id} color="gray">
                {FLOOR_LABELS[s.floor].replace(' Floor', 'F')} · {s.roomNumber}: {num(s.quantity)}
              </Badge>
            ))}
            {p.stocks.length > 3 && <Badge color="gray">+{p.stocks.length - 3}</Badge>}
          </div>
        </div>
      ),
    },
    { header: 'Last received', cell: (p) => formatDate(p.lastReceivedAt) },
    {
      header: '',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (p) =>
        canManage ? (
          <div className="flex justify-end gap-1">
            <button onClick={() => setStockFor(p)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-navy" title="Manage stock" aria-label="Stock">
              <Boxes className="h-4 w-4" />
            </button>
            <button onClick={() => setEditing(p)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-navy" title="Edit" aria-label="Edit">
              <Pencil className="h-4 w-4" />
            </button>
            {canDelete && (
              <button onClick={() => setToDelete(p)} className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete" aria-label="Delete">
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
        title="Products / Inventory"
        subtitle="Item master, pricing, and stock by floor & room"
        actions={
          canManage ? (
            <>
              {isAdmin && (
                <Button variant="secondary" onClick={() => setImporting(true)}>
                  <Upload className="h-4 w-4" /> Import
                </Button>
              )}
              <Button variant="secondary" onClick={() => setManagingLists(true)}>
                <Tags className="h-4 w-4" /> Categories & brands
              </Button>
              <Button onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> New product
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="sm:w-48">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="sm:w-44">
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={products}
        keyField={(p) => p.id}
        loading={loading}
        empty={<EmptyState icon={Package} title="No products" message="Add your first inventory item." />}
      />

      {(creating || editing) && (
        <ProductFormModal
          product={editing}
          categories={categories}
          brands={brands}
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

      {stockFor && (
        <StockManagerModal product={stockFor} onClose={() => setStockFor(null)} onChanged={reload} />
      )}

      {managingLists && (
        <ManageListsModal
          categories={categories}
          brands={brands}
          onChanged={reloadLists}
          onClose={() => setManagingLists(false)}
        />
      )}

      {importing && (
        <ImportProductsModal
          onClose={() => setImporting(false)}
          onImported={() => {
            reload();
            reloadLists();
          }}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete product"
        message={`Delete "${toDelete?.name}"? If it's used in documents you'll be asked to mark it inactive instead.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
