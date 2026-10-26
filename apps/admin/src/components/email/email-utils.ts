import { ApiError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type EmailVariable = components['schemas']['EmailTemplateVariableDto'];
export type EmailTemplateSummary = components['schemas']['EmailTemplateSummaryDto'];
export type EmailTemplateDetail = components['schemas']['EmailTemplateDetailDto'];
export type EmailKey = EmailTemplateSummary['key'];
export type EmailLocale = 'en' | 'ru';

export const LOCALES: EmailLocale[] = ['en', 'ru'];
export const LOCALE_LABEL: Record<EmailLocale, string> = { en: 'EN', ru: 'RU' };

export const SUBJECT_MAX = 200;
export const TEXT_MAX = 20_000;
export const HTML_MAX = 100_000;

export interface EmailForm {
  subject: string;
  textBody: string;
  htmlBody: string;
  enabled: boolean;
}

export type FieldName = 'subject' | 'textBody' | 'htmlBody';

export const EMPTY_FORM: EmailForm = { subject: '', textBody: '', htmlBody: '', enabled: true };

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The built-in email comes rendered with sample values. To use it as a
 * starting point, put the `{{name}}` placeholders back where the samples
 * are (longest sample first; short samples like "10" only as whole tokens).
 */
export function unsample(text: string, vars: EmailVariable[]): string {
  let out = text;
  const sorted = [...vars].filter((v) => v.sample).sort((a, b) => b.sample.length - a.sample.length);
  for (const v of sorted) {
    const re = new RegExp(`(?<![0-9A-Za-z])${escapeRe(v.sample)}(?![0-9A-Za-z])`, 'g');
    out = out.replace(re, `{{${v.name}}}`);
  }
  return out;
}

/** Inline error per field from a save/preview failure (400 VALIDATION_ERROR). */
export function fieldErrors(e: unknown): { field?: FieldName; text: string } | null {
  if (!(e instanceof ApiError) || e.code !== 'VALIDATION_ERROR') return null;
  const missing = e.details?.missing;
  if (Array.isArray(missing) && missing.length) {
    const vars = missing.map((m) => `{{${String(m)}}}`).join(', ');
    const html = /HTML/.test(e.message);
    return { field: 'textBody', text: `Добавьте ${vars} в текст письма${html ? ' и в HTML' : ''} — без этого письмо бесполезно.` };
  }
  const list = e.details?.validation;
  const raw = Array.isArray(list) ? list.map(String).join('; ') : e.message;
  const field: FieldName | undefined = /subject/i.test(raw)
    ? 'subject'
    : /htmlBody/i.test(raw)
      ? 'htmlBody'
      : /textBody/i.test(raw)
        ? 'textBody'
        : undefined;
  return { field, text: `Проверьте поле: ${raw}` };
}
