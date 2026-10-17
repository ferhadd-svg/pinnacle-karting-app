import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Load async data; re-runs when deps change. `reload` keeps current data on screen (pull-to-refresh, live). */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const gen = useRef(0);

  const reload = useCallback(async (opts: { pull?: boolean } = {}) => {
    const g = gen.current;
    if (opts.pull) setRefreshing(true);
    try {
      const r = await fnRef.current();
      if (g === gen.current) {
        setData(r);
        setError(null);
      }
    } catch (e) {
      if (g === gen.current) setError((e as Error).message);
    } finally {
      if (g === gen.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    gen.current++;
    setLoading(true);
    setData(null);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, refreshing, reload };
}

/** Call `fn` every `ms` while the screen is focused and `enabled` (live timing). */
export function usePolling(fn: () => void, ms: number, enabled: boolean) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const t = setInterval(() => fnRef.current(), ms);
      return () => clearInterval(t);
    }, [enabled, ms]),
  );
}
