import {
  LEAD_KINDS,
  normalizeEmail,
  normalizePhone,
  normalizeState,
  type LeadKind,
} from './outreach.settings';

/** One lead as the import understands it (before de-duplication). */
export interface ParsedLead {
  row: number;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  stateCode: string | null;
  city: string | null;
  practice: string | null;
  phone: string | null;
  email: string | null;
  kind: LeadKind | null;
  note: string | null;
}

export interface CsvParseResult {
  leads: ParsedLead[];
  /** Rows without an email or a phone: nothing to reach them by. */
  skipped: { row: number; reason: string }[];
  columns: string[];
}

export const MAX_IMPORT_ROWS = 5000;

/** RFC 4180 with CRLF/LF, quoted fields and "" escapes; no dependency. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',' || ch === ';' || ch === '\t') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** Header aliases (English and Russian, Apollo/Lusha/HubSpot exports). */
const COLUMN_ALIASES: Record<string, readonly string[]> = {
  firstName: [
    'first_name',
    'first name',
    'firstname',
    'first',
    'имя',
    'given name',
  ],
  lastName: [
    'last_name',
    'last name',
    'lastname',
    'last',
    'фамилия',
    'surname',
    'family name',
  ],
  name: [
    'name',
    'full name',
    'full_name',
    'contact',
    'фио',
    'attorney',
    'attorney name',
  ],
  company: [
    'company',
    'company name',
    'firm',
    'law firm',
    'organization',
    'компания',
    'фирма',
    'company_name',
  ],
  state: ['state', 'state code', 'штат', 'region', 'province'],
  city: ['city', 'город', 'town'],
  practice: [
    'practice',
    'practice area',
    'practice_area',
    'specialty',
    'title',
    'практика',
    'специализация',
  ],
  phone: [
    'phone',
    'phone number',
    'phone_number',
    'mobile',
    'mobile phone',
    'work phone',
    'direct phone',
    'телефон',
    'tel',
  ],
  email: [
    'email',
    'e-mail',
    'email address',
    'work email',
    'почта',
    'email_address',
  ],
  kind: ['kind', 'type', 'role', 'тип', 'роль'],
  note: ['note', 'notes', 'comment', 'comments', 'заметка', 'примечание'],
};

function columnIndex(headers: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => {
    const key = h.trim().toLowerCase().replace(/\s+/g, ' ');
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (idx[field] === undefined && aliases.includes(key)) idx[field] = i;
    }
  });
  return idx;
}

const clean = (v: string | undefined, max: number): string | null => {
  const s = (v ?? '').trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, max) : null;
};

function kindOf(v: string | undefined, fallback: LeadKind): LeadKind {
  const s = (v ?? '').trim().toLowerCase();
  if (!s) return fallback;
  if (['attorney', 'lawyer', 'адвокат', 'юрист'].includes(s)) return 'attorney';
  if (['client', 'клиент', 'person', 'lead'].includes(s)) return 'client';
  return (LEAD_KINDS as readonly string[]).includes(s)
    ? (s as LeadKind)
    : fallback;
}

/**
 * Leads from a CSV export. The first row is the header; a row needs an
 * email or a phone to be a lead. `defaultKind` applies when the file has
 * no type column.
 */
export function leadsFromCsv(
  text: string,
  defaultKind: LeadKind,
): CsvParseResult {
  const rows = parseCsv(text);
  if (rows.length < 2)
    return { leads: [], skipped: [], columns: rows[0] ?? [] };
  const headers = rows[0];
  const idx = columnIndex(headers);
  if (idx.email === undefined && idx.phone === undefined) {
    throw new Error('no_contact_column');
  }
  const leads: ParsedLead[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const body = rows.slice(1, MAX_IMPORT_ROWS + 1);
  body.forEach((cells, i) => {
    const row = i + 2;
    const at = (field: string) =>
      idx[field] === undefined ? undefined : cells[idx[field]];
    let firstName = clean(at('firstName'), 80);
    let lastName = clean(at('lastName'), 80);
    if (!firstName && !lastName) {
      const full = clean(at('name'), 160);
      if (full) {
        const parts = full.split(' ');
        firstName = parts.shift() ?? null;
        lastName = parts.join(' ') || null;
      }
    }
    const email = normalizeEmail(at('email'));
    const phone = normalizePhone(at('phone'));
    if (!email && !phone) {
      skipped.push({ row, reason: 'no_contact' });
      return;
    }
    leads.push({
      row,
      firstName,
      lastName,
      company: clean(at('company'), 160),
      stateCode: normalizeState(at('state')),
      city: clean(at('city'), 80),
      practice: clean(at('practice'), 80),
      phone,
      email,
      kind: kindOf(at('kind'), defaultKind),
      note: clean(at('note'), 2000),
    });
  });
  return { leads, skipped, columns: headers.map((h) => h.trim()) };
}
