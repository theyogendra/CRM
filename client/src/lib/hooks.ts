import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/** Fetches a GET endpoint and exposes data/loading/error plus a reload function. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError('');
    try {
      setData(await api.get<T>(url));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}
