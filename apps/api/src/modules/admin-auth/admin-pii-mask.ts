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
export function maskPii(value: unknown, depth = 0): unknown {
  if (depth > 12) return value;
  if (Array.isArray(value)) return value.map((v) => maskPii(v, depth + 1));
  if (!isPlainObject(value)) {
    // Class instances (DTOs) become plain copies so their fields are seen.
    if (
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date)
    ) {
      const ctor = value.constructor?.name;
      if (ctor && ctor !== 'Object' && !isStreamLike(value)) {
        return maskPii({ ...(value as Record<string, unknown>) }, depth + 1);
      }
    }
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const masked = maskField(k, v);
    out[k] = masked !== v ? masked : maskPii(v, depth + 1);
  }
  return out;
}

function isStreamLike(v: unknown): boolean {
  const o = v as { pipe?: unknown; getStream?: unknown };
  return typeof o.pipe === 'function' || typeof o.getStream === 'function';
}
