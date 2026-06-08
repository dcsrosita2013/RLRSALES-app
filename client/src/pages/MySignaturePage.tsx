import { useEffect, useRef, useState, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Upload, Trash2, Save, PenLine } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { api, apiErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const MAX_WIDTH = 600; // signatures are resized down to at most this many pixels wide

// Read an image file and downscale it to a compact PNG data URL (keeps the payload small).
function resizeToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_WIDTH / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Could not read that image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

export function MySignaturePage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get('/auth/me/signature')
      .then((r) => setDataUrl((r.data.signature as string | null) ?? null))
      .catch((e) => toast.error(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (PNG or JPG)');
      return;
    }
    try {
      setDataUrl(await resizeToDataUrl(file));
      setDirty(true);
    } catch {
      toast.error('Could not process that image');
    }
  }

  async function save() {
    setSaving(true);
    try {
      await api.put('/auth/me/signature', { signature: dataUrl });
      toast.success('Signature saved');
      setDirty(false);
      await refresh();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await api.put('/auth/me/signature', { signature: null });
      setDataUrl(null);
      setDirty(false);
      toast.success('Signature removed');
      await refresh();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <PageHeader title="My e-signature" subtitle="Printed in the “Prepared by” box of Purchase Orders you create" />
      </div>

      <Card className="max-w-xl space-y-4 p-6">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="flex min-h-[10rem] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
              {dataUrl ? (
                <img src={dataUrl} alt="Your signature" className="max-h-40 object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2 py-6 text-slate-400">
                  <PenLine className="h-8 w-8" />
                  <p className="text-sm">No signature uploaded yet</p>
                </div>
              )}
            </div>

            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> {dataUrl ? 'Change image' : 'Upload image'}
              </Button>
              {dataUrl && (
                <Button variant="secondary" onClick={remove} loading={saving}>
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              )}
              <Button onClick={save} loading={saving} disabled={!dirty}>
                <Save className="h-4 w-4" /> Save
              </Button>
            </div>

            <p className="text-xs text-slate-500">
              Tip: a clear photo or scan of your signature on white paper works best. The image is resized automatically to keep it small.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
