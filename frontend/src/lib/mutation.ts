import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError } from './api';

interface Options<TData, TVars> {
  success?: string | ((data: TData) => string);
  invalidate?: QueryKey[];
  onSuccess?: (data: TData, vars: TVars) => void;
  /** Map 422 field errors back onto a react-hook-form form. */
  setError?: UseFormSetError<FieldValues>;
}

/** Mutation with success toast, error toast, cache invalidation and form field errors. */
export function useApiMutation<TData = unknown, TVars = void>(fn: (vars: TVars) => Promise<TData>, opts: Options<TData, TVars> = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (data, vars) => {
      await Promise.all((opts.invalidate ?? []).map((key) => qc.invalidateQueries({ queryKey: key })));
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(data) : opts.success);
      opts.onSuccess?.(data, vars);
    },
    onError: (err) => {
      if (err instanceof ApiError && opts.setError) {
        const fields = err.fieldErrors;
        for (const [path, message] of Object.entries(fields)) opts.setError(path as Path<FieldValues>, { message });
        if (Object.keys(fields).length) {
          toast.error('Some fields need attention');
          return;
        }
      }
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    },
  });
}

/** Turn '' into null/undefined before sending form values to the API. */
export function clean<T extends Record<string, unknown>>(values: T, emptyAs: null | undefined = null): T {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === '' ? emptyAs : v])) as T;
}
