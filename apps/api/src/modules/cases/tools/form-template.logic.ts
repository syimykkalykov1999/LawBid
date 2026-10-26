/** Owner 2026-10-20: a document built from fields. The template's body has
 * {{key}} places per language; its fields say what the attorney is asked.
 * Pure functions: the same checks run when the admin saves a template and
 * when the attorney builds a document. */

export type FieldType = 'text' | 'textarea' | 'date' | 'number';
export type Prefill = 'today' | 'attorney_name' | 'client_name' | 'case_title';

export const FIELD_TYPES: readonly FieldType[] = [
  'text',
  'textarea',
  'date',
  'number',
];
export const PREFILLS: readonly Prefill[] = [
  'today',
  'attorney_name',
  'client_name',
  'case_title',
];

export interface TemplateField {
  key: string;
  type: FieldType;
  required: boolean;
  label: Record<string, string>;
  prefill?: Prefill | null;
}

export const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const PLACE_RE = /\{\{\s*([a-z][a-z0-9_]{0,39})\s*\}\}/g;
const LANG_RE = /^[a-z]{2,3}(-[a-z]{2,4})?$/i;

export const VALUE_MAX: Record<FieldType, number> = {
  text: 200,
  textarea: 2000,
  date: 10,
  number: 30,
};
export const BODY_MAX = 20_000;
export const FIELDS_MAX = 40;

/** The keys of the {{places}} in [text], in order of first use. */
export function placeKeys(text: string): string[] {
  const seen: string[] = [];
  for (const m of text.matchAll(PLACE_RE)) {
    if (!seen.includes(m[1])) seen.push(m[1]);
  }
  return seen;
}

const isMap = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** What is wrong with a template the admin is saving (empty = fine). */
export function templateErrors(input: {
  title: unknown;
  body: unknown;
  fields: unknown;
}): string[] {
  const errors: string[] = [];
  const texts = (
    v: unknown,
    name: string,
    max: number,
  ): Record<string, string> => {
    if (!isMap(v)) {
      errors.push(`${name} must be an object of language → text`);
      return {};
    }
    const out: Record<string, string> = {};
    for (const [lang, t] of Object.entries(v)) {
      if (!LANG_RE.test(lang)) errors.push(`${name}: bad language "${lang}"`);
      else if (typeof t !== 'string' || t.length > max) {
        errors.push(`${name}.${lang} must be text up to ${max} characters`);
      } else out[lang] = t;
    }
    return out;
  };
  const title = texts(input.title, 'title', 160);
  const body = texts(input.body, 'body', BODY_MAX);
  if (!title.en?.trim()) errors.push('title.en is required');
  if (!body.en?.trim()) errors.push('body.en is required');

  const fields = input.fields;
  if (!Array.isArray(fields)) {
    errors.push('fields must be a list');
    return errors;
  }
  if (fields.length > FIELDS_MAX) errors.push(`at most ${FIELDS_MAX} fields`);
  const keys = new Set<string>();
  for (const f of fields as unknown[]) {
    if (!isMap(f) || typeof f.key !== 'string' || !KEY_RE.test(f.key)) {
      errors.push('every field needs a key like client_name');
      continue;
    }
    if (keys.has(f.key)) errors.push(`field "${f.key}" is listed twice`);
    keys.add(f.key);
    if (!FIELD_TYPES.includes(f.type as FieldType)) {
      errors.push(
        `field "${f.key}": type must be one of ${FIELD_TYPES.join(', ')}`,
      );
    }
    if (typeof f.required !== 'boolean') {
      errors.push(`field "${f.key}": required must be true or false`);
    }
    if (f.prefill != null && !PREFILLS.includes(f.prefill as Prefill)) {
      errors.push(
        `field "${f.key}": prefill must be one of ${PREFILLS.join(', ')}`,
      );
    }
    const label = texts(f.label, `field "${f.key}" label`, 80);
    if (!label.en?.trim())
      errors.push(`field "${f.key}": label.en is required`);
  }
  for (const [lang, text] of Object.entries(body)) {
    for (const k of placeKeys(text)) {
      if (!keys.has(k))
        errors.push(`body.${lang} uses {{${k}}} but there is no such field`);
    }
  }
  return errors;
}

/** The body with every {{key}} replaced by its value (one pass: a value
 * that itself contains {{x}} stays text). A missing value is empty. */
export function renderBody(
  body: string,
  values: Readonly<Record<string, string>>,
): string {
  return body.replace(PLACE_RE, (_m, key: string) => values[key] ?? '');
}

/** What is wrong with the attorney's answers (empty = fine). */
export function valueErrors(
  fields: readonly TemplateField[],
  values: Readonly<Record<string, unknown>>,
): { key: string; problem: 'required' | 'invalid' | 'too_long' }[] {
  const out: { key: string; problem: 'required' | 'invalid' | 'too_long' }[] =
    [];
  for (const f of fields) {
    const v = values[f.key];
    const text = typeof v === 'string' ? v.trim() : '';
    if (text === '') {
      if (f.required) out.push({ key: f.key, problem: 'required' });
      continue;
    }
    if (text.length > VALUE_MAX[f.type]) {
      out.push({ key: f.key, problem: 'too_long' });
    } else if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      out.push({ key: f.key, problem: 'invalid' });
    } else if (f.type === 'number' && !/^-?\d+([.,]\d+)?$/.test(text)) {
      out.push({ key: f.key, problem: 'invalid' });
    }
  }
  return out;
}
