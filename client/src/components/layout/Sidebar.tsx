import { ComponentType } from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import {
  LayoutDashboard,
  FileText,
  ScrollText,
  Truck,
  Package,
  ShoppingCart,
  Users,
  Building2,
  UserCog,
  Wallet,
  ReceiptText,
  BarChart3,
  Settings,
} from 'lucide-react';
import { Logo } from '../Logo';
import { useAuth } from '../../context/AuthContext';
import type { Role } from '../../lib/types';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  roles: Role[];
}

const ALL: Role[] = ['ADMIN', 'AGENT', 'WAREHOUSE', 'FINANCE'];

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ALL },
  { to: '/quotations', label: 'Quotations', icon: ScrollText, roles: ['ADMIN', 'AGENT'] },
  { to: '/invoices', label: 'Sales Invoices', icon: FileText, roles: ['ADMIN', 'AGENT', 'FINANCE'] },
  { to: '/delivery-receipts', label: 'Delivery Receipts', icon: Truck, roles: ['ADMIN', 'AGENT', 'WAREHOUSE'] },
  { to: '/products', label: 'Products / Inventory', icon: Package, roles: ['ADMIN', 'WAREHOUSE', 'AGENT'] },
  { to: '/purchase-orders', label: 'Purchase Orders', icon: ShoppingCart, roles: ['ADMIN', 'WAREHOUSE', 'FINANCE'] },
  { to: '/customers', label: 'Customers', icon: Users, roles: ['ADMIN', 'AGENT', 'FINANCE'] },
  { to: '/suppliers', label: 'Suppliers', icon: Building2, roles: ['ADMIN', 'WAREHOUSE', 'FINANCE'] },
  { to: '/agents', label: 'Agents', icon: UserCog, roles: ['ADMIN'] },
  { to: '/collections', label: 'Collections', icon: Wallet, roles: ['ADMIN', 'FINANCE'] },
  { to: '/check-vouchers', label: 'Check Vouchers', icon: ReceiptText, roles: ['ADMIN', 'FINANCE'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: ALL },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['ADMIN'] },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const items = NAV.filter((item) => user && item.roles.includes(user.role));

  return (
    <>
      <div
        className={clsx('fixed inset-0 z-20 bg-black/40 lg:hidden', open ? 'block' : 'hidden')}
        onClick={onClose}
      />
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-navy-dark text-slate-100 transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-white p-1">
            <Logo className="h-full w-full object-contain" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-wide">RLR</p>
            <p className="text-[11px] text-silver-light">Sales &amp; Services</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-white/15 text-white'
                      : 'text-silver-light hover:bg-white/10 hover:text-white',
                  )
                }
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-5 py-3 text-[11px] text-silver">
          © {new Date().getFullYear()} RLR Sales and Services Corp.
        </div>
      </aside>
    </>
  );
}
