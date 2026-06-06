import { useState, useEffect, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { ProductCombobox } from '../../components/ui/ProductCombobox';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { useList } from '../../hooks/useList';
import { CustomersApi, AgentsApi, ProductsApi, InvoicesApi, InvoiceInput } from '../../lib/resources';
import { apiErrorMessage } from '../../lib/api';
import { computeInvoiceTotals } from '../../lib/invoice';
import { peso } from '../../lib/format';
import type { Customer, Agent, Product, PriceOption, VatClass } from '../../lib/types';
import { VAT_LABELS } from '../../lib/types';

interface LineItem {
  key: number;
  productId: string;
  productName: string;
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
  basePrice?: number;
  priceOptions?: PriceOption[];
}

let keyCounter = 1;
const newLine = (): LineItem => ({ key: keyCounter++, productId: '', productName: '', description: '', qty: '1', unit: 'pc', unitPrice: '' });

export function InvoiceFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();

  const { data: customers } = useList<Customer>(() => CustomersApi.list(), []);
  const { data: agents } = useList<Agent>(() => AgentsApi.list(), []);

  const [loading, setLoading] = useState(editing);
  const [status, setStatus] = useState<string>('DRAFT');
  const [number, setNumber] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [termsType, setTermsType] = useState<'COD' | 'NET'>('COD');
  const [netDays, setNetDays] = useState('30');
  const [poNumber, setPoNumber] = useState('');
  const [agentId, setAgentId] = useState('');
  const [addVat, setAddVat] = useState(true);
  const [discount, setDiscount] = useState('0');
  const [items, setItems] = useState<LineItem[]>([newLine()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    InvoicesApi.get(id)
      .then(async (inv) => {
        setStatus(inv.status);
        setNumber(inv.number ?? '');
        setCustomerId(inv.customerId);
        setDate(new Date(inv.date).toISOString().slice(0, 10));
        setTermsType(inv.termsType);
        setNetDays(String(inv.netDays ?? 30));
        setPoNumber(inv.poNumber ?? '');
        setAgentId(inv.agentId ?? '');
        setAddVat(inv.addVat);
        setDiscount(String(inv.discount));
        const lines: LineItem[] = inv.items.length
          ? inv.items.map((it) => ({
              key: keyCounter++,
              productId: it.productId ?? '',
              productName: it.productId ? it.description : '',
              description: it.description,
              qty: String(it.qty),
              unit: it.unit,
              unitPrice: String(it.unitPrice),
            }))
          : [newLine()];
        // Restore each product line's real name + quick price chips.
        const ids = [...new Set(inv.items.map((it) => it.productId).filter(Boolean))] as string[];
        if (ids.length) {
          const prods = await Promise.all(ids.map((pid) => ProductsApi.get(pid).catch(() => null)));
          const pmap = new Map(prods.filter((p): p is Product => Boolean(p)).map((p) => [p.id, p]));
          for (const l of lines) {
            const p = l.productId ? pmap.get(l.productId) : undefined;
            if (p) {
              l.productName = p.name;
              l.basePrice = p.basePrice;
              l.priceOptions = p.priceOptions;
            }
          }
        }
        setItems(lines);
      })
      .catch((e) => toast.error(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const customer = customers.find((c) => c.id === customerId);
  const vatClass: VatClass = customer?.vatClass ?? 'VAT';
  const effectiveAddVat = (vatClass === 'VAT' && addVat) || vatClass === 'VAT_ADD';

  const totals = computeInvoiceTotals(
    vatClass,
    effectiveAddVat,
    Number(discount) || 0,
    items.map((i) => ({ qty: Number(i.qty) || 0, unitPrice: Number(i.unitPrice) || 0 })),
  );

  function updateItem(key: number, patch: Partial<LineItem>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function onPickProduct(key: number, p: Product | null) {
    if (p) {
      updateItem(key, {
        productId: p.id,
        productName: p.name,
        description: p.name,
        unit: p.unit,
        unitPrice: String(p.basePrice),
        basePrice: p.basePrice,
        priceOptions: p.priceOptions,
      });
    } else {
      // Cleared → becomes a custom line (keep any typed description).
      updateItem(key, { productId: '', productName: '', basePrice: undefined, priceOptions: undefined });
    }
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
    const validItems = items.filter((i) => (Number(i.qty) || 0) > 0 && i.unitPrice !== '' && (i.description.trim() || i.productId));
    if (validItems.length === 0) {
      toast.error('Add at least one line item');
      return;
    }
    const payload: InvoiceInput = {
      customerId,
      number: number.trim() || null,
      date,
      termsType,
      netDays: termsType === 'NET' ? Number(netDays) : null,
      poNumber: poNumber || null,
      agentId: agentId || null,
      addVat: effectiveAddVat,
      discount: Number(discount) || 0,
      items: validItems.map((i) => ({
        productId: i.productId || null,
        description: i.description,
        qty: Number(i.qty),
        unit: i.unit,
        unitPrice: Number(i.unitPrice),
      })),
    };
    setSaving(true);
    try {
      const saved = editing ? await InvoicesApi.update(id!, payload) : await InvoicesApi.create(payload);
      toast.success(editing ? 'Invoice updated' : 'Draft saved');
      navigate(`/invoices/${saved.id}`);
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
        <PageHeader title={editing ? 'Edit invoice' : 'New invoice'} />
      </div>

      {editing && status !== 'DRAFT' && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          You are editing a <strong>{status.toLowerCase()}</strong> invoice. Saving will re-adjust deducted stock accordingly.
        </div>
      )}

      <form onSubmit={save} className="space-y-5">
        {/* Header fields */}
        <Card className="p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <Select label="Customer" value={customerId} onChange={(e) => onCustomerChange(e.target.value)} required>
                <option value="">Select customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {customer && (
                <p className="mt-1 text-xs text-slate-500">
                  TIN: {customer.tin || '—'} · {VAT_LABELS[customer.vatClass]}
                </p>
              )}
            </div>
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Select label="Agent" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              <option value="">— None —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <div>
              <Input label="Invoice #" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Auto-generated if blank" />
              <p className="mt-1 text-xs text-slate-500">Type your own to continue an existing series.</p>
            </div>
            <Select label="Terms" value={termsType} onChange={(e) => setTermsType(e.target.value as 'COD' | 'NET')}>
              <option value="COD">COD</option>
              <option value="NET">Net X days</option>
            </Select>
            {termsType === 'NET' && (
              <Input label="Net days" type="number" min={1} value={netDays} onChange={(e) => setNetDays(e.target.value)} />
            )}
            <Input label="PO Number" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
          </div>
        </Card>

        {/* Line items */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-navy">Line items</h3>
            <Button type="button" variant="secondary" onClick={() => setItems((r) => [...r, newLine()])}>
              <Plus className="h-4 w-4" /> Add line
            </Button>
          </div>
          <div className="space-y-3">
            {items.map((item) => {
              const lineTotal = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
              const hasChips = (item.priceOptions?.length ?? 0) > 0;
              return (
                <div key={item.key} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <ProductCombobox
                          value={item.productId}
                          displayName={item.productName}
                          onSelect={(p) => onPickProduct(item.key, p)}
                          placeholder="Search products, or leave blank for a custom line…"
                        />
                        <Input placeholder="Description" value={item.description} onChange={(e) => updateItem(item.key, { description: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Input placeholder="Qty" type="number" min={0} step="any" value={item.qty} onChange={(e) => updateItem(item.key, { qty: e.target.value })} />
                        <Input placeholder="Unit" value={item.unit} onChange={(e) => updateItem(item.key, { unit: e.target.value })} />
                        <Input placeholder="Unit price" type="number" min={0} step="0.01" value={item.unitPrice} onChange={(e) => updateItem(item.key, { unitPrice: e.target.value })} />
                        <div className="flex items-center justify-end px-2 text-sm font-medium text-slate-700">{peso(lineTotal)}</div>
                      </div>
                      {hasChips && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-slate-400">Price:</span>
                          {item.priceOptions?.map((o) => (
                            <PriceChip key={o.markup} label={`+${o.markup}%`} price={o.price} onClick={(p) => updateItem(item.key, { unitPrice: String(p) })} />
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setItems((r) => (r.length > 1 ? r.filter((x) => x.key !== item.key) : r))}
                      className="mt-1 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Totals + VAT */}
        <Card className="p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <Input label="Discount (₱)" type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              {vatClass === 'VAT' ? (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={addVat} onChange={(e) => setAddVat(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-navy focus:ring-navy" />
                  Add 12% VAT
                </label>
              ) : vatClass === 'VAT_ADD' ? (
                <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  Add VAT — 12% is added on top automatically.
                </p>
              ) : (
                <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {VAT_LABELS[vatClass]} — no VAT is added.
                </p>
              )}
            </div>
            <div className="space-y-1.5 rounded-lg bg-slate-50 p-4 text-sm">
              <Row label="Subtotal" value={peso(totals.subtotal)} />
              {totals.discount > 0 && <Row label="Discount" value={`- ${peso(totals.discount)}`} />}
              {(vatClass === 'VAT' || vatClass === 'VAT_ADD') && <Row label="VATable Sales" value={peso(totals.vatableSales)} />}
              {(vatClass === 'VAT' || vatClass === 'VAT_ADD') && <Row label={effectiveAddVat ? 'VAT (12%)' : 'VAT (not added)'} value={peso(totals.vatAmount)} />}
              {vatClass === 'ZERO_RATED' && <Row label="Zero-Rated Sales" value={peso(totals.zeroRatedSales)} />}
              {vatClass === 'VAT_EXEMPT' && <Row label="VAT-Exempt Sales" value={peso(totals.vatExemptSales)} />}
              <div className="mt-1 border-t border-slate-200 pt-2">
                <Row label="TOTAL" value={peso(totals.total)} bold />
              </div>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/invoices')}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? 'Save changes' : 'Save draft'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function PriceChip({ label, price, onClick }: { label: string; price: number; onClick: (price: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(price)}
      className="rounded border border-navy/30 bg-white px-2 py-0.5 text-xs text-navy hover:bg-navy hover:text-white"
    >
      {label} {peso(price)}
    </button>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'text-base font-bold text-navy' : 'text-slate-600'}`}>
      <span>{label}</span>
      <span className={bold ? '' : 'font-medium text-slate-800'}>{value}</span>
    </div>
  );
}
