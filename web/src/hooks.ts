import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Load async data, re-running when `deps` change. `reload` refetches while keeping the current data
 * on screen (used for live updates).
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const gen = generation.current;
    try {
      const result = await fnRef.current();
      if (gen === generation.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (gen === generation.current) setError((e as Error).message);
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    generation.current++;
    setLoading(true);
    setData(null);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload };
}
