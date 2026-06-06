import { useState, useEffect, useCallback, DependencyList } from 'react';
import { apiErrorMessage } from '../lib/api';

// Small data-loading hook: runs `fetcher` on mount and whenever `deps` change,
// exposes loading/error, and a `reload()` to refetch on demand.
export function useList<T>(fetcher: () => Promise<T[]>, deps: DependencyList = []) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetcher()
      .then((d) => {
        if (active) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(apiErrorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}
