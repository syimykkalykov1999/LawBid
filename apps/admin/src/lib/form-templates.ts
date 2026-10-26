import type { components } from '@/lib/api/schema';

export type FormTemplate = components['schemas']['AdminFormTemplateDto'];
export type FormField = components['schemas']['FormFieldDto'];
export type FieldType = FormField['type'];
export type Prefill = NonNullable<FormField['prefill']>;

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Строка' },
  { value: 'textarea', label: 'Абзац' },
  { value: 'date', label: 'Дата' },
  { value: 'number', label: 'Число' },
];

export const PREFILLS: { value: Prefill; label: string }[] = [
  { value: 'today', label: 'Сегодняшняя дата' },
  { value: 'attorney_name', label: 'Имя адвоката' },
  { value: 'client_name', label: 'Имя клиента' },
  { value: 'case_title', label: 'Название кейса' },
];

/** Languages the editor offers (the first two are always on screen). */
export const FORM_LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'ru', name: 'Русский' },
  { code: 'es', name: 'Español' },
  { code: 'uk', name: 'Українська' },
  { code: 'zh', name: '中文' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'ko', name: '한국어' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'ar', name: 'العربية' },
  { code: 'fr', name: 'Français' },
  { code: 'pt', name: 'Português' },
  { code: 'pl', name: 'Polski' },
];

/** Same limits as the API (form-template.logic.ts). */
export const SLUG_RE = /^[a-z][a-z0-9-]{1,63}$/;
export const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const PLACE_RE = /\{\{\s*([a-z][a-z0-9_]{0,39})\s*\}\}/g;
export const BODY_MAX = 20_000;
export const FIELDS_MAX = 40;
const TITLE_MAX = 160;
const LABEL_MAX = 80;

export type Texts = Record<string, string>;

/** What the editor holds: every text per language, fields in order. */
export interface FormState {
  slug: string;
  title: Texts;
  description: Texts;
  body: Texts;
  fields: FormField[];
  practiceAreaId: string;
  position: number;
  published: boolean;
}

export const EMPTY_FORM: FormState = {
  slug: '',
  title: { en: '', ru: '' },
  description: {},
  body: { en: '', ru: '' },
  fields: [],
  practiceAreaId: '',
  position: 0,
  published: false,
};

export function formFromTemplate(t: FormTemplate): FormState {
  return {
    slug: t.slug,
    title: { ...t.title },
    description: { ...t.description },
    body: { ...t.body },
    fields: t.fields.map((f) => ({ ...f, label: { ...f.label } })),
    practiceAreaId: t.practiceAreaId ?? '',
    position: t.position,
    published: t.published,
  };
}

/** Language codes in use, en and ru first, then the rest in order. */
export function languagesOf(f: FormState): string[] {
  const all = new Set<string>(['en', 'ru']);
  for (const m of [f.title, f.description, f.body, ...f.fields.map((x) => x.label)]) {
    for (const [l, t] of Object.entries(m)) if (t.trim() !== '') all.add(l);
  }
  return [...all];
}

/** Keys of the {{places}} in [text], in order of first use. */
export function placeKeys(text: string): string[] {
  const seen: string[] = [];
  for (const m of text.matchAll(PLACE_RE)) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}

export interface Mismatch {
  /** {{places}} per language that have no field. */
  missing: { lang: string; key: string }[];
  /** Fields no body uses. */
  unused: string[];
}

/** Placeholders vs fields: what would fail on save and what is dead weight. */
export function mismatch(body: Texts, fields: readonly FormField[]): Mismatch {
  const keys = new Set(fields.map((f) => f.key));
  const used = new Set<string>();
  const missing: Mismatch['missing'] = [];
  for (const [lang, text] of Object.entries(body)) {
    for (const k of placeKeys(text)) {
      used.add(k);
      if (!keys.has(k)) missing.push({ lang, key: k });
    }
  }
  return { missing, unused: fields.map((f) => f.key).filter((k) => k && !used.has(k)) };
}

const nonEmpty = (m: Texts): Texts =>
  Object.fromEntries(Object.entries(m).filter(([, t]) => t.trim() !== ''));

/** The same checks the API runs on save (empty = fine), in Russian. */
export function formErrors(f: FormState, opts: { isNew: boolean }): string[] {
  const e: string[] = [];
  if (opts.isNew && !SLUG_RE.test(f.slug)) {
    e.push('Код: латиница, цифры и дефис, начинается с буквы, 2–64 символа (например power-of-attorney).');
  }
  const title = nonEmpty(f.title);
  const body = nonEmpty(f.body);
  if (!title.en) e.push('Укажите название на английском (вкладка EN).');
  if (!body.en) e.push('Укажите текст документа на английском (вкладка EN).');
  for (const [l, t] of Object.entries(title)) if (t.length > TITLE_MAX) e.push(`Название (${l}) длиннее ${TITLE_MAX} символов.`);
  for (const [l, t] of Object.entries(body)) if (t.length > BODY_MAX) e.push(`Текст (${l}) длиннее ${BODY_MAX} символов.`);
  if (f.fields.length > FIELDS_MAX) e.push(`Не больше ${FIELDS_MAX} полей.`);
  const seen = new Set<string>();
  f.fields.forEach((x, i) => {
    if (!KEY_RE.test(x.key)) {
      e.push(`Поле ${i + 1}: ключ — латиница, цифры и _, начинается с буквы (например client_name).`);
      return;
    }
    if (seen.has(x.key)) e.push(`Поле «${x.key}» указано дважды.`);
    seen.add(x.key);
    const label = nonEmpty(x.label);
    if (!label.en) e.push(`Поле «${x.key}»: нужна подпись на английском.`);
    for (const [l, t] of Object.entries(label)) if (t.length > LABEL_MAX) e.push(`Поле «${x.key}»: подпись (${l}) длиннее ${LABEL_MAX} символов.`);
  });
  for (const m of mismatch(body, f.fields).missing) {
    e.push(`В тексте (${m.lang}) есть {{${m.key}}}, но поля «${m.key}» нет.`);
  }
  if (!Number.isInteger(f.position) || f.position < 0 || f.position > 10_000) e.push('Порядок — целое число от 0 до 10000.');
  return e;
}

/** Body for POST (slug included) or PATCH: empty texts are dropped. */
export function toPayload(f: FormState) {
  return {
    title: nonEmpty(f.title),
    description: nonEmpty(f.description),
    body: nonEmpty(f.body),
    fields: f.fields.map((x) => ({
      key: x.key,
      type: x.type,
      required: x.required,
      label: nonEmpty(x.label),
      prefill: x.prefill ?? null,
    })),
    position: f.position,
    published: f.published,
  };
}

/** The API's own list of problems (details.errors), if it sent one. */
export function serverErrors(details: unknown): string[] {
  if (typeof details !== 'object' || details === null) return [];
  const list = (details as { errors?: unknown }).errors;
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
}

/** A field named like the key typed in the editor's «add» row (client name → client_name). */
export function keyFromLabel(label: string): string {
  const k = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return /^[a-z]/.test(k) ? k : '';
}

/** Languages of a template as short upper-case codes for the list. */
export const languageList = (t: Pick<FormTemplate, 'body'>): string[] =>
  Object.keys(t.body).filter((l) => (t.body[l] ?? '').trim() !== '');
