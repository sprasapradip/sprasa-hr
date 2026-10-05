import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

/**
 * Reads attendance logs exported from thumb machines:
 * - ZKTeco / eSSL USB download (`1_attlog.dat`, `attlog.txt`): tab separated, no header,
 *   "PIN <tab> 2026-10-01 09:03:12 <tab> state <tab> verify …"
 * - CSV or Excel reports from the vendor software (ZKTime, ZK Attendance Management, eTimeTrack…),
 *   with a header row naming the user-number and time columns.
 */

export interface ParsedPunch {
  deviceUserId: string;
  /** Wall-clock time on the device, held in the UTC fields. */
  punchedAt: Date;
  deviceState?: number | null;
  verifyMode?: number | null;
}

export type DateOrder = 'DMY' | 'MDY';

export interface ParseResult {
  punches: ParsedPunch[];
  skipped: { line: number; reason: string }[];
  /** Set when the file used day/month numbers and we had to decide which came first. */
  dateOrder: DateOrder | null;
}

/** "0012" and "12" are the same user on most machines. */
export function normaliseDeviceUserId(value: string): string {
  const v = value.trim();
  return /^\d+$/.test(v) ? String(Number(v)) : v;
}

const YMD = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(am|pm)?$/i;
const XYZ = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i;

function build(y: number, mo: number, d: number, h: number, mi: number, s: number, ampm?: string): Date | null {
  if (ampm) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ampm.toLowerCase() === 'pm' ? 12 : 0);
  }
  if (y < 100) y += 2000;
  if (h > 23 || mi > 59 || s > 59) return null;
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  // Rejects 31 June, 30 February and the like.
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

/** Parse "2026-10-01 09:03:12", "01/10/2026 9:03 AM" and similar into a wall-clock Date. */
export function parseWallClock(text: string, order: DateOrder = 'DMY'): Date | null {
  const t = text.trim().replace(/\s+/g, ' ');
  let m = YMD.exec(t);
  if (m) return build(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0), m[7]);
  m = XYZ.exec(t);
  if (!m) return null;
  const [a, b] = [+m[1], +m[2]];
  const [d, mo] = order === 'DMY' ? [a, b] : [b, a];
  return build(+m[3], mo, d, +m[4], +m[5], +(m[6] ?? 0), m[7]);
}

/** Guess day/month order from the values: any first number over 12 means day first, and the reverse. */
function detectOrder(values: string[]): DateOrder | null {
  let sawAmbiguous = false;
  for (const v of values) {
    const m = XYZ.exec(v.trim().replace(/\s+/g, ' '));
    if (!m) continue;
    if (+m[1] > 12) return 'DMY';
    if (+m[2] > 12) return 'MDY';
    sawAmbiguous = true;
  }
  return sawAmbiguous ? 'DMY' : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

function cellText(v: unknown): string {
  if (v instanceof Date) {
    const date = `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
    const time = `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
    // Excel stores a time-only cell as a time on 30 Dec 1899.
    if (v.getUTCFullYear() < 1901) return time;
    return time === '00:00:00' ? date : `${date} ${time}`;
  }
  if (v && typeof v === 'object') {
    if ('result' in v) return cellText((v as { result: unknown }).result);
    if ('text' in v) return String((v as { text: unknown }).text);
    if ('richText' in v) return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join('');
  }
  return v === null || v === undefined ? '' : String(v).trim();
}

const ID_HEADER = /^(ac[-\s]?no\.?|user\s*(id|no\.?|number)|userid|pin|enroll(ment)?(\s*(no\.?|number|id))?|emp(loyee)?\s*(no\.?|id|code|number)|badge(\s*no\.?)?|person\s*id|id\s*no\.?|device\s*user\s*id|machine\s*id)$/i;
const DATETIME_HEADER = /^(date\s*\/?\s*time|datetime|time\s*stamp|timestamp|punch\s*time|check\s*time|log\s*time|att(endance)?\s*time|record\s*time|verify\s*time|clock\s*time)$/i;
const DATE_HEADER = /^(date|punch\s*date|log\s*date|att(endance)?\s*date)$/i;
const TIME_HEADER = /^(time|punch|in\/?out\s*time)$/i;

interface Columns {
  id: number;
  dateTime?: number;
  date?: number;
  time?: number;
  state?: number;
  verify?: number;
}

function findHeader(rows: string[][]): { index: number; cols: Columns } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map((c) => c.trim());
    const id = cells.findIndex((c) => ID_HEADER.test(c));
    if (id < 0) continue;
    const dateTime = cells.findIndex((c) => DATETIME_HEADER.test(c));
    const date = cells.findIndex((c) => DATE_HEADER.test(c));
    const time = cells.findIndex((c) => TIME_HEADER.test(c));
    if (dateTime >= 0) return { index: i, cols: { id, dateTime } };
    if (date >= 0 && time >= 0) return { index: i, cols: { id, date, time } };
    // A lone "Time" column usually holds the full date and time.
    if (time >= 0) return { index: i, cols: { id, dateTime: time } };
  }
  return null;
}

