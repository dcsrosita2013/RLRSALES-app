import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Pencil, Printer, FileText, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { QuotationsApi } from '../../lib/resources';
import { apiErrorMessage } from '../../lib/api';
import { peso, formatDate } from '../../lib/format';
import { openPdfInNewTab } from '../../lib/invoice';
import { useAuth } from '../../context/AuthContext';
import type { Quotation } from '../../lib/types';

export function QuotationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [qt, setQt] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'convert' | 'delete'>(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    QuotationsApi.get(id)
      .then(setQt)
      .catch((e) => toast.error(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => load(), [load]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!qt) return <p className="text-slate-500">Quotation not found.</p>;

  const canManage = user?.role === 'ADMIN' || user?.role === 'AGENT';
  const converted = Boolean(qt.convertedInvoiceId);

  async function printPdf() {
    try {
      openPdfInNewTab(await QuotationsApi.pdf(qt!.id));
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }
  async function convert() {
    setBusy(true);
    try {
      const inv = await QuotationsApi.convert(qt!.id);
      toast.success('Converted to invoice');
      navigate(`/invoices/${inv.id}`);
    } catch (e) {
      toast.error(apiErrorMessage(e));
      setBusy(false);
      setConfirm(null);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await QuotationsApi.remove(qt!.id);
      toast.success('Quotation deleted');
      navigate('/quotations');
    } catch (e) {
      toast.error(apiErrorMessage(e));
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/quotations')} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold text-navy">{qt.number}</h2>
              {converted && <Badge color="green">Converted</Badge>}
            </div>
            <p className="text-sm text-slate-500">{formatDate(qt.date)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={printPdf}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          {canManage && !converted && (
            <>
              <Button variant="secondary" onClick={() => navigate(`/quotations/${qt.id}/edit`)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button loading={busy} onClick={() => setConfirm('convert')}>
                <FileText className="h-4 w-4" /> Convert to invoice
              </Button>
              <Button variant="danger" loading={busy} onClick={() => setConfirm('delete')}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {converted && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
          This quotation was converted to an invoice.{' '}
          <Link to={`/invoices/${qt.convertedInvoiceId}`} className="font-medium underline">
            Open the invoice
          </Link>
          .
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <p className="text-xs font-semibold uppercase text-slate-400">Prepared for</p>
          <p className="mt-1 text-lg font-semibold text-slate-800">{qt.customerName}</p>
          {qt.notes && <p className="mt-1 text-sm text-slate-500">{qt.notes}</p>}
        </Card>
        <Card className="space-y-1 p-5 text-sm">
          <Meta label="Valid until" value={qt.validUntil ? formatDate(qt.validUntil) : '—'} />
          <Meta label="Agent" value={qt.agent?.name || '—'} />
          <Meta label="Prepared by" value={qt.createdBy?.fullName || '—'} />
        </Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-2 font-semibold">Description</th>
                <th className="px-4 py-2 text-right font-semibold">Qty</th>
                <th className="px-4 py-2 font-semibold">Unit</th>
                <th className="px-4 py-2 text-right font-semibold">Unit price</th>
                <th className="px-4 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {qt.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-4 py-2 text-slate-700">{it.description}</td>
                  <td className="px-4 py-2 text-right">{it.qty}</td>
                  <td className="px-4 py-2">{it.unit}</td>
                  <td className="px-4 py-2 text-right">{peso(it.unitPrice)}</td>
                  <td className="px-4 py-2 text-right font-medium">{peso(it.lineTotal ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end border-t border-slate-200 p-4">
          <div className="flex items-center gap-6">
            <span className="text-sm text-slate-500">Total</span>
            <span className="text-lg font-bold text-navy">{peso(qt.total)}</span>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirm === 'convert'}
        title="Convert to invoice"
        message="Create a draft sales invoice from this quotation? You can review and finalize it afterward."
        confirmLabel="Convert"
        danger={false}
        loading={busy}
        onConfirm={convert}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete quotation"
        message="Delete this quotation? This cannot be undone."
        loading={busy}
        onConfirm={remove}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}
