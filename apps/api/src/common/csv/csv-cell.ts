/**
 * One CSV cell, safe to open in Excel, Numbers, LibreOffice or Google Sheets
 * (ASVS 5.0 V1.2.10, STAGE2_SECURITY #10). OWASP «CSV Injection», as written:
 *  - a TEXT cell that starts with `=`, `+`, `-`, `@`, Tab (0x09) or Carriage
 *    Return (0x0D) gets a leading single quote, so a spreadsheet shows it as
 *    text instead of running it (`=HYPERLINK("http://x")` →
 *    `'=HYPERLINK("http://x")`);
 *  - the cell is quoted per RFC 4180 when it holds `"`, `,`, CR or LF, and
 *    every inner `"` is doubled.
 * Numbers, booleans and bigints come from our own code, never from user text,
 * and are written as they are (a negative amount stays a number). A Date is
 * ISO 8601. Anything else is JSON, guarded the same way.
 *
 * One rule for every export (the user's payments, the admin's leads,
 * commissions, content, ads): before 25.11 each had its own copy and the
 * payments export only quoted.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

function guard(s: string): string {
  return FORMULA_START.test(s) ? `'${s}` : s;
}

function text(v: unknown): string {
  if (typeof v === 'string') return guard(v);
  if (typeof v === 'number') return Number.isFinite(v) ? `${v}` : '';
  if (typeof v === 'boolean') return `${v}`;
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (v === null || v === undefined) return '';
  return guard(JSON.stringify(v));
}

export function csvCell(v: unknown): string {
  const s = text(v);
  return NEEDS_QUOTES.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The same rule, the cell always in quotes (exports whose readers expect
 * every text column quoted). */
export function csvQuoted(v: unknown): string {
  return `"${text(v).replace(/"/g, '""')}"`;
}

/** One CSV line of [cells], no line ending. */
export function csvRow(cells: readonly unknown[]): string {
  return cells.map(csvCell).join(',');
}
