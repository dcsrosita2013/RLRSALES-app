import { useState, useEffect, useMemo, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { useList } from '../../hooks/useList';
import { SuppliersApi, ProductsApi, PurchaseOrdersApi, POInput } from '../../lib/resources';
import { apiErrorMessage } from '../../lib/api';
import { peso } from '../../lib/format';
import type { Supplier, Product, Floor } from '../../lib/types';

interface Line {
  key: number;
  productId: string;
  description: string;
  qty: string;
  unit: string;
  unitCost: string;
  floor: Floor;
  roomNumber: string;
}
let keyCounter = 1;
const newLine = (): Line => ({ key: keyCounter++, productId: '', description: '', qty: '1', unit: 'pc', unitCost: '', floor: 'FIRST', roomNumber: '' });

export function POFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();

  const { data: suppliers } = useList<Supplier>(() => SuppliersApi.list(), []);
  const { data: products } = useList<Product>(() => ProductsApi.list(), []);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const [loading, setLoading] = useState(editing);
  const [supplierId, setSupplierId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [termsType, setTermsType] = useState<'COD' | 'NET'>('COD');
  const [netDays, setNetDays] = useState('30');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Line[]>([newLine()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    PurchaseOrdersApi.get(id)
      .then((po) => {
        setSupplierId(po.supplierId);
        setInvoiceDate(new Date(po.invoiceDate).toISOString().slice(0, 10));
        setTermsType(po.termsType);
        setNetDays(String(po.netDays ?? 30));
        setNotes(po.notes ?? '');
        setItems(
          po.items.length
            ? po.items.map((it) => ({
                key: keyCounter++,
                productId: it.productId ?? '',
                description: it.description,
                qty: String(it.qty),
                unit: it.unit,
                unitCost: String(it.unitCost),
                floor: it.floor ?? 'FIRST',
                roomNumber: it.roomNumber ?? '',
              }))
            : [newLine()],
        );
      })
      .catch((e) => toast.error(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [id]);

  function onPickSupplier(sid: string) {
    setSupplierId(sid);
    const s = suppliers.find((x) => x.id === sid);
    if (s) {
      setTermsType(s.termsType);
      if (s.termsType === 'NET' && s.netDays) setNetDays(String(s.netDays));
    }
  }

  function updateItem(key: number, patch: Partial<Line>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function onPickProduct(key: number, productId: string) {
    const p = productMap.get(productId);
    if (p) updateItem(key, { productId, description: p.name, unit: p.unit, unitCost: String(p.costPrice) });
    else updateItem(key, { productId: '' });
  }

  const total = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitCost) || 0), 0);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      toast.error('Please select a supplier');
      return;
    }
    const valid = items.filter((i) => (Number(i.qty) || 0) > 0 && i.unitCost !== '' && (i.description.trim() || i.productId));
    if (valid.length === 0) {
      toast.error('Add at least one line item');
      return;
    }
    const payload: POInput = {
      supplierId,
      invoiceDate,
      termsType,
      netDays: termsType === 'NET' ? Number(netDays) : null,
      notes: notes || null,
      items: valid.map((i) => ({
        productId: i.productId || null,
        description: i.description,
        qty: Number(i.qty),
        unit: i.unit,
        unitCost: Number(i.unitCost),
        floor: i.floor,
        roomNumber: i.roomNumber || null,
      })),
    };
    setSaving(true);
    try {
      const saved = editing ? await PurchaseOrdersApi.update(id!, payload) : await PurchaseOrdersApi.create(payload);
      toast.success(editing ? 'PO updated' : 'PO created (pending approval)');
      navigate(`/purchase-orders/${saved.id}`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <PageHeader title={editing ? 'Edit purchase order' : 'New purchase order'} />
      </div>

      <form onSubmit={save} className="space-y-5">
        <Card className="p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Select label="Supplier" value={supplierId} onChange={(e) => onPickSupplier(e.target.value)} required>
              <option value="">Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Input label="Invoice date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            <Select label="Terms" value={termsType} onChange={(e) => setTermsType(e.target.value as 'COD' | 'NET')}>
              <option value="COD">COD</option>
              <option value="NET">Net X days</option>
            </Select>
            {termsType === 'NET' && <Input label="Net days" type="number" min={1} value={netDays} onChange={(e) => setNetDays(e.target.value)} />}
            <div className="md:col-span-2">
              <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-navy">Line items</h3>
            <Button type="button" variant="secondary" onClick={() => setItems((r) => [...r, newLine()])}>
              <Plus className="h-4 w-4" /> Add line
            </Button>
          </div>
          <div className="space-y-3">
            {items.map((item) => {
              const lineTotal = (Number(item.qty) || 0) * (Number(item.unitCost) || 0);
              return (
                <div key={item.key} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Select value={item.productId} onChange={(e) => onPickProduct(item.key, e.target.value)}>
                          <option value="">— Custom line —</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                        <Input placeholder="Description" value={item.description} onChange={(e) => updateItem(item.key, { description: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                        <Input placeholder="Qty" type="number" min={0} step="any" value={item.qty} onChange={(e) => updateItem(item.key, { qty: e.target.value })} />
                        <Input placeholder="Unit" value={item.unit} onChange={(e) => updateItem(item.key, { unit: e.target.value })} />
                        <Input placeholder="Unit cost" type="number" min={0} step="0.01" value={item.unitCost} onChange={(e) => updateItem(item.key, { unitCost: e.target.value })} />
                        <Select value={item.floor} onChange={(e) => updateItem(item.key, { floor: e.target.value as Floor })}>
                          <option value="FIRST">First Fl.</option>
                          <option value="SECOND">Second Fl.</option>
                        </Select>
                        <Input placeholder="Room" value={item.roomNumber} onChange={(e) => updateItem(item.key, { roomNumber: e.target.value })} />
                        <div className="flex items-center justify-end px-2 text-sm font-medium text-slate-700">{peso(lineTotal)}</div>
                      </div>
                      <p className="text-xs text-slate-400">Floor/room is the destination when this PO is received into stock.</p>
                    </div>
                    <button type="button" onClick={() => setItems((r) => (r.length > 1 ? r.filter((x) => x.key !== item.key) : r))} className="mt-1 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove line">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end border-t border-slate-200 pt-3">
            <div className="flex items-center gap-6">
              <span className="text-sm text-slate-500">Total</span>
              <span className="text-lg font-bold text-navy">{peso(total)}</span>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/purchase-orders')}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? 'Save changes' : 'Create PO'}
          </Button>
        </div>
      </form>
    </div>
  );
}
