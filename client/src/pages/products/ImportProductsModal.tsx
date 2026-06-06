import { useState } from 'react';
import toast from 'react-hot-toast';
import { Upload, FileSpreadsheet, Download } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { ProductsApi } from '../../lib/resources';
import { apiErrorMessage } from '../../lib/api';
import { downloadBlob } from '../../lib/invoice';
import type { ImportResult } from '../../lib/types';

const TEMPLATE = `Name,Description,Category,Brand,Unit,Cost,Selling Price,Floor,Room,Qty
Deep Groove Ball Bearing 6204-2RS,20x47x14mm sealed,Bearings,SKF,pc,120,156,First,101,50
Industrial Lithium Grease 1kg,EP2 multi-purpose,Lubricants,Generic,can,250,325,First,105,20
Adjustable Wrench 12in,Chrome vanadium,Tools,Generic,pc,320,416,Second,201,15`;

export function ImportProductsModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function downloadTemplate() {
    downloadBlob(new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' }), 'inventory-template.csv');
  }

  async function submit() {
    if (!file) {
      toast.error('Choose a CSV or Excel file first');
      return;
    }
    setBusy(true);
    try {
      const r = await ProductsApi.import(file);
      setResult(r);
      toast.success(`Imported: ${r.created} created, ${r.updated} updated`);
      onImported();
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
      title="Import inventory"
      size="lg"
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy} disabled={!file}>
              <Upload className="h-4 w-4" /> Import
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <div className="flex gap-3">
            <Stat label="Created" value={result.created} color="green" />
            <Stat label="Updated" value={result.updated} color="blue" />
            <Stat label="Errors" value={result.errors.length} color={result.errors.length ? 'red' : 'gray'} />
          </div>
          {result.errors.length > 0 && (
            <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {result.errors.map((e, i) => (
                <p key={i}>
                  Row {e.row}: {e.message}
                </p>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Upload a <span className="font-medium">CSV</span> or <span className="font-medium">Excel (.xlsx)</span> file. Columns:{' '}
            <span className="font-medium">Name, Description, Category, Brand, Unit, Cost, Selling Price, Floor, Room, Qty</span>. Items matched by
            name are updated; new ones are created. Categories and brands are created automatically.
          </p>
          <button onClick={downloadTemplate} className="inline-flex items-center gap-1 text-sm font-medium text-navy hover:underline">
            <Download className="h-4 w-4" /> Download CSV template
          </button>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-6 text-center hover:border-navy">
            <FileSpreadsheet className="h-8 w-8 text-slate-400" />
            <span className="text-sm text-slate-600">{file ? file.name : 'Click to choose a .csv or .xlsx file'}</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
            />
          </label>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: 'green' | 'blue' | 'red' | 'gray' }) {
  const map = {
    green: 'bg-green-50 text-green-700',
    blue: 'bg-blue-50 text-blue-700',
    red: 'bg-red-50 text-red-700',
    gray: 'bg-slate-50 text-slate-600',
  };
  return (
    <div className={`flex-1 rounded-lg p-3 text-center ${map[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}
