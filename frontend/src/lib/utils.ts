import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const moneyFmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compactFmt = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

/** NPR amounts use the South Asian grouping (1,00,000). */
export function formatMoney(value: number | null | undefined, currency = 'NPR') {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${currency} ${moneyFmt.format(value)}`;
}

export const formatAmount = (value: number | null | undefined) => (value === null || value === undefined ? '—' : moneyFmt.format(value));
export const formatCompact = (value: number) => compactFmt.format(value);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Format a YYYY-MM-DD (or ISO) date without timezone shifts. */
export function formatDate(value: string | Date | null | undefined, style: 'short' | 'long' = 'short') {
  if (!value) return '—';
  const s = typeof value === 'string' ? value : value.toISOString();
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  if (!y) return '—';
  return style === 'long' ? `${d} ${MONTH_NAMES[m - 1]} ${y}` : `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  return `${formatDate(value)} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export function relativeTime(value: string) {
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} d ago`;
  return formatDate(value);
}

/** Today's date (YYYY-MM-DD) in Nepal time. */
export function todayISO(timezone = 'Asia/Kathmandu') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const titleCase = (s: string | null | undefined) =>
  (s ?? '')
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

export const minutesToHours = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
