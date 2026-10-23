import type { ConsentType, LegalDocType } from '@prisma/client';

/** Owner 2026-10-05 (legal documents): every legal text of LawBid, in the
 * order the admin shows them. */
export const LEGAL_DOC_TYPE_LIST = [
  'terms',
  'privacy',
  'attorney_agreement',
  'client_agreement',
  'eula',
  'disclaimer',
  'client_contact_sharing',
  'refund',
  'cookies',
  'third_party_services',
  'partner_terms',
  'dmca_policy',
  // Owner 2026-10-22 (systems checklist §26): accessibility statement.
  'accessibility',
] as const satisfies readonly LegalDocType[];

/** Owner 2026-10-22 (audit #4 §4): the ten most used app languages (the
 * order of i18n_languages). en / ru are written by hand; the others are
 * machine translations of the English text made by
 * scripts/legal-translate.mjs (committed files, reviewed and published
 * from the admin like any draft). A language without its own text gets
 * the English one. */
export const LEGAL_LOCALES = [
  'en',
  'ru',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'nl',
  'pl',
  'uk',
] as const;
export type LegalLocale = (typeof LEGAL_LOCALES)[number];

export const LEGAL_STATUSES = ['draft', 'published', 'archived'] as const;

/** Version string of the one draft per type + locale. */
export const DRAFT_VERSION = 'draft';

/** Document titles (admin list, app, website). */
export const LEGAL_DOC_TITLES: Record<
  LegalDocType,
  { en: string; ru: string } & Partial<Record<LegalLocale, string>>
> = {
  terms: { en: 'Terms of Service', ru: 'Условия использования' },
  privacy: { en: 'Privacy Policy', ru: 'Политика конфиденциальности' },
  attorney_agreement: {
    en: 'Attorney Agreement',
    ru: 'Соглашение с адвокатом',
  },
  client_agreement: { en: 'Client Agreement', ru: 'Соглашение с клиентом' },
  eula: {
    en: 'End User License Agreement',
    ru: 'Лицензионное соглашение (EULA)',
  },
  disclaimer: { en: 'Legal Disclaimer', ru: 'Правовое уведомление' },
  client_contact_sharing: {
    en: 'Client Contact Sharing Consent',
    ru: 'Согласие на передачу контактов клиента',
  },
  refund: { en: 'Refund Policy', ru: 'Политика возвратов' },
  cookies: { en: 'Cookie Policy', ru: 'Политика cookie' },
  third_party_services: {
    en: 'Third-Party Services',
    ru: 'Сторонние сервисы',
  },
  partner_terms: { en: 'Partner Terms', ru: 'Условия для партнёров' },
  dmca_policy: {
    en: 'Copyright (DMCA) Policy',
    ru: 'Политика авторских прав (DMCA)',
  },
  accessibility: {
    en: 'Accessibility Statement',
    ru: 'Заявление о доступности',
  },
};

/** Types a signed-in user can accept (they have a matching consent_type). */
export const ACCEPTABLE_DOC_TYPES: readonly LegalDocType[] = [
  'terms',
  'privacy',
  'disclaimer',
  'client_contact_sharing',
  'attorney_agreement',
  'client_agreement',
  'eula',
];

export function isAcceptableDocType(t: string): t is ConsentType {
  return (ACCEPTABLE_DOC_TYPES as readonly string[]).includes(t);
}

/** Consents given before documents had versions carry no document id; for
 * these types that old consent still counts (the onboarding step always
 * asked for them). The role agreements and the EULA are new: nobody has
 * accepted them yet. */
export const LEGACY_ACCEPTED_TYPES: ReadonlySet<LegalDocType> =
  new Set<LegalDocType>([
    'terms',
    'privacy',
    'disclaimer',
    'client_contact_sharing',
  ]);

/** Documents each role must have accepted (current version). Assistants
 * work inside an attorney's account and accept nothing of their own. */
export function requiredDocTypes(role: string | null): LegalDocType[] {
  if (role === 'attorney') {
    return ['attorney_agreement', 'terms', 'privacy', 'eula'];
  }
  if (role === 'client') {
    return ['client_agreement', 'terms', 'privacy', 'eula'];
  }
  return [];
}

export function titleOf(type: LegalDocType, locale: string): string {
  const t = LEGAL_DOC_TITLES[type];
  return t[locale as LegalLocale] ?? t.en;
}

/** Locale of the user's UI → a document locale (ru or en). */
export function docLocaleOf(
  uiLanguage: string | null | undefined,
): LegalLocale {
  // Owner 2026-10-22: every legal language, by base language (pt-BR → pt).
  const base = (uiLanguage ?? '').split(/[-_]/)[0].toLowerCase();
  return (LEGAL_LOCALES as readonly string[]).includes(base)
    ? (base as LegalLocale)
    : 'en';
}
