import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ScrollText, Search, ChevronRight } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { DataTable, Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { useList } from '../../hooks/useList';
import { QuotationsApi } from '../../lib/resources';
import { peso, formatDate } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import type { QuotationSummary } from '../../lib/types';

export function QuotationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreate = user?.role === 'ADMIN' || user?.role === 'AGENT';
  const [q, setQ] = useState('');
  const { data: rows, loading } = useList<QuotationSummary>(() => QuotationsApi.list({ q }), [q]);

  const columns: Column<QuotationSummary>[] = [
    {
      header: 'Quotation #',
      cell: (r) => (
        <button onClick={() => navigate(`/quotations/${r.id}`)} className="font-semibold text-navy hover:underline">
          {r.number}
        </button>
      ),
    },
    { header: 'Date', cell: (r) => formatDate(r.date) },
    { header: 'Customer', cell: (r) => r.customerName },
    { header: 'Total', headerClassName: 'text-right', className: 'text-right font-medium', cell: (r) => peso(r.total) },
    { header: 'Valid until', cell: (r) => (r.validUntil ? formatDate(r.validUntil) : '—') },
    { header: 'Status', cell: (r) => (r.converted ? <Badge color="green">Converted</Badge> : <Badge color="gray">Open</Badge>) },
    {
      header: '',
      className: 'text-right',
      cell: (r) => (
        <button onClick={() => navigate(`/quotations/${r.id}`)} className="text-slate-400 hover:text-navy" aria-label="Open">
          <ChevronRight className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Quotations"
        subtitle="Price quotes — convertible to invoices"
        actions={
          canCreate ? (
            <Button onClick={() => navigate('/quotations/new')}>
              <Plus className="h-4 w-4" /> New quotation
            </Button>
          ) : undefined
        }
      />
      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input placeholder="Search quotation # or customer…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        keyField={(r) => r.id}
        loading={loading}
        empty={<EmptyState icon={ScrollText} title="No quotations" message="Create your first price quote." />}
      />
    </div>
  );
}
