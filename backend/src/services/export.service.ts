import type { Response } from 'express';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export interface ExportColumn {
  key: string;
  header: string;
  format?: 'money' | 'date' | 'number' | 'text';
  /** Relative width used for PDF layout and Excel column widths. */
  width?: number;
}

export interface ExportTable {
  title: string;
  subtitle?: string;
  filename: string;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
  /** Optional totals row, keyed like the rows. */
  totals?: Record<string, unknown>;
}

const moneyFmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function cellText(value: unknown, format?: ExportColumn['format']): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (format === 'money') return moneyFmt.format(Number(value));
  if (format === 'date' && typeof value === 'string') return value.slice(0, 10);
  return String(value);
}

/** Neutralise spreadsheet formula injection (cells starting with = + - @). */
function safeCsv(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function toCsv(table: ExportTable): Buffer {
  const header = table.columns.map((c) => c.header);
  const rows = [...table.rows, ...(table.totals ? [table.totals] : [])].map((r) =>
    table.columns.map((c) => {
      const v = r[c.key];
      if (c.format === 'money' || c.format === 'number') return v === null || v === undefined ? '' : String(v);
      return safeCsv(cellText(v, c.format));
    }),
  );
  // BOM so Excel opens UTF-8 (Nepali names) correctly.
  return Buffer.concat([Buffer.from('\uFEFF'), Buffer.from(stringify([header, ...rows]))]);
}

export async function toXlsx(table: ExportTable): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sprasa HR';
  const ws = wb.addWorksheet(table.title.slice(0, 31));
  ws.addRow([table.title]).font = { bold: true, size: 14 };
  if (table.subtitle) ws.addRow([table.subtitle]).font = { color: { argb: 'FF64748B' } };
  ws.addRow([]);
  const headerRow = ws.addRow(table.columns.map((c) => c.header));
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  });
  const push = (r: Record<string, unknown>, bold = false) => {
    const row = ws.addRow(
      table.columns.map((c) => {
        const v = r[c.key];
        if (v === null || v === undefined) return '';
        if (c.format === 'money' || c.format === 'number') return Number(v);
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        return String(v);
      }),
    );
    if (bold) row.font = { bold: true };
  };
  table.rows.forEach((r) => push(r));
  if (table.totals) push(table.totals, true);
  table.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(10, Math.min(40, (c.width ?? 1) * 14));
    if (c.format === 'money') col.numFmt = '#,##0.00';
  });
  ws.views = [{ state: 'frozen', ySplit: headerRow.number }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toPdf(table: ExportTable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const landscape = table.columns.length > 6;
    const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 36, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 72;
    const totalWeight = table.columns.reduce((s, c) => s + (c.width ?? 1), 0);
    const widths = table.columns.map((c) => ((c.width ?? 1) / totalWeight) * pageWidth);
    const fontSize = table.columns.length > 9 ? 7 : 8;

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#0F766E').text(table.title);
    if (table.subtitle) doc.fontSize(9).font('Helvetica').fillColor('#64748B').text(table.subtitle);
    doc.moveDown(0.8);

    const drawRow = (cells: string[], opts: { header?: boolean; bold?: boolean }) => {
      doc.font(opts.header || opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
      const heights = cells.map((t, i) => doc.heightOfString(t, { width: widths[i] - 6 }));
      const h = Math.max(...heights, fontSize) + 6;
      if (doc.y + h > doc.page.height - 50) {
        doc.addPage();
        if (!opts.header) drawRow(table.columns.map((c) => c.header), { header: true });
      }
      const y = doc.y;
      if (opts.header) doc.rect(36, y, pageWidth, h).fill('#0F766E');
      let x = 36;
      cells.forEach((t, i) => {
        const right = table.columns[i].format === 'money' || table.columns[i].format === 'number';
        doc.fillColor(opts.header ? '#FFFFFF' : '#0F172A').text(t, x + 3, y + 3, { width: widths[i] - 6, align: right ? 'right' : 'left' });
        x += widths[i];
      });
      doc.moveTo(36, y + h).lineTo(36 + pageWidth, y + h).strokeColor('#E2E8F0').lineWidth(0.5).stroke();
      doc.y = y + h;
      doc.x = 36;
    };

    drawRow(table.columns.map((c) => c.header), { header: true });
    if (!table.rows.length) doc.font('Helvetica').fontSize(9).fillColor('#64748B').text('No records for the selected filters.', 36, doc.y + 8);
    for (const r of table.rows) drawRow(table.columns.map((c) => cellText(r[c.key], c.format)), {});
    if (table.totals) drawRow(table.columns.map((c) => cellText(table.totals![c.key], c.format)), { bold: true });

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(7).fillColor('#94A3B8')
        .text(`Generated by Sprasa HR on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · Page ${i + 1} of ${range.count}`, 36, doc.page.height - 30, { width: pageWidth, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

export async function sendExport(res: Response, format: ExportFormat, table: ExportTable) {
  const buffer = format === 'csv' ? toCsv(table) : format === 'xlsx' ? await toXlsx(table) : await toPdf(table);
  const safeName = table.filename.replace(/[^\w.-]+/g, '-');
  res.setHeader('Content-Type', CONTENT_TYPES[format]);
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${format}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
}
