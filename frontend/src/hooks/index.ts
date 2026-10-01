import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * List state (page, search, filters, sort) kept in the URL so it survives reloads
 * and can be shared.
 */
export function useListParams<F extends Record<string, string>>(defaults: F & { limit?: string }) {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? (defaults as Record<string, string>)[k] ?? '';
  const state = {
    page: Number(params.get('page') ?? '1') || 1,
    limit: Number(params.get('limit') ?? defaults.limit ?? '25'),
    search: params.get('search') ?? '',
    sortBy: params.get('sortBy') ?? '',
    sortOrder: (params.get('sortOrder') as 'asc' | 'desc') ?? 'asc',
    filters: Object.fromEntries(Object.keys(defaults).filter((k) => k !== 'limit').map((k) => [k, get(k)])) as F,
  };
  const update = (patch: Record<string, string | number | undefined>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '' || v === (defaults as Record<string, string>)[k]) next.delete(k);
      else next.set(k, String(v));
    }
    if (resetPage && !('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  return { ...state, update };
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

export { useObjectUrl } from './useObjectUrl';
