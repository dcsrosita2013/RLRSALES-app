import { useState, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import { ProductsApi, ProductInput } from '../../lib/resources';
import { apiErrorMessage } from '../../lib/api';
import { priceOptions } from '../../lib/pricing';
import { peso } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import type { Product, Category, Brand, Floor } from '../../lib/types';
import { COMMON_UNITS } from '../../lib/types';

interface StockRow {
  floor: Floor;
  roomNumber: string;
  quantity: string;
}

export function ProductFormModal({
  product,
  categories,
  brands,
  onClose,
  onSaved,
}: {
  product: Product | null;
  categories: Category[];
  brands: Brand[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const canEditPricing = user?.role === 'ADMIN' || user?.role === 'WAREHOUSE';

  const [form, setForm] = useState({
    name: product?.name ?? '',
    description: product?.description ?? '',
    categoryId: product?.categoryId ?? '',
    brandId: product?.brandId ?? '',
    unit: product?.unit ?? 'pc',
    origin: product?.origin ?? 'Philippines',
    costPrice: product ? String(product.costPrice) : '',
    basePrice: product ? String(product.basePrice) : '',
  });
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [saving, setSaving] = useState(false);

  const cost = Number(form.costPrice) || 0;
  const options = priceOptions(cost);

  function addRow() {
    setStockRows((rows) => [...rows, { floor: 'FIRST', roomNumber: '', quantity: '' }]);
  }
  function updateRow(i: number, patch: Partial<StockRow>) {
    setStockRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setStockRows((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: ProductInput = {
        name: form.name,
        description: form.description || null,
        categoryId: form.categoryId || null,
        brandId: form.brandId || null,
        unit: form.unit,
        origin: form.origin,
        costPrice: form.costPrice === '' ? 0 : Number(form.costPrice),
        basePrice: form.basePrice === '' ? 0 : Number(form.basePrice),
      };
      if (!product) {
        const stocks = stockRows
          .filter((r) => r.roomNumber.trim() !== '')
          .map((r) => ({ floor: r.floor, roomNumber: r.roomNumber.trim(), quantity: r.quantity === '' ? 0 : Number(r.quantity) }));
        if (stocks.length) payload.stocks = stocks;
      }
      if (product) await ProductsApi.update(product.id, payload);
      else await ProductsApi.create(payload);
      toast.success(product ? 'Product updated' : 'Product created');
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
      title={product ? 'Edit product' : 'New product'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button form="product-form" type="submit" loading={saving}>
            {product ? 'Save changes' : 'Create product'}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} className="space-y-4">
        <Input label="Item name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus required />
        <Textarea label="Description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select label="Category" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select label="Brand" value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
            <option value="">— None —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <div className="space-y-1">
            <label htmlFor="unit" className="block text-sm font-medium text-slate-700">
              Unit
            </label>
            <input
              id="unit"
              list="unit-options"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              required
            />
            <datalist id="unit-options">
              {COMMON_UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
          <Select label="Origin (commission rules)" value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })}>
            <option value="Philippines">Philippines</option>
            <option value="China">China</option>
          </Select>
        </div>

        {/* Pricing */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-navy">Pricing</h4>
            {!canEditPricing && <span className="text-xs text-amber-700">Pricing is managed by the Admin</span>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Cost price (₱)"
              type="number"
              step="0.01"
              min={0}
              value={form.costPrice}
              onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
              disabled={!canEditPricing}
            />
            <Input
              label="Selling price (₱)"
              type="number"
              step="0.01"
              min={0}
              value={form.basePrice}
              onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
              disabled={!canEditPricing}
            />
          </div>
          {canEditPricing && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-slate-500">
                Quick-pick selling price from cost:
              </p>
              <div className="flex flex-wrap gap-2">
                {options.map((o) => (
                  <button
                    key={o.markup}
                    type="button"
                    onClick={() => setForm({ ...form, basePrice: String(o.price) })}
                    className="rounded-md border border-navy/30 bg-white px-3 py-1.5 text-xs font-medium text-navy hover:bg-navy hover:text-white"
                  >
                    +{o.markup}% → {peso(o.price)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Initial stock (create only) */}
        {!product && (
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-navy">Initial stock locations</h4>
              <Button type="button" variant="secondary" onClick={addRow}>
                <Plus className="h-4 w-4" /> Add location
              </Button>
            </div>
            {stockRows.length === 0 ? (
              <p className="text-xs text-slate-500">Optional. Add where this item is stored and how many are on hand.</p>
            ) : (
              <div className="space-y-2">
                {stockRows.map((r, i) => (
                  <div key={i} className="grid grid-cols-12 items-end gap-2">
                    <div className="col-span-4">
                      <Select label={i === 0 ? 'Floor' : undefined} value={r.floor} onChange={(e) => updateRow(i, { floor: e.target.value as Floor })}>
                        <option value="FIRST">First Floor</option>
                        <option value="SECOND">Second Floor</option>
                      </Select>
                    </div>
                    <div className="col-span-4">
                      <Input label={i === 0 ? 'Room #' : undefined} value={r.roomNumber} onChange={(e) => updateRow(i, { roomNumber: e.target.value })} placeholder="e.g. 101" />
                    </div>
                    <div className="col-span-3">
                      <Input label={i === 0 ? 'Qty' : undefined} type="number" min={0} value={r.quantity} onChange={(e) => updateRow(i, { quantity: e.target.value })} />
                    </div>
                    <div className="col-span-1 pb-1">
                      <button type="button" onClick={() => removeRow(i)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
