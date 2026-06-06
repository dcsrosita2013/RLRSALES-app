const pesoFmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const numFmt = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 });

export function peso(n: number | null | undefined): string {
  return pesoFmt.format(n ?? 0);
}

export function num(n: number | null | undefined): string {
  return numFmt.format(n ?? 0);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}
