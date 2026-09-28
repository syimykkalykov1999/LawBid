/**
 * Canonical JSON for the case_journal hash chain (docs/02_DATABASE.md
 * §4.D): object keys sorted (recursively), no whitespace, Dates as ISO-8601
 * UTC, `undefined` object members dropped (as JSON/JSONB drop them). The
 * same row read back from JSONB (which reorders keys) serializes to the
 * same string, so the hash can be recomputed later.
 */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => normalize(v));
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      if (!Number.isFinite(value)) {
        throw new Error('canonicalJson: non-finite number');
      }
      return value;
    case 'object': {
      const out: { [key: string]: JsonValue } = {};
      const obj = value as Record<string, unknown>;
      for (const key of Object.keys(obj).sort()) {
        if (obj[key] !== undefined) out[key] = normalize(obj[key]);
      }
      return out;
    }
    default:
      throw new Error(`canonicalJson: unsupported ${typeof value}`);
  }
}
