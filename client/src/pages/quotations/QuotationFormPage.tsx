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
import { CustomersApi, AgentsApi, ProductsApi, QuotationsApi, QuotationInput } from '../../lib/resources';
import { apiErrorMessage } from '../../lib/api';
import { peso } from '../../lib/format';
import type { Customer, Agent, Product } from '../../lib/types';

interface Line {
  key: number;
  productId: string;
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
  markupOption: string;
}
let keyCounter = 1;
const newLine = (): Line => ({ key: keyCounter++, productId: '', description: '', qty: '1', unit: 'pc', unitPrice: '', markupOption: '' });

export function QuotationFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();

  const { data: customers } = useList<Customer>(() => CustomersApi.list(), []);
  const { data: agents } = useList<Agent>(() => AgentsApi.list(), []);
  const { data: products } = useList<Product>(() => ProductsApi.list(), []);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const [loading, setLoading] = useState(editing);
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [customerId, setCustomerId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Line[]>([newLine()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    QuotationsApi.get(id)
      .then((qt) => {
        setNumber(qt.number);
        setDate(new Date(qt.date).toISOString().slice(0, 10));
        setCustomerId(qt.customerId);
        setAgentId(qt.agentId ?? '');
        setValidUntil(qt.validUntil ? new Date(qt.validUntil).toISOString().slice(0, 10) : '');
        setNotes(qt.notes ?? '');
        setItems(qt.items.length ? qt.items.map((it) => ({ key: keyCounter++, productId: it.productId ?? '', description: it.description, qty: String(it.qty), unit: it.unit, unitPrice: String(it.unitPrice), markupOption: it.markupOption ?? '' })) : [newLine()]);
      })
      .catch((e) => toast.error(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [id]);

  function updateItem(key: number, patch: Partial<Line>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function onPickProduct(key: number, productId: string) {
    const p = productMap.get(productId);
    if (p) updateItem(key, { productId, description: p.name, unit: p.unit, unitPrice: String(p.basePrice), markupOption: 'BASE' });
    else updateItem(key, { productId: '' });
  }

  const total = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!customerId) {
      toast.error('Please select a customer');
      return;
    }
    const valid = items.filter((i) => (Number(i.qty) || 0) > 0 && i.unitPrice !== '' && (i.description.trim() || i.productId));
    if (valid.length === 0) {
      toast.error('Add at least one line item');
      return;
    }
    const payload: QuotationInput = {
      number: number.trim() || null,
      date,
      customerId,
      agentId: agentId || null,
      validUntil: validUntil || null,
      notes: notes || null,
      items: valid.map((i) => ({ productId: i.productId || null, description: i.description, qty: Number(i.qty), unit: i.unit, unitPrice: Number(i.unitPrice), markupOption: i.markupOption || null })),
    };
    setSaving(true);
    try {
      const saved = editing ? await QuotationsApi.update(id!, payload) : await QuotationsApi.create(payload);
      toast.success(editing ? 'Quotation updated' : 'Quotation created');
      navigate(`/quotations/${saved.id}`);
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
        <PageHeader title={editing ? 'Edit quotation' : 'New quotation'} />
      </div>

      <form onSubmit={save} className="space-y-5">
        <Card className="p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Input label="Quotation #" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Auto-generated if blank" />
              <p className="mt-1 text-xs text-slate-500">Type your own or leave blank.</p>
            </div>
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input label="Valid until" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            <Select label="Customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select label="Agent" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              <option value="">— None —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
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
              const product = item.productId ? productMap.get(item.productId) : undefined;
              const lineTotal = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
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
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Input placeholder="Qty" type="number" min={0} step="any" value={item.qty} onChange={(e) => updateItem(item.key, { qty: e.target.value })} />
                        <Input placeholder="Unit" value={item.unit} onChange={(e) => updateItem(item.key, { unit: e.target.value })} />
                        <Input placeholder="Unit price" type="number" min={0} step="0.01" value={item.unitPrice} onChange={(e) => updateItem(item.key, { unitPrice: e.target.value, markupOption: 'CUSTOM' })} />
                        <div className="flex items-center justify-end px-2 text-sm font-medium text-slate-700">{peso(lineTotal)}</div>
                      </div>
                      {product && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-slate-400">Price:</span>
                          {product.priceOptions.map((o) => (
                            <PriceChip key={o.markup} label={`+${o.markup}%`} price={o.price} onClick={() => updateItem(item.key, { unitPrice: String(o.price), markupOption: String(o.markup) })} />
                          ))}
                        </div>
                      )}
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

        <Card className="p-5">
          <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Terms, delivery, validity remarks…" />
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/quotations')}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? 'Save changes' : 'Create quotation'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function PriceChip({ label, price, onClick }: { label: string; price: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded border border-navy/30 bg-white px-2 py-0.5 text-xs text-navy hover:bg-navy hover:text-white">
      {label} {peso(price)}
    </button>
  );
}