/** No header: PIN first, then either a date-time or a date and a time, then the device's state and verify mode. */
function positionalColumns(sample: string[]): Columns {
  const looksLikeDateOnly = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(sample[1]?.trim() ?? '');
  return looksLikeDateOnly ? { id: 0, date: 1, time: 2 } : { id: 0, dateTime: 1, state: 2, verify: 3 };
}

async function readRows(buffer: Buffer, filename: string): Promise<string[][]> {
  if (filename.toLowerCase().endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const values = (row.values as unknown[]).slice(1);
      rows.push(values.map(cellText));
    });
    return rows;
  }
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
  return parse(text, { delimiter, relax_column_count: true, relax_quotes: true, skip_empty_lines: true, trim: true }) as string[][];
}

export async function parsePunchFile(buffer: Buffer, filename: string, order?: DateOrder): Promise<ParseResult> {
  const rows = await readRows(buffer, filename);
  const header = findHeader(rows);
  const start = header ? header.index + 1 : 0;
  const body = rows.slice(start);
  const cols = header?.cols ?? positionalColumns(body[0] ?? []);

  const whenText = (r: string[]) => (cols.dateTime !== undefined ? r[cols.dateTime] ?? '' : `${r[cols.date!] ?? ''} ${r[cols.time!] ?? ''}`).trim();
  const dateOrder = order ?? detectOrder(body.map(whenText));

  const punches: ParsedPunch[] = [];
  const skipped: ParseResult['skipped'] = [];
  const int = (v: string | undefined) => (v !== undefined && /^\d{1,3}$/.test(v.trim()) ? Number(v) : null);

  for (const [i, r] of body.entries()) {
    const line = start + i + 1;
    if (r.every((c) => !c.trim())) continue;
    const rawId = (r[cols.id] ?? '').trim();
    const when = whenText(r);
    if (!rawId) {
      skipped.push({ line, reason: 'No user number' });
      continue;
    }
    if (!/^[\w-]{1,30}$/.test(rawId)) {
      skipped.push({ line, reason: `"${rawId.slice(0, 30)}" is not a user number` });
      continue;
    }
    const punchedAt = parseWallClock(when, dateOrder ?? 'DMY');
    if (!punchedAt) {
      skipped.push({ line, reason: `Could not read the time "${when.slice(0, 40)}"` });
      continue;
    }
    punches.push({ deviceUserId: normaliseDeviceUserId(rawId), punchedAt, deviceState: int(r[cols.state ?? -1]), verifyMode: int(r[cols.verify ?? -1]) });
  }

  return { punches, skipped, dateOrder: dateOrder && body.some((r) => XYZ.test(whenText(r))) ? dateOrder : null };
}

/** One ATTLOG line pushed by a ZKTeco device: "PIN\t2026-10-01 09:03:12\t0\t1\t0\t0\t0". */
export function parseAttLogLine(line: string): ParsedPunch | null {
  const parts = line.split('\t').map((p) => p.trim());
  if (parts.length < 2 || !parts[0]) return null;
  const punchedAt = parseWallClock(parts[1]);
  if (!punchedAt) return null;
  const int = (v?: string) => (v && /^\d{1,3}$/.test(v) ? Number(v) : null);
  return { deviceUserId: normaliseDeviceUserId(parts[0]), punchedAt, deviceState: int(parts[2]), verifyMode: int(parts[3]) };
}
