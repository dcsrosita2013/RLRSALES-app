import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import clsx from 'clsx';
import { Search, X } from 'lucide-react';
import { ProductsApi } from '../../lib/resources';
import { num } from '../../lib/format';
import type { Product } from '../../lib/types';

interface Props {
  label?: string;
  /** Selected product id ('' = none). */
  value: string;
  /** Name to display when a product is preselected (e.g. when editing a saved line). */
  displayName?: string;
  onSelect: (product: Product | null) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Search-as-you-type product picker. Queries the server (debounced, capped at 25
 * results) instead of loading the whole catalog — built for thousands of products.
 */
export function ProductCombobox({
  label,
  value,
  displayName,
  onSelect,
  placeholder = 'Search products…',
  className,
  autoFocus,
}: Props) {
  const [query, setQuery] = useState(displayName ?? '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Reflect an externally-set selection (e.g. editing an existing line item).
  useEffect(() => {
    if (displayName !== undefined) setQuery(displayName);
  }, [displayName]);

  // Debounced server-side search while the dropdown is open.
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await ProductsApi.list({ q: query.trim() || undefined, limit: 25 });
        setResults(data);
        setActive(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open]);

  // Close when clicking outside.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(p: Product) {
    onSelect(p);
    setQuery(p.name);
    setOpen(false);
  }

  function clear() {
    onSelect(null);
    setQuery('');
    setResults([]);
    setOpen(true);
  }

  function onKey(e: KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (results[active]) {
        e.preventDefault();
        pick(results[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className={clsx('space-y-1', className)} ref={boxRef}>
      {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          value={query}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onSelect(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-8 text-sm shadow-sm transition focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
        {(query || value) && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Clear"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {open && (
          <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
            {loading ? (
              <div className="px-3 py-3 text-sm text-slate-400">Searching…</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-3 text-sm text-slate-400">
                {query.trim() ? 'No matching products' : 'Type to search products'}
              </div>
            ) : (
              results.map((p, i) => (
                <button
                  type="button"
                  key={p.id}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(p)}
                  className={clsx(
                    'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm',
                    i === active ? 'bg-navy text-white' : 'hover:bg-slate-100',
                  )}
                >
                  <span className="truncate">
                    {p.name}
                    {p.brand?.name && (
                      <span className={clsx('ml-2 text-xs', i === active ? 'text-slate-200' : 'text-slate-400')}>
                        {p.brand.name}
                      </span>
                    )}
                  </span>
                  <span className={clsx('shrink-0 text-xs', i === active ? 'text-slate-100' : 'text-slate-400')}>
                    {num(p.totalQuantity)} {p.unit}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
