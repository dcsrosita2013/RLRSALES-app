import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Pencil, Printer, CheckCircle2, XCircle, PackageCheck, Ban, Trash2, CircleDollarSign } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { Textarea } from '../../components/ui/Textarea';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { PasswordConfirmDialog } from '../../components/ui/PasswordConfirmDialog';
import { PurchaseOrdersApi } from '../../lib/resources';
import { apiErrorMessage } from '../../lib/api';
import { peso, formatDate } from '../../lib/format';
import { PO_APPROVAL_COLOR } from '../../lib/po';
import { PAYMENT_COLOR, openPdfInNewTab } from '../../lib/invoice';
import { useAuth } from '../../context/AuthContext';
import type { PurchaseOrder, Floor } from '../../lib/types';
import { PO_APPROVAL_LABEL, PAYMENT_LABEL, FLOOR_LABELS } from '../../lib/types';

export function PODetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'approve' | 'receive' | 'delete'>(null);
  const [pwDelete, setPwDelete] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    PurchaseOrdersApi.get(id)
      .then(setPo)
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
  if (!po) return <p className="text-slate-500">Purchase order not found.</p>;

  const role = user?.role;
  const isAdmin = role === 'ADMIN';
  const canManage = role === 'ADMIN' || role === 'WAREHOUSE';
  const isPending = po.approvalStatus === 'PENDING';
  const isApproved = po.approvalStatus === 'APPROVED';
  const isRejected = po.approvalStatus === 'REJECTED';

  const canEdit = !po.received && ((canManage && (isPending || isRejected)) || (isAdmin && isApproved));
  const canApprove = isAdmin && isPending;
  const canReceive = canManage && isApproved && !po.received;
  const canPay = (isAdmin || role === 'FINANCE') && isApproved;
  const canDelete = canManage && !po.received && !isApproved;

  async function run(fn: () => Promise<PurchaseOrder>, msg: string) {
    setBusy(true);
    try {
      setPo(await fn());
      toast.success(msg);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setBusy(false);
      setConfirm(null);
      setRejectOpen(false);
    }
  }
  async function printPdf() {
    try {
      openPdfInNewTab(await PurchaseOrdersApi.pdf(po!.id));
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await PurchaseOrdersApi.remove(po!.id);
      toast.success('PO deleted');
      navigate('/purchase-orders');
    } catch (e) {
      toast.error(apiErrorMessage(e));
      setBusy(false);
      setConfirm(null);
    }
  }
  async function forceDelete(password: string) {
    setBusy(true);
    try {
      await PurchaseOrdersApi.forceDelete(po!.id, password);
      toast.success('Purchase order deleted');
      navigate('/purchase-orders');
    } catch (e) {
      toast.error(apiErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/purchase-orders')} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold text-navy">{po.number}</h2>
              <Badge color={PO_APPROVAL_COLOR[po.approvalStatus]}>{PO_APPROVAL_LABEL[po.approvalStatus]}</Badge>
              <Badge color={PAYMENT_COLOR[po.paymentStatus]}>{PAYMENT_LABEL[po.paymentStatus]}</Badge>
              {po.received && <Badge color="green">Received</Badge>}
            </div>
            <p className="text-sm text-slate-500">{formatDate(po.invoiceDate)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {isApproved && (
            <Button variant="secondary" onClick={printPdf}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          )}
          {canEdit && (
            <Button variant="secondary" onClick={() => navigate(`/purchase-orders/${po.id}/edit`)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          {canApprove && (
            <>
              <Button loading={busy} onClick={() => setConfirm('approve')}>
                <CheckCircle2 className="h-4 w-4" /> Approve
              </Button>
              <Button variant="danger" loading={busy} onClick={() => setRejectOpen(true)}>
                <XCircle className="h-4 w-4" /> Reject
              </Button>
            </>
          )}
          {canReceive && (
            <Button loading={busy} onClick={() => setConfirm('receive')}>
              <PackageCheck className="h-4 w-4" /> Receive stock
            </Button>
          )}
          {canPay &&
            (po.paymentStatus === 'PAID' ? (
              <Button variant="secondary" loading={busy} onClick={() => run(() => PurchaseOrdersApi.setPaid(po.id, false), 'Marked unpaid')}>
                <CircleDollarSign className="h-4 w-4" /> Mark unpaid
              </Button>
            ) : (
              <Button loading={busy} onClick={() => run(() => PurchaseOrdersApi.setPaid(po.id, true), 'Marked paid')}>
                <CircleDollarSign className="h-4 w-4" /> Mark paid
              </Button>
            ))}
          {isAdmin ? (
            <Button variant="danger" loading={busy} onClick={() => setPwDelete(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          ) : (
            canDelete && (
              <Button variant="danger" loading={busy} onClick={() => setConfirm('delete')}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )
          )}
        </div>
      </div>

      {isPending && !isAdmin && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          This PO is awaiting Admin approval. It can't be received or paid until approved.
        </div>
      )}
      {isRejected && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <strong>Rejected.</strong> {po.rejectionReason || 'No reason provided.'} Edit and save to resubmit for approval.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <p className="text-xs font-semibold uppercase text-slate-400">Vendor / Supplier</p>
          <p className="mt-1 text-lg font-semibold text-slate-800">{po.supplierName}</p>
          {po.notes && <p className="mt-1 text-sm text-slate-500">{po.notes}</p>}
        </Card>
        <Card className="space-y-1 p-5 text-sm">
          <Meta label="Terms" value={po.termsType === 'NET' ? `Net ${po.netDays} days` : 'COD'} />
          <Meta label="Prepared by" value={po.createdBy?.fullName || '—'} />
          <Meta label="Approved by" value={po.approvedBy?.fullName || '—'} />
          {po.receivedAt && <Meta label="Received" value={formatDate(po.receivedAt)} />}
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
                <th className="px-4 py-2 font-semibold">Destination</th>
                <th className="px-4 py-2 text-right font-semibold">Unit cost</th>
                <th className="px-4 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {po.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-4 py-2 text-slate-700">{it.description}</td>
                  <td className="px-4 py-2 text-right">{it.qty}</td>
                  <td className="px-4 py-2">{it.unit}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {it.productId ? `${it.floor ? FLOOR_LABELS[it.floor as Floor].replace(' Floor', 'F') : 'First F'} · ${it.roomNumber || 'RECEIVING'}` : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">{peso(it.unitCost)}</td>
                  <td className="px-4 py-2 text-right font-medium">{peso(it.lineTotal ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end border-t border-slate-200 p-4">
          <div className="flex items-center gap-6">
            <span className="text-sm text-slate-500">Total</span>
            <span className="text-lg font-bold text-navy">{peso(po.total)}</span>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirm === 'approve'}
        title="Approve purchase order"
        message="Approve this PO? It can then be received into stock and marked paid."
        confirmLabel="Approve"
        danger={false}
        loading={busy}
        onConfirm={() => run(() => PurchaseOrdersApi.approve(po.id), 'PO approved')}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'receive'}
        title="Receive stock"
        message="Mark this PO as received? The ordered quantities will be added to inventory at their destination locations."
        confirmLabel="Receive"
        danger={false}
        loading={busy}
        onConfirm={() => run(() => PurchaseOrdersApi.receive(po.id), 'Stock received')}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete PO"
        message="Delete this purchase order? This cannot be undone."
        loading={busy}
        onConfirm={remove}
        onCancel={() => setConfirm(null)}
      />
      {pwDelete && (
        <PasswordConfirmDialog
          title="Delete purchase order"
          message={`Permanently delete ${po.number}? This cannot be undone. Any received stock is reversed and linked payments are unlinked.`}
          loading={busy}
          onConfirm={forceDelete}
          onCancel={() => setPwDelete(false)}
        />
      )}

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject purchase order"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => run(() => PurchaseOrdersApi.reject(po.id, rejectReason || null), 'PO rejected')}>
              Reject PO
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason (optional)"
          rows={3}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="e.g. Wrong quantities, get another quote…"
        />
      </Modal>
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
