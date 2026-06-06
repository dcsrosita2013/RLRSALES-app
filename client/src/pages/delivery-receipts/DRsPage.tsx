import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Truck, Search, ChevronRight } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { DataTable, Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { useList } from '../../hooks/useList';
import { DeliveryReceiptsApi } from '../../lib/resources';
import { formatDate } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import type { DRSummary } from '../../lib/types';

export function DRsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreate = user?.role === 'ADMIN' || user?.role === 'AGENT' || user?.role === 'WAREHOUSE';

  const [q, setQ] = useState('');
  const { data: drs, loading } = useList<DRSummary>(() => DeliveryReceiptsApi.list({ q }), [q]);

  const columns: Column<DRSummary>[] = [
    {
      header: 'DR #',
      cell: (dr) => (
        <button onClick={() => navigate(`/delivery-receipts/${dr.id}`)} className="font-semibold text-navy hover:underline">
          {dr.number}
        </button>
      ),
    },
    { header: 'Date', cell: (dr) => formatDate(dr.date) },
    { header: 'Customer', cell: (dr) => dr.customerName },
    { header: 'PO #', cell: (dr) => dr.poNumber || '—' },
    { header: 'Invoice', cell: (dr) => (dr.invoiceNumber ? <Badge color="blue">{dr.invoiceNumber}</Badge> : '—') },
    { header: 'Items', cell: (dr) => dr.itemCount },
    {
      header: '',
      className: 'text-right',
      cell: (dr) => (
        <button onClick={() => navigate(`/delivery-receipts/${dr.id}`)} className="text-slate-400 hover:text-navy" aria-label="Open">
          <ChevronRight className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Delivery Receipts"
        subtitle="Delivery documents — standalone or from an invoice"
        actions={
          canCreate ? (
            <Button onClick={() => navigate('/delivery-receipts/new')}>
              <Plus className="h-4 w-4" /> New DR
            </Button>
          ) : undefined
        }
      />

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input placeholder="Search DR #, customer, PO…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      <DataTable
        columns={columns}
        rows={drs}
        keyField={(dr) => dr.id}
        loading={loading}
        empty={<EmptyState icon={Truck} title="No delivery receipts" message="Create a DR standalone or from an invoice." />}
      />
    </div>
  );
}
