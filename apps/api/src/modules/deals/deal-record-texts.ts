import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { SnapshotTexts } from './deal-record.snapshot';

/**
 * Deal record 2026-10-27: the admin-editable texts. They are ordinary i18n
 * keys (admin «Запись о сделке» edits them through /admin/i18n/texts, with
 * «reset to default» = the seed workbook), so the apps get the three consent
 * lines in every language from the usual bundle, and the two PDF texts are
 * read here. A sealed record keeps the English texts it was signed with
 * inside its snapshot (the hashed record). Owner 2026-11-08 (v2): the PDF
 * also prints every sentence and heading in each signer's app language
 * (`local`), and the three consent lines are stored with each signature as
 * they were shown (`consentsFor`).
 */
export const DEAL_RECORD_TEXT_KEYS = {
  pdfTitle: 'deal_record.pdf.title',
  pdfNotContract: 'deal_record.pdf.not_contract',
  pdfFooter: 'deal_record.pdf.footer',
  // R-392 (owner 2026-11-04): the full disclaimer block at the end of the
  // document (no party, no payments in the app, agreements kept apart).
  pdfTerms: 'deal_record.pdf.terms',
  consentNotContract: 'deal_record.consent.not_contract',
  consentPlatform: 'deal_record.consent.platform',
  consentAccurate: 'deal_record.consent.accurate',
} as const;

/** v2 (owner 2026-11-08): the PDF's headings, translated like any text. */
export const DEAL_RECORD_LABEL_KEYS = {
  case: 'deal_record.pdf.label.case',
  client: 'deal_record.pdf.label.client',
  attorney: 'deal_record.pdf.label.attorney',
  paymentTerms: 'deal_record.pdf.label.payment_terms',
  accepted: 'deal_record.pdf.label.accepted',
  recordCode: 'deal_record.pdf.label.record_code',
  history: 'deal_record.pdf.label.history',
  signatures: 'deal_record.pdf.label.signatures',
  important: 'deal_record.pdf.label.important',
  confirmed: 'deal_record.pdf.label.confirmed',
  device: 'deal_record.pdf.label.device',
  verifiedBy: 'deal_record.pdf.label.verified_by',
  phone: 'deal_record.pdf.label.phone',
  email: 'deal_record.pdf.label.email',
  scan: 'deal_record.pdf.label.scan',
  notSigned: 'deal_record.pdf.label.not_signed',
} as const;
export type DealRecordLabel = keyof typeof DEAL_RECORD_LABEL_KEYS;

/** Built-in English headings (the seed has every language). */
export const DEAL_RECORD_DEFAULT_LABELS: Record<DealRecordLabel, string> = {
  case: 'Case',
  client: 'Client',
  attorney: 'Attorney',
  paymentTerms: 'Payment terms',
  accepted: 'Accepted',
  recordCode: 'Record code',
  history: 'Offer history',
  signatures: 'Signatures',
  important: 'Important',
  confirmed: 'Confirmed before signing',
  device: 'Device',
  verifiedBy: 'Sign-in verified by',
  phone: 'Phone',
  email: 'E-mail',
  scan: 'Scan to check this file (SHA-256)',
  notSigned: 'Not signed yet',
};

/** The three consent lines, in the order the app shows them. */
export const DEAL_RECORD_CONSENT_KEYS = [
  DEAL_RECORD_TEXT_KEYS.consentNotContract,
  DEAL_RECORD_TEXT_KEYS.consentPlatform,
  DEAL_RECORD_TEXT_KEYS.consentAccurate,
] as const;

/** One consent line as the signer saw it above «Confirm». */
export interface SignedConsent {
  key: string;
  en: string;
  /** The signer's language; null when it is English or not translated. */
  local: string | null;
}

/** Everything the PDF prints in one non-English language. A text with no
 * translation is null and simply not printed (never invented). */
export interface DealRecordLocalTexts {
  lang: string;
  title: string | null;
  notContract: string | null;
  terms: string | null;
  footer: string | null;
  labels: Partial<Record<DealRecordLabel, string>>;
}

/** `ru`, `zh-tw` … from a profile value; null for English / nothing. */
export function localLang(lang: string | null | undefined): string | null {
  const l = lang?.trim().toLowerCase() ?? '';
  return l === '' || l === 'en' || l.startsWith('en-') ? null : l;
}

/** Built-in English texts (owner-approved wording, 2026-10-27). */
export const DEAL_RECORD_DEFAULT_TEXTS = {
  [DEAL_RECORD_TEXT_KEYS.pdfTitle]: 'Deal record — LawBid',
  [DEAL_RECORD_TEXT_KEYS.pdfNotContract]:
    'This is not a contract. The attorney and the client conclude their legal-services agreement separately. This document only records how they agreed inside the LawBid app.',
  [DEAL_RECORD_TEXT_KEYS.pdfFooter]:
    'LawBid is a listing board: clients post cases, attorneys make offers. LawBid is not a party to your agreement, is not an intermediary, does not handle or take any part of any payment or fee, and is not responsible for the result. This document only records how you agreed in the app, on the dates shown.',
  [DEAL_RECORD_TEXT_KEYS.pdfTerms]:
    'LawBid is not a party to the agreement between the client and the attorney and is not an intermediary. LawBid does not accept, hold or transfer any payment, and no payment for legal services is made inside the LawBid app. The fee agreement and the legal-services agreement are made directly between the client and the attorney, separately from this case and from the app. Any question or dispute about the services, the fee or a payment is between the client and the attorney and is governed by the law that applies to their agreement.',
  [DEAL_RECORD_TEXT_KEYS.consentNotContract]: 'This is not a contract',
  [DEAL_RECORD_TEXT_KEYS.consentPlatform]:
    'The platform is not a party and does not take part in payment',
  [DEAL_RECORD_TEXT_KEYS.consentAccurate]:
    'By signing I confirm this record of the negotiation is accurate',
} as const;

