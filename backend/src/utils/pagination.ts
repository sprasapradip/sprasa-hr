import { z } from 'zod';

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().trim().max(100).optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationQuery = z.infer<typeof paginationQuery>;

export function paging(q: { page: number; limit: number }) {
  return { skip: (q.page - 1) * q.limit, take: q.limit };
}

export function paginated<T>(data: T[], total: number, q: { page: number; limit: number }) {
  return {
    data,
    pagination: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) },
  };
}

/** Only allow sorting by whitelisted fields to keep queries predictable and indexed. */
export function orderBy<T extends string>(
  sortBy: string | undefined,
  allowed: readonly T[],
  fallback: T,
  order: 'asc' | 'desc',
) {
  const field = (allowed as readonly string[]).includes(sortBy ?? '') ? (sortBy as T) : fallback;
  return { [field]: order } as Record<T, 'asc' | 'desc'>;
}
