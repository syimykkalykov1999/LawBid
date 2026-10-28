import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { SnapshotTexts } from './deal-record.snapshot';

/**
 * Deal record 2026-10-27: the admin-editable texts. They are ordinary i18n
 * keys (admin «Запись о сделке» edits them through /admin/i18n/texts, with
 * «reset to default» = the seed workbook), so the apps get the three consent
 * lines in every language from the usual bundle, and the two PDF texts are
 * read here (English only — the document is always English). A sealed
 * record keeps the texts it was signed with inside its snapshot.
 */
export const DEAL_RECORD_TEXT_KEYS = {
  pdfTitle: 'deal_record.pdf.title',
  pdfNotContract: 'deal_record.pdf.not_contract',
  pdfFooter: 'deal_record.pdf.footer',
  consentNotContract: 'deal_record.consent.not_contract',
  consentPlatform: 'deal_record.consent.platform',
  consentAccurate: 'deal_record.consent.accurate',
} as const;

/** Built-in English texts (owner-approved wording, 2026-10-27). */
export const DEAL_RECORD_DEFAULT_TEXTS = {
  [DEAL_RECORD_TEXT_KEYS.pdfTitle]: 'Deal record — LawBid',
  [DEAL_RECORD_TEXT_KEYS.pdfNotContract]:
    'This is not a contract. The attorney and the client conclude their legal-services agreement separately. This document only records how they agreed inside the LawBid app.',
  [DEAL_RECORD_TEXT_KEYS.pdfFooter]:
    'LawBid is a listing board: clients post cases, attorneys make offers. LawBid is not a party to your agreement, is not an intermediary, does not handle or take any part of any payment or fee, and is not responsible for the result. This document only records how you agreed in the app, on the dates shown.',
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
      textVersion: Math.max(0, ...rows.map((r) => r.version)),
    };
  }
}