/** Words the document must never contain (research §8.3). */
export const FORBIDDEN_WORDS = [
  'certif',
  'notariz',
  'attest',
  'endors',
  'recommend',
  'guarante',
  'witness',
] as const;

@Injectable()
export class DealRecordTexts {
  constructor(private readonly prisma: PrismaService) {}

  /** The English PDF texts and the highest version among them. */
  async pdf(): Promise<SnapshotTexts & { title: string }> {
    const keys = [
      DEAL_RECORD_TEXT_KEYS.pdfTitle,
      DEAL_RECORD_TEXT_KEYS.pdfNotContract,
      DEAL_RECORD_TEXT_KEYS.pdfFooter,
      DEAL_RECORD_TEXT_KEYS.pdfTerms,
    ];
    const rows = await this.prisma.i18nTranslation.findMany({
      where: { lang: 'en', i18n_key: { key: { in: keys } } },
      select: {
        value: true,
        version: true,
        i18n_key: { select: { key: true } },
      },
    });
    const byKey = new Map(rows.map((r) => [r.i18n_key.key, r]));
    const pick = (key: keyof typeof DEAL_RECORD_DEFAULT_TEXTS): string => {
      const v = byKey.get(key)?.value?.trim();
      return v && v !== '' ? v : DEAL_RECORD_DEFAULT_TEXTS[key];
    };
    return {
      title: pick(DEAL_RECORD_TEXT_KEYS.pdfTitle),
      notContract: pick(DEAL_RECORD_TEXT_KEYS.pdfNotContract),
      footer: pick(DEAL_RECORD_TEXT_KEYS.pdfFooter),
      terms: pick(DEAL_RECORD_TEXT_KEYS.pdfTerms),
      textVersion: Math.max(0, ...rows.map((r) => r.version)),
    };
  }

  /** The English headings (admin-editable like every text). */
  async labels(): Promise<Record<DealRecordLabel, string>> {
    const rows = await this.rows(['en'], Object.values(DEAL_RECORD_LABEL_KEYS));
    const out = { ...DEAL_RECORD_DEFAULT_LABELS };
    for (const [name, key] of Object.entries(DEAL_RECORD_LABEL_KEYS)) {
      const v = rows.get(`en|${key}`);
      if (v) out[name as DealRecordLabel] = v;
    }
    return out;
  }

  /** The PDF texts in each of `langs` (English and blanks are skipped). */
  async local(
    langs: readonly (string | null | undefined)[],
  ): Promise<Record<string, DealRecordLocalTexts>> {
    const wanted = [
      ...new Set(langs.map(localLang).filter((l): l is string => !!l)),
    ];
    if (wanted.length === 0) return {};
    const keys = [
      DEAL_RECORD_TEXT_KEYS.pdfTitle,
      DEAL_RECORD_TEXT_KEYS.pdfNotContract,
      DEAL_RECORD_TEXT_KEYS.pdfFooter,
      DEAL_RECORD_TEXT_KEYS.pdfTerms,
      ...Object.values(DEAL_RECORD_LABEL_KEYS),
    ];
    const rows = await this.rows(wanted, keys);
    const out: Record<string, DealRecordLocalTexts> = {};
    for (const lang of wanted) {
      const get = (key: string) => rows.get(`${lang}|${key}`) ?? null;
      const labels: Partial<Record<DealRecordLabel, string>> = {};
      for (const [name, key] of Object.entries(DEAL_RECORD_LABEL_KEYS)) {
        const v = get(key);
        if (v) labels[name as DealRecordLabel] = v;
      }
      out[lang] = {
        lang,
        title: get(DEAL_RECORD_TEXT_KEYS.pdfTitle),
        notContract: get(DEAL_RECORD_TEXT_KEYS.pdfNotContract),
        terms: get(DEAL_RECORD_TEXT_KEYS.pdfTerms),
        footer: get(DEAL_RECORD_TEXT_KEYS.pdfFooter),
        labels,
      };
    }
    return out;
  }

  /** The three consent lines in English and `lang`, as shown at signing. */
  async consentsFor(lang: string | null | undefined): Promise<SignedConsent[]> {
    const local = localLang(lang);
    const rows = await this.rows(local ? ['en', local] : ['en'], [
      ...DEAL_RECORD_CONSENT_KEYS,
    ]);
    return DEAL_RECORD_CONSENT_KEYS.map((key) => ({
      key,
      en: rows.get(`en|${key}`) ?? DEAL_RECORD_DEFAULT_TEXTS[key],
      local: local ? (rows.get(`${local}|${key}`) ?? null) : null,
    }));
  }

  /** `lang|key` → trimmed non-empty value. */
  private async rows(
    langs: string[],
    keys: string[],
  ): Promise<Map<string, string>> {
    const rows = await this.prisma.i18nTranslation.findMany({
      where: { lang: { in: langs }, i18n_key: { key: { in: keys } } },
      select: { lang: true, value: true, i18n_key: { select: { key: true } } },
    });
    const out = new Map<string, string>();
    for (const r of rows) {
      const v = r.value?.trim();
      if (v) out.set(`${r.lang}|${r.i18n_key.key}`, v);
    }
    return out;
  }
}
