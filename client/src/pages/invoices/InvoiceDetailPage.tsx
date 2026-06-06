import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Pencil, Printer, CheckCircle2, Ban, Trash2, FileCheck2, CircleDollarSign, Truck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { PasswordConfirmDialog } from '../../components/ui/PasswordConfirmDialog';
import { InvoicesApi } from '../../lib/resources';
import { apiErrorMessage } from '../../lib/api';
import { peso, formatDate } from '../../lib/format';
import { STATUS_COLOR, PAYMENT_COLOR, openPdfInNewTab } from '../../lib/invoice';
import { useAuth } from '../../context/AuthContext';
import type { Invoice } from '../../lib/types';
import { VAT_LABELS, INVOICE_STATUS_LABEL, PAYMENT_LABEL } from '../../lib/types';

export function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'finalize' | 'void' | 'delete'>(null);
  const [pwDelete, setPwDelete] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    InvoicesApi.get(id)
      .then(setInvoice)
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
  if (!invoice) {
    return <p className="text-slate-500">Invoice not found.</p>;
  }

  const isAdmin = user?.role === 'ADMIN';
  const isCreator = invoice.createdBy?.id === user?.id;
  const draftOwner = isAdmin || (user?.role === 'AGENT' && isCreator);

  const canEditDraft = invoice.status === 'DRAFT' && draftOwner;
  const canEditFinalized = invoice.status === 'FINALIZED' && isAdmin;
  const canFinalize = invoice.status === 'DRAFT' && draftOwner;
  const canVoid = invoice.status === 'FINALIZED' && isAdmin;
  const canPay = invoice.status === 'FINALIZED' && isAdmin;
  const canAgentDeleteDraft = invoice.status === 'DRAFT' && user?.role === 'AGENT' && isCreator;

  async function run(fn: () => Promise<Invoice>, msg: string) {
    setBusy(true);
    try {
      const updated = await fn();
      setInvoice(updated);
      toast.success(msg);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function printPdf() {
    try {
      const blob = await InvoicesApi.pdf(invoice!.id);
      openPdfInNewTab(blob);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await InvoicesApi.remove(invoice!.id);
      toast.success('Draft deleted');
      navigate('/invoices');
    } catch (e) {
      toast.error(apiErrorMessage(e));
      setBusy(false);
      setConfirm(null);
    }
  }
  async function forceDelete(password: string) {
    setBusy(true);
    try {
      await InvoicesApi.forceDelete(invoice!.id, password);
      toast.success('Invoice deleted');
      navigate('/invoices');
    } catch (e) {
      toast.error(apiErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/invoices')} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-navy">{invoice.number ?? 'Draft invoice'}</h2>
              <Badge color={STATUS_COLOR[invoice.status]}>{INVOICE_STATUS_LABEL[invoice.status]}</Badge>
              <Badge color={PAYMENT_COLOR[invoice.paymentStatus]}>{PAYMENT_LABEL[invoice.paymentStatus]}</Badge>
            </div>
            <p className="text-sm text-slate-500">{formatDate(invoice.date)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {invoice.status !== 'DRAFT' && (
            <Button variant="secondary" onClick={printPdf}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          )}
          {(user?.role === 'ADMIN' || user?.role === 'AGENT') && invoice.status !== 'VOID' && (
            <Button variant="secondary" onClick={() => navigate(`/delivery-receipts/new?fromInvoice=${invoice.id}`)}>
              <Truck className="h-4 w-4" /> Create DR
            </Button>
          )}
          {(canEditDraft || canEditFinalized) && (
            <Button variant="secondary" onClick={() => navigate(`/invoices/${invoice.id}/edit`)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          {canPay &&
            (invoice.paymentStatus === 'PAID' ? (
              <Button variant="secondary" loading={busy} onClick={() => run(() => InvoicesApi.setPaid(invoice.id, false), 'Marked unpaid')}>
                <CircleDollarSign className="h-4 w-4" /> Mark unpaid
              </Button>
            ) : (
              <Button loading={busy} onClick={() => run(() => InvoicesApi.setPaid(invoice.id, true), 'Marked paid')}>
                <CheckCircle2 className="h-4 w-4" /> Mark paid
              </Button>
            ))}
          {canFinalize && (
            <Button loading={busy} onClick={() => setConfirm('finalize')}>
              <FileCheck2 className="h-4 w-4" /> Finalize
            </Button>
          )}
          {canVoid && (
            <Button variant="danger" loading={busy} onClick={() => setConfirm('void')}>
              <Ban className="h-4 w-4" /> Void
            </Button>
          )}
          {isAdmin ? (
            <Button variant="danger" loading={busy} onClick={() => setPwDelete(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          ) : (
            canAgentDeleteDraft && (
              <Button variant="danger" loading={busy} onClick={() => setConfirm('delete')}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )
          )}
        </div>
      </div>

      {invoice.status === 'FINALIZED' && !isAdmin && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
          This invoice is finalized and locked. Only an Admin can edit, void, or change its payment status.
        </div>
      )}

      {/* Parties / meta */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <p className="text-xs font-semibold uppercase text-slate-400">Bill to</p>
          <p className="mt-1 text-lg font-semibold text-slate-800">{invoice.customerName}</p>
          <p className="text-sm text-slate-500">TIN: {invoice.customerTin || '—'}</p>
          <p className="text-sm text-slate-500">VAT: {VAT_LABELS[invoice.vatClass]}</p>
        </Card>
        <Card className="space-y-1 p-5 text-sm">
          <Meta label="Terms" value={invoice.termsType === 'NET' ? `Net ${invoice.netDays} days` : 'COD'} />
          <Meta label="PO Number" value={invoice.poNumber || '—'} />
          <Meta label="Agent" value={invoice.agent?.name || '—'} />
          <Meta label="Prepared by" value={invoice.createdBy?.fullName || '—'} />
        </Card>
      </div>

      {/* Items */}
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
              {invoice.items.map((it) => (
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
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            <Meta label="Subtotal" value={peso(invoice.subtotal)} />
            {invoice.discount > 0 && <Meta label="Discount" value={`- ${peso(invoice.discount)}`} />}
            {invoice.vatClass === 'VAT' && <Meta label="VATable Sales" value={peso(invoice.vatableSales)} />}
            {invoice.vatClass === 'VAT' && <Meta label={invoice.addVat ? 'VAT (12%)' : 'VAT (not added)'} value={peso(invoice.vatAmount)} />}
            {invoice.vatClass === 'ZERO_RATED' && <Meta label="Zero-Rated Sales" value={peso(invoice.zeroRatedSales)} />}
            {invoice.vatClass === 'VAT_EXEMPT' && <Meta label="VAT-Exempt Sales" value={peso(invoice.vatExemptSales)} />}
            <div className="border-t border-slate-200 pt-2">
              <div className="flex items-center justify-between text-base font-bold text-navy">
                <span>Total Due</span>
                <span>{peso(invoice.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirm === 'finalize'}
        title="Finalize invoice"
        message="This assigns the official invoice number and deducts stock from inventory. After finalizing, only an Admin can edit or void it."
        confirmLabel="Finalize"
        danger={false}
        loading={busy}
        onConfirm={() => run(() => InvoicesApi.finalize(invoice.id), 'Invoice finalized')}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'void'}
        title="Void invoice"
        message="Voiding returns the deducted stock to inventory. The invoice number is retained for audit."
        confirmLabel="Void invoice"
        loading={busy}
        onConfirm={() => run(() => InvoicesApi.void(invoice.id), 'Invoice voided')}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete draft"
        message="Delete this draft invoice? This cannot be undone."
        loading={busy}
        onConfirm={remove}
        onCancel={() => setConfirm(null)}
      />
      {pwDelete && (
        <PasswordConfirmDialog
          title="Delete invoice"
          message={`Permanently delete invoice ${invoice.number ?? 'draft'}? This cannot be undone. Any deducted stock is returned and linked records are unlinked.`}
          loading={busy}
          onConfirm={forceDelete}
          onCancel={() => setPwDelete(false)}
        />
      )}
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
