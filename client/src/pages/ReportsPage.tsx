import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { BarChart3, FileSpreadsheet, Play } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { ProductCombobox } from '../components/ui/ProductCombobox';
import { SearchCombobox } from '../components/ui/SearchCombobox';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { useList } from '../hooks/useList';
import { useAuth } from '../context/AuthContext';
import { ReportsApi, ReportParams, CustomersApi, AgentsApi, SuppliersApi } from '../lib/resources';
import { apiErrorMessage } from '../lib/api';
import { peso } from '../lib/format';
import { downloadBlob } from '../lib/invoice';
import clsx from 'clsx';
import type { ReportMeta, ReportResult, Agent } from '../lib/types';

export function ReportsPage() {
  const { user } = useAuth();
  const isAgent = user?.role === 'AGENT';
  const { data: reports } = useList<ReportMeta>(() => ReportsApi.list(), []);
  const { data: agents } = useList<Agent>(() => AgentsApi.list().catch(() => []), []);

  const [selected, setSelected] = useState<ReportMeta | null>(null);
  const [filters, setFilters] = useState<ReportParams>({});
  const [result, setResult] = useState<ReportResult | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!selected && reports.length) selectReport(reports[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports]);

  function selectReport(rep: ReportMeta) {
    setSelected(rep);
    setResult(null);
    setFilters({});
  }

  function set(key: string, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  async function run() {
    if (!selected) return;
    setRunning(true);
    try {
      setResult(await ReportsApi.run(selected.key, filters));
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setRunning(false);
    }
  }

  async function exportExcel() {
    if (!selected) return;
    try {
      const blob = await ReportsApi.excel(selected.key, filters);
      downloadBlob(blob, `${selected.key}.xlsx`);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  const needs = (f: string) => selected?.filters.includes(f);

  return (
    <div className="space-y-5">
      <PageHeader title="Reports" subtitle="Run reports and export to Excel" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        {/* Report menu */}
        <Card className="p-2 lg:col-span-1">
          <div className="space-y-1">
            {reports.map((rep) => (
              <button
                key={rep.key}
                onClick={() => selectReport(rep)}
                className={clsx(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition',
                  selected?.key === rep.key ? 'bg-navy text-white' : 'text-slate-700 hover:bg-slate-100',
                )}
              >
                <BarChart3 className="h-4 w-4 shrink-0" />
                {rep.label}
              </button>
            ))}
            {reports.length === 0 && <p className="px-3 py-4 text-sm text-slate-400">No reports available for your role.</p>}
          </div>
        </Card>

        {/* Filters + results */}
        <div className="space-y-4 lg:col-span-3">
          {selected && (
            <Card className="p-4">
              <div className="flex flex-wrap items-end gap-3">
                {needs('dateRange') && (
                  <>
                    <Input label="From" type="date" value={filters.dateFrom ?? ''} onChange={(e) => set('dateFrom', e.target.value)} />
                    <Input label="To" type="date" value={filters.dateTo ?? ''} onChange={(e) => set('dateTo', e.target.value)} />
                  </>
                )}
                {needs('customer') && (
                  <SearchCombobox
                    label="Customer"
                    className="min-w-[14rem]"
                    value={filters.customerId ?? ''}
                    placeholder="All customers — type to search…"
                    hintText="Type to search customers"
                    emptyText="No matching customers"
                    search={async (q) => (await CustomersApi.list({ q: q || undefined })).map((c) => ({ id: c.id, label: c.name }))}
                    onSelect={(o) => set('customerId', o?.id ?? '')}
                  />
                )}
                {needs('collectionStatus') && (
                  <Select label="Status" value={filters.status ?? ''} onChange={(e) => set('status', e.target.value)} className="min-w-[11rem]">
                    <option value="">All statuses</option>
                    <option value="outstanding">Outstanding (any balance)</option>
                    <option value="overdue">Overdue</option>
                    <option value="uncollected">Not collected</option>
                    <option value="partial">Partial</option>
                    <option value="collected">Collected</option>
                  </Select>
                )}
                {needs('agent') && !isAgent && (
                  <Select label="Agent" value={filters.agentId ?? ''} onChange={(e) => set('agentId', e.target.value)} className="min-w-[10rem]">
                    <option value="">All agents</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                )}
                {needs('supplier') && (
                  <SearchCombobox
                    label="Supplier"
                    className="min-w-[14rem]"
                    value={filters.supplierId ?? ''}
                    placeholder="All suppliers — type to search…"
                    hintText="Type to search suppliers"
                    emptyText="No matching suppliers"
                    search={async (q) => (await SuppliersApi.list({ q: q || undefined })).map((s) => ({ id: s.id, label: s.name }))}
                    onSelect={(o) => set('supplierId', o?.id ?? '')}
                  />
                )}
                {needs('product') && (
                  <ProductCombobox
                    label="Product"
                    className="min-w-[16rem]"
                    value={filters.productId ?? ''}
                    onSelect={(p) => set('productId', p?.id ?? '')}
                  />
                )}
                <Button onClick={run} loading={running}>
                  <Play className="h-4 w-4" /> Run
                </Button>
                {result && result.columns.length > 0 && (
                  <Button variant="secondary" onClick={exportExcel}>
                    <FileSpreadsheet className="h-4 w-4" /> Export Excel
                  </Button>
                )}
              </div>
            </Card>
          )}

          {running ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner />
            </div>
          ) : result ? (
            <ReportTable result={result} />
          ) : (
            <Card>
              <EmptyState icon={BarChart3} title="Set filters and run" message="Choose a report, set the date range, and click Run." />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportTable({ result }: { result: ReportResult }) {
  if (result.columns.length === 0) {
    return (
      <Card>
        <EmptyState icon={BarChart3} title={result.title} message="Select the required filter (e.g. a customer or product) and run again." />
      </Card>
    );
  }
  const fmt = (v: string | number | null, money?: boolean) => {
    if (v === null || v === undefined || v === '') return money ? '' : '—';
    return money && typeof v === 'number' ? peso(v) : String(v);
  };
  return (
    <Card>
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="font-semibold text-navy">{result.title}</h3>
        <p className="text-xs text-slate-500">{result.rows.length} row(s)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {result.columns.map((c) => (
                <th key={c.key} className={clsx('whitespace-nowrap px-4 py-2 font-semibold', c.money || c.align === 'right' ? 'text-right' : 'text-left')}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.rows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50">
                {result.columns.map((c) => (
                  <td key={c.key} className={clsx('whitespace-nowrap px-4 py-2 text-slate-700', c.money || c.align === 'right' ? 'text-right' : 'text-left')}>
                    {fmt(row[c.key], c.money)}
                  </td>
                ))}
              </tr>
            ))}
            {result.rows.length === 0 && (
              <tr>
                <td colSpan={result.columns.length} className="px-4 py-10 text-center text-slate-400">
                  No data for the selected filters.
                </td>
              </tr>
            )}
          </tbody>
          {result.totals && (
            <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-navy">
              <tr>
                {result.columns.map((c, i) => (
                  <td key={c.key} className={clsx('px-4 py-2', c.money || c.align === 'right' ? 'text-right' : 'text-left')}>
                    {i === 0 ? 'TOTAL' : result.totals![c.key] !== undefined ? fmt(result.totals![c.key], c.money) : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
