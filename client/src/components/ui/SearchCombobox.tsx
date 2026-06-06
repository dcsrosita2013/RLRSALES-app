import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import clsx from 'clsx';
import { Search, X } from 'lucide-react';

export interface ComboOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface Props {
  label?: string;
  /** Selected option id ('' = none). */
  value: string;
  /** Label to show when an option is preselected (e.g. when editing). */
  displayName?: string;
  /** Server-side search; called debounced with the trimmed query. */
  search: (q: string) => Promise<ComboOption[]>;
  onSelect: (option: ComboOption | null) => void;
  placeholder?: string;
  /** Shown when a query has no matches. */
  emptyText?: string;
  /** Shown before the user has typed anything. */
  hintText?: string;
  className?: string;
}

/**
 * Generic search-as-you-type picker. Queries the server (debounced) instead of
 * loading a whole list into a <select> — for suppliers, customers, etc. at scale.
 */
export function SearchCombobox({
  label,
  value,
  displayName,
  search,
  onSelect,
  placeholder = 'Search…',
  emptyText = 'No matches',
  hintText = 'Type to search',
  className,
}: Props) {
  const [query, setQuery] = useState(displayName ?? '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ComboOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (displayName !== undefined) setQuery(displayName);
  }, [displayName]);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await search(query.trim()));
        setActive(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(o: ComboOption) {
    onSelect(o);
    setQuery(o.label);
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
              <div className="px-3 py-3 text-sm text-slate-400">{query.trim() ? emptyText : hintText}</div>
            ) : (
              results.map((o, i) => (
                <button
                  type="button"
                  key={o.id}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={clsx(
                    'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm',
                    i === active ? 'bg-navy text-white' : 'hover:bg-slate-100',
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {o.sublabel && (
                    <span className={clsx('shrink-0 text-xs', i === active ? 'text-slate-100' : 'text-slate-400')}>
                      {o.sublabel}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
