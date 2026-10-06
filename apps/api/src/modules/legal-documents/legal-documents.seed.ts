import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DRAFT_VERSION,
  LEGAL_DOC_TYPE_LIST,
  LEGAL_LOCALES,
} from './legal-documents.constants';

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
    return created;
  }
}
