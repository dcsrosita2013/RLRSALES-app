import { ReactNode } from 'react';
import clsx from 'clsx';

type Color = 'gray' | 'green' | 'amber' | 'red' | 'navy' | 'blue';

const COLORS: Record<Color, string> = {
  gray: 'bg-slate-100 text-slate-700',
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-700',
  navy: 'bg-navy/10 text-navy',
  blue: 'bg-blue-100 text-blue-700',
};

export function Badge({ children, color = 'gray' }: { children: ReactNode; color?: Color }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        COLORS[color],
      )}
    >
      {children}
    </span>
  );
}
