import { ComponentType, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Package, Wallet, ShoppingCart, ScrollText, Users, TrendingUp, CalendarDays } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/Card';
import { DashboardApi, SalesMonitor } from '../lib/resources';
import { peso } from '../lib/format';
import type { Role } from '../lib/types';

const ROLE_GREETING: Record<Role, string> = {
  ADMIN: 'You have full access to all modules.',
  AGENT: 'Create quotations, invoices, and delivery receipts for your customers.',
  WAREHOUSE: 'Manage inventory, receive stock, and update delivery receipts.',
  FINANCE: 'Record collections, manage check vouchers, and supplier payments.',
};

interface Tile {
  to: string;
  label: string;
  desc: string;
  icon: ComponentType<{ className?: string }>;
  roles: Role[];
}

const TILES: Tile[] = [
  { to: '/invoices', label: 'Sales Invoices', desc: 'Create & track invoices', icon: FileText, roles: ['ADMIN', 'AGENT', 'FINANCE'] },
  { to: '/quotations', label: 'Quotations', desc: 'Prepare price quotes', icon: ScrollText, roles: ['ADMIN', 'AGENT'] },
  { to: '/products', label: 'Inventory', desc: 'Stock by floor & room', icon: Package, roles: ['ADMIN', 'WAREHOUSE', 'AGENT'] },
  { to: '/purchase-orders', label: 'Purchase Orders', desc: 'Order from suppliers', icon: ShoppingCart, roles: ['ADMIN', 'WAREHOUSE', 'FINANCE'] },
  { to: '/collections', label: 'Collections', desc: 'Record customer payments', icon: Wallet, roles: ['ADMIN', 'FINANCE'] },
  { to: '/customers', label: 'Customers', desc: 'Manage customer records', icon: Users, roles: ['ADMIN', 'AGENT', 'FINANCE'] },
];

export function Dashboard() {
  const { user } = useAuth();
  const tiles = TILES.filter((t) => user && t.roles.includes(user.role));
  const showMonitor = !!user && (user.role === 'ADMIN' || user.role === 'AGENT' || user.role === 'FINANCE');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-navy">Welcome back, {user?.fullName.split(' ')[0]}</h2>
        <p className="text-sm text-slate-500">{user ? ROLE_GREETING[user.role] : ''}</p>
      </div>

      {showMonitor && <SalesMonitorSection isAgent={user!.role === 'AGENT'} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.to} to={t.to}>
              <Card className="flex items-center gap-4 p-5 transition hover:border-navy/40 hover:shadow-md">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-navy/10 text-navy">
                  <Icon className="h-6 w-6" />
                </span>
                <div>
                  <p className="font-semibold text-slate-800">{t.label}</p>
                  <p className="text-xs text-slate-500">{t.desc}</p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SalesMonitorSection({ isAgent }: { isAgent: boolean }) {
  const [data, setData] = useState<SalesMonitor | null>(null);
  useEffect(() => {
    DashboardApi.salesMonitor()
      .then(setData)
      .catch(() => undefined);
  }, []);

  if (!data) return null;
  const maxDay = Math.max(1, ...data.byDay.map((d) => d.total));
  const maxMonth = Math.max(1, ...data.byMonth.map((m) => m.total));

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{isAgent ? 'My sales monitoring' : 'Sales monitoring'}</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="flex items-center gap-3 p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-100 text-green-700">
            <CalendarDays className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs text-slate-500">Today</p>
            <p className="text-2xl font-bold text-navy">{peso(data.todayTotal)}</p>
            <p className="text-xs text-slate-400">{data.todayCount} invoice(s)</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy/10 text-navy">
            <TrendingUp className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs text-slate-500">This month</p>
            <p className="text-2xl font-bold text-navy">{peso(data.monthTotal)}</p>
            <p className="text-xs text-slate-400">{data.monthCount} invoice(s)</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="mb-3 text-sm font-semibold text-slate-700">Daily sales — last 14 days</p>
          <div className="flex h-32 items-end gap-1">
            {data.byDay.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${d.date}: ${peso(d.total)}`}>
                <div className="w-full rounded-t bg-navy/70" style={{ height: `${Math.max(3, (d.total / maxDay) * 100)}px` }} />
                <span className="text-[9px] text-slate-400">{d.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <p className="mb-3 text-sm font-semibold text-slate-700">Monthly sales — last 6 months</p>
          <div className="space-y-2">
            {data.byMonth.map((m) => (
              <div key={m.month} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 text-slate-500">{m.label}</span>
                <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100">
                  <div className="h-full rounded bg-navy/70" style={{ width: `${Math.max(2, (m.total / maxMonth) * 100)}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right font-medium text-slate-700">{peso(m.total)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
