export { titleCase, todayISO } from '@/lib/utils';

export const fullNameOf = (e: { firstName: string; middleName?: string | null; lastName: string }) => [e.firstName, e.middleName, e.lastName].filter(Boolean).join(' ');
