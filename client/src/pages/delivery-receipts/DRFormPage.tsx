import { useState, useEffect, useMemo, FormEvent } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { useList } from '../../hooks/useList';
import { CustomersApi, AgentsApi, ProductsApi, InvoicesApi, DeliveryReceiptsApi, DRInput } from '../../lib/resources';
import { apiErrorMessage } from '../../lib/api';
import type { Customer, Agent, Product } from '../../lib/types';

interface Line {
  key: number;
  productId: string;
  description: string;
  qty: string;
  unit: string;
}
let keyCounter = 1;
const newLine = (): Line => ({ key: keyCounter++, productId: '', description: '', qty: '1', unit: 'pc' });

export function DRFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromInvoice = searchParams.get('fromInvoice');

  const { data: customers } = useList<Customer>(() => CustomersApi.list(), []);
  const { data: agents } = useList<Agent>(() => AgentsApi.list(), []);
  const { data: products } = useList<Product>(() => ProductsApi.list(), []);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const [loading, setLoading] = useState(editing || Boolean(fromInvoice));
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [customerId, setCustomerId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [termsType, setTermsType] = useState<'COD' | 'NET'>('COD');
  const [netDays, setNetDays] = useState('30');
  const [poNumber, setPoNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
  const [items, setItems] = useState<Line[]>([newLine()]);
  const [saving, setSaving] = useState(false);

  // Edit existing DR
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    DeliveryReceiptsApi.get(id)
      .then((dr) => {
        setNumber(dr.number);
        setDate(new Date(dr.date).toISOString().slice(0, 10));
        setCustomerId(dr.customerId);
        setAgentId(dr.agentId ?? '');
        setTermsType(dr.termsType);
        setNetDays(String(dr.netDays ?? 30));
        setPoNumber(dr.poNumber ?? '');
        setNotes(dr.notes ?? '');
        setInvoiceId(dr.invoiceId);
        setInvoiceNumber(dr.invoiceNumber);
        setItems(dr.items.length ? dr.items.map((it) => ({ key: keyCounter++, productId: it.productId ?? '', description: it.description, qty: String(it.qty), unit: it.unit })) : [newLine()]);
      })
      .catch((e) => toast.error(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [id]);

  // Prefill from a sales invoice
  useEffect(() => {
    if (id || !fromInvoice) return;
    setLoading(true);
    InvoicesApi.get(fromInvoice)
      .then((inv) => {
        setCustomerId(inv.customerId);
        setAgentId(inv.agentId ?? '');
        setTermsType(inv.termsType);
        setNetDays(String(inv.netDays ?? 30));
        setPoNumber(inv.poNumber ?? '');
        setInvoiceId(inv.id);
        setInvoiceNumber(inv.number);
        setItems(inv.items.length ? inv.items.map((it) => ({ key: keyCounter++, productId: it.productId ?? '', description: it.description, qty: String(it.qty), unit: it.unit })) : [newLine()]);
      })
      .catch((e) => toast.error(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [id, fromInvoice]);

  function updateItem(key: number, patch: Partial<Line>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function onPickProduct(key: number, productId: string) {
    const p = productMap.get(productId);
    if (p) updateItem(key, { productId, description: p.name, unit: p.unit });
    else updateItem(key, { productId: '' });
  }

  function onCustomerChange(id: string) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) {
      setTermsType(c.termsType);
      setNetDays(String(c.netDays ?? 30));
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!customerId) {
      toast.error('Please select a customer');
      return;
    }
    const valid = items.filter((i) => (Number(i.qty) || 0) > 0 && (i.description.trim() || i.productId));
    if (valid.length === 0) {
      toast.error('Add at least one line item');
      return;
    }
    const payload: DRInput = {
      number: number.trim() || null,
      date,
      customerId,
      agentId: agentId || null,
      termsType,
      netDays: termsType === 'NET' ? Number(netDays) : null,
      poNumber: poNumber || null,
      invoiceId: invoiceId || null,
      notes: notes || null,
      items: valid.map((i) => ({ productId: i.productId || null, description: i.description, qty: Number(i.qty), unit: i.unit })),
    };
    setSaving(true);
    try {
      const saved = editing ? await DeliveryReceiptsApi.update(id!, payload) : await DeliveryReceiptsApi.create(payload);
      toast.success(editing ? 'Delivery receipt updated' : 'Delivery receipt created');
      navigate(`/delivery-receipts/${saved.id}`);
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
        <PageHeader title={editing ? 'Edit delivery receipt' : 'New delivery receipt'} />
      </div>

      {invoiceNumber && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
          Linked to invoice <strong>{invoiceNumber}</strong>.
        </div>
      )}

      <form onSubmit={save} className="space-y-5">
        <Card className="p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Input label="DR #" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Auto-generated if blank" />
              <p className="mt-1 text-xs text-slate-500">Type your own or leave blank.</p>
            </div>
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input label="PO Number" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
            <Select label="Customer" value={customerId} onChange={(e) => onCustomerChange(e.target.value)} required>
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
            <h3 className="text-sm font-semibold text-navy">Items delivered</h3>
            <Button type="button" variant="secondary" onClick={() => setItems((r) => [...r, newLine()])}>
              <Plus className="h-4 w-4" /> Add line
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.key} className="grid grid-cols-12 items-center gap-2">
                <div className="col-span-4">
                  <Select value={item.productId} onChange={(e) => onPickProduct(item.key, e.target.value)}>
                    <option value="">— Custom line —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="col-span-4">
                  <Input placeholder="Description" value={item.description} onChange={(e) => updateItem(item.key, { description: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Input placeholder="Qty" type="number" min={0} step="any" value={item.qty} onChange={(e) => updateItem(item.key, { qty: e.target.value })} />
                </div>
                <div className="col-span-1">
                  <Input placeholder="Unit" value={item.unit} onChange={(e) => updateItem(item.key, { unit: e.target.value })} />
                </div>
                <div className="col-span-1 flex justify-end">
                  <button type="button" onClick={() => setItems((r) => (r.length > 1 ? r.filter((x) => x.key !== item.key) : r))} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove line">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/delivery-receipts')}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? 'Save changes' : 'Create DR'}
          </Button>
        </div>
      </form>
    </div>
  );
}
