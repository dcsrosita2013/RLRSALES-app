import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2, SlidersHorizontal } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { ProductsApi } from '../../lib/resources';
import { apiErrorMessage } from '../../lib/api';
import { num } from '../../lib/format';
import type { Product, Floor } from '../../lib/types';
import { FLOOR_LABELS } from '../../lib/types';

export function StockManagerModal({
  product: initial,
  onClose,
  onChanged,
}: {
  product: Product;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [product, setProduct] = useState<Product>(initial);
  const [busy, setBusy] = useState(false);

  // add-location form
  const [floor, setFloor] = useState<Floor>('FIRST');
  const [room, setRoom] = useState('');
  const [qty, setQty] = useState('');

  // per-row adjust
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');

  function applyResult(updated: Product) {
    setProduct(updated);
    onChanged();
  }

  async function addLocation() {
    if (!room.trim()) {
      toast.error('Room number is required');
      return;
    }
    setBusy(true);
    try {
      const updated = await ProductsApi.addStock(product.id, {
        floor,
        roomNumber: room.trim(),
        quantity: qty === '' ? 0 : Number(qty),
      });
      applyResult(updated);
      setRoom('');
      setQty('');
      toast.success('Location added');
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function applyAdjust(stockId: string) {
    const d = Number(delta);
    if (!d) {
      toast.error('Enter a non-zero adjustment (use a minus sign to reduce)');
      return;
    }
    setBusy(true);
    try {
      const updated = await ProductsApi.adjustStock(product.id, stockId, { delta: d, note: note || null });
      applyResult(updated);
      setAdjustingId(null);
      setDelta('');
      setNote('');
      toast.success('Stock adjusted');
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeLocation(stockId: string) {
    setBusy(true);
    try {
      const updated = await ProductsApi.removeStock(product.id, stockId);
      applyResult(updated);
      toast.success('Location removed');
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Stock — ${product.name}`}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-md bg-slate-50 px-4 py-2 text-sm">
          <span className="text-slate-600">Total on hand</span>
          <span className="font-semibold text-navy">
            {num(product.totalQuantity)} {product.unit}
          </span>
        </div>

        {product.stocks.length === 0 ? (
          <p className="py-2 text-sm text-slate-500">No stock locations yet. Add one below.</p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {product.stocks.map((s) => (
              <div key={s.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge color="navy">{FLOOR_LABELS[s.floor]}</Badge>
                    <span className="text-sm text-slate-600">Room {s.roomNumber}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-800">
                      {num(s.quantity)} {product.unit}
                    </span>
                    <button
                      onClick={() => {
                        setAdjustingId(adjustingId === s.id ? null : s.id);
                        setDelta('');
                        setNote('');
                      }}
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-navy"
                      aria-label="Adjust"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => removeLocation(s.id)}
                      disabled={busy}
                      className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove location"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {adjustingId === s.id && (
                  <div className="mt-3 grid grid-cols-12 items-end gap-2 rounded-md bg-slate-50 p-3">
                    <div className="col-span-3">
                      <Input
                        label="Change (+/−)"
                        type="number"
                        value={delta}
                        onChange={(e) => setDelta(e.target.value)}
                        placeholder="e.g. 10 or -3"
                      />
                    </div>
                    <div className="col-span-6">
                      <Input label="Reason / note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Received, correction…" />
                    </div>
                    <div className="col-span-3 pb-0.5">
                      <Button onClick={() => applyAdjust(s.id)} loading={busy} className="w-full">
                        Apply
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add location */}
        <div className="rounded-lg border border-dashed border-slate-300 p-3">
          <p className="mb-2 text-sm font-medium text-slate-700">Add a stock location</p>
          <div className="grid grid-cols-12 items-end gap-2">
            <div className="col-span-4">
              <Select label="Floor" value={floor} onChange={(e) => setFloor(e.target.value as Floor)}>
                <option value="FIRST">First Floor</option>
                <option value="SECOND">Second Floor</option>
              </Select>
            </div>
            <div className="col-span-4">
              <Input label="Room #" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. 101" />
            </div>
            <div className="col-span-2">
              <Input label="Qty" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="col-span-2 pb-0.5">
              <Button onClick={addLocation} loading={busy} className="w-full">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
