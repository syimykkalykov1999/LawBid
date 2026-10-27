/**
 * Owner 2026-10-16: an admin with the «без персональных данных» flag (an
 * accountant) works with the numbers, not with people. Every response that
 * reaches them has the personal fields masked by key, whatever the endpoint:
 * phone and email become partial hints, names become initials.
 */

const PHONE_KEYS = new Set([
  'phone',
  'phonee164',
  'phonenumber',
  'contactphone',
  'mobile',
  'newphone',
]);
const EMAIL_KEYS = new Set([
  'email',
  'contactemail',
  'useremail',
  'clientemail',
  'attorneyemail',
  'recipientemail',
]);
const NAME_KEYS = new Set([
  'firstname',
  'lastname',
  'displayname',
  'fullname',
  'clientname',
  'attorneyname',
  'holdername',
  'cardholder',
]);

const norm = (key: string): string => key.replace(/[_\-\s]/g, '').toLowerCase();

export function maskPhone(v: string): string {
  const digits = v.replace(/\D/g, '');
  return digits.length < 4 ? '••••' : `••••${digits.slice(-2)}`;
}

export function maskEmail(v: string): string {
  const at = v.indexOf('@');
  if (at < 1) return '•••';
  return `${v[0]}•••@•••`;
}

/** «John Smith» → «J. S.» */
export function maskName(v: string): string {
  const parts = v.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return v;
  return parts.map((p) => `${[...p][0].toUpperCase()}.`).join(' ');
}

// Staff package T11 (plan C4): the mass-work workspace sees a PARTIAL mask —
// enough to tell two people apart, not enough to copy a contact out. The
// full value comes only from `POST admin/pii/reveal` (audited, 20 a day).
const DOC_KEYS = new Set([
  'barnumber',
  'licensenumber',
  'documentnumber',
  'docnumber',
  'passportnumber',
  'idnumber',
]);
/** Payment fields are never given to the mass-work workspace. */
const PAYMENT_KEYS = new Set([
  'iban',
  'cardnumber',
  'pan',
  'accountnumber',
  'bankaccountnumber',
  'routingnumber',
  'cardlast4',
]);

/** `+14155552680` → `+1 *** ** 80` (the dial code is 1 digit for 1 and 7, else 2). */
export function maskPhonePartial(v: string): string {
  const digits = v.replace(/\D/g, '');
  if (digits.length < 6) return '*** **';
  const cc = digits[0] === '1' || digits[0] === '7' ? 1 : 2;
  return `+${digits.slice(0, cc)} *** ** ${digits.slice(-2)}`;
}

/** `sofia@example.com` → `s***@example.com` */
export function maskEmailPartial(v: string): string {
  const at = v.indexOf('@');
  if (at < 1) return '***';
  return `${[...v][0]}***${v.slice(at)}`;
}

/** `NY1234567` → `*****4567` (the last four characters stay). */
export function maskDocPartial(v: string): string {
  const t = v.trim();
  return t.length <= 4 ? '***' : `*****${t.slice(-4)}`;
}

/** What a walker does with one field: keep it, replace it, or drop the key. */
const DROP = Symbol('drop');
type FieldMasker = (key: string, value: unknown) => unknown;

function partialField(key: string, value: unknown): unknown {
  const k = norm(key);
  if (PAYMENT_KEYS.has(k)) return DROP;
  if (typeof value !== 'string' || value === '') return value;
  if (PHONE_KEYS.has(k)) return maskPhonePartial(value);
  if (EMAIL_KEYS.has(k)) return maskEmailPartial(value);
  if (DOC_KEYS.has(k)) return maskDocPartial(value);
  return value;
}

function maskField(key: string, value: unknown): unknown {
  if (typeof value !== 'string' || value === '') return value;
  const k = norm(key);
  if (PHONE_KEYS.has(k)) return maskPhone(value);
  if (EMAIL_KEYS.has(k)) return maskEmail(value);
  if (NAME_KEYS.has(k)) return maskName(value);
  return value;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

/** A copy of [value] with the personal fields masked (any depth). */
export function maskPii(value: unknown): unknown {
  return walk(value, maskField, 0);
}

/** Staff package T11: the partial mask of the mass-work workspace —
 * phone, e-mail and document numbers shortened, payment fields removed.
 * Names stay (a worker answers a person by name). */
export function maskPiiPartial(value: unknown): unknown {
  return walk(value, partialField, 0);
}

function walk(value: unknown, field: FieldMasker, depth: number): unknown {
  if (depth > 12) return value;
  if (Array.isArray(value)) return value.map((v) => walk(v, field, depth + 1));
  if (!isPlainObject(value)) {
    // Class instances (DTOs) become plain copies so their fields are seen.
    if (
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date)
    ) {
      const ctor = value.constructor?.name;
      if (ctor && ctor !== 'Object' && !isStreamLike(value)) {
        return walk(
          { ...(value as Record<string, unknown>) },
          field,
          depth + 1,
        );
      }
    }
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const masked = field(k, v);
    if (masked === DROP) continue;
    out[k] = masked !== v ? masked : walk(v, field, depth + 1);
  }
  return out;
}

function isStreamLike(v: unknown): boolean {
  const o = v as { pipe?: unknown; getStream?: unknown };
  return typeof o.pipe === 'function' || typeof o.getStream === 'function';
}
