import { Construction } from 'lucide-react';
import { Card } from '../components/ui/Card';

export function Placeholder({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-navy">{title}</h2>
      <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-navy/10 text-navy">
          <Construction className="h-7 w-7" />
        </span>
        <p className="text-lg font-semibold text-slate-700">Coming soon</p>
        <p className="max-w-sm text-sm text-slate-500">
          The <span className="font-medium text-navy">{title}</span> module is part of an upcoming
          phase. Navigation and role-based access are already wired up.
        </p>
      </Card>
    </div>
  );
}
