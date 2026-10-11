import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DRAFT_VERSION,
  LEGAL_DOC_TYPE_LIST,
  LEGAL_LOCALES,
} from './legal-documents.constants';
import { nextVersion } from './legal-documents.logic';

/** The documents the sign-up consent screen links to: they must never be
 * the one-line placeholder, or a new user is asked to accept nothing. */
const CONSENT_DOC_TYPES = ['terms', 'privacy', 'disclaimer'] as const;

/** apps/api/assets/legal: 3 levels up from src/modules/legal-documents,
 * 4 from dist/src/modules/legal-documents. */
export function seedDir(): string | null {
  for (const up of [3, 4]) {
    const dir = join(
      __dirname,
      ...Array<string>(up).fill('..'),
      'assets',
      'legal',
    );
    if (existsSync(dir)) return dir;
  }
  return null;
}

/** The old placeholder the first seed wrote (prisma/seed.ts). */
const isPlaceholder = (md: string | null): boolean =>
  !md || md.includes('PLACEHOLDER');

/**
 * Owner 2026-10-05 (legal documents): the default texts (the substance of
 * the pages on lawbid.dev, English and Russian) are kept as `.md` files in
 * apps/api/assets/legal and put in as DRAFTS on boot, only where a type +
 * language has nothing but the old placeholder (or nothing at all). A
 * draft is never published by itself: the owner reads it (a licensed US
 * attorney reviews it) and publishes it from the admin.
 */
@Injectable()
export class LegalDocumentsSeed implements OnModuleInit {
  private readonly log = new Logger(LegalDocumentsSeed.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seed();
    } catch (e) {
      // Never stop the API because a seed text could not be inserted.
      this.log.warn(`legal document seed skipped: ${String(e)}`);
    }
  }

  async seed(): Promise<number> {
    const dir = seedDir();
    if (!dir) return 0;
    let created = 0;
    for (const type of LEGAL_DOC_TYPE_LIST) {
      for (const locale of LEGAL_LOCALES) {
        const file = join(dir, `${type}.${locale}.md`);
        if (!existsSync(file)) continue;
        const rows = await this.prisma.legalDocument.findMany({
          where: { doc_type: type, locale },
          select: { content_md: true, status: true },
        });
        const real = rows.filter((r) => !isPlaceholder(r.content_md));
        if (real.length > 0) continue;
        if (rows.some((r) => r.status === 'draft')) continue;
        await this.prisma.legalDocument.create({
          data: {
            doc_type: type,
            locale,
            version: DRAFT_VERSION,
            status: 'draft',
            is_current: false,
            content_md: readFileSync(file, 'utf8'),
            change_note:
              'Черновик подготовлен для проверки лицензированным юристом США',
          },
        });
        created += 1;
      }
    }
    if (created > 0) this.log.log(`legal document drafts seeded: ${created}`);
    await this.publishOverPlaceholders();
    return created;
  }

  /**
   * Owner 2026-10-11 (sign-up consent): where the CURRENT text of Terms,
   * Privacy or the disclaimer is still the one-line placeholder, publish
   * the real text over it as a new version (the admin's draft if there is
   * one, else the shipped default) and archive the placeholder. Only
   * placeholders are replaced; a text the owner published is left alone.
   */
  async publishOverPlaceholders(): Promise<number> {
    const dir = seedDir();
    if (!dir) return 0;
    let published = 0;
    for (const type of CONSENT_DOC_TYPES) {
      for (const locale of LEGAL_LOCALES) {
        const current = await this.prisma.legalDocument.findFirst({
          where: { doc_type: type, locale, is_current: true },
        });
        if (!current || !isPlaceholder(current.content_md)) continue;
        const draft = await this.prisma.legalDocument.findFirst({
          where: { doc_type: type, locale, status: 'draft', is_current: false },
        });
        const draftText = isPlaceholder(draft?.content_md ?? null)
          ? null
          : (draft?.content_md ?? null);
        const file = join(dir, `${type}.${locale}.md`);
        const content =
          draftText ?? (existsSync(file) ? readFileSync(file, 'utf8') : null);
        if (!content) continue;
        const versions = await this.prisma.legalDocument.findMany({
          where: { doc_type: type, locale },
          select: { version: true },
        });
        const data = {
          version: nextVersion(
            new Date(),
            versions.map((v) => v.version),
          ),
          content_md: content,
          status: 'published',
          is_current: true,
          published_at: new Date(),
          requires_reacceptance: false,
          change_note:
            'Заглушка заменена нормальным текстом; проверить юристом США',
        };
        await this.prisma.$transaction([
          this.prisma.legalDocument.update({
            where: { id: current.id },
            data: { is_current: false, status: 'archived' },
          }),
          draft && draftText
            ? this.prisma.legalDocument.update({
                where: { id: draft.id },
                data,
              })
            : this.prisma.legalDocument.create({
                data: { ...data, doc_type: type, locale },
              }),
        ]);
        published += 1;
      }
    }
    if (published > 0) {
      this.log.log(`legal placeholders replaced with real text: ${published}`);
    }
    return published;
  }
}
