import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import type { I18nTextsDto } from '../dto/i18n-texts.dto';
import { I18nBundleService } from './i18n-bundle.service';

/** At most this many keys per prefix (the guide has 18). */
const MAX_KEYS = 500;

/**
 * Owner 2026-10-18: «Справочник» texts edited in the admin, per language.
 * A change is an ordinary translation cell with a new bundle version, so
 * phones pick it up on their next bundle sync (the compiled-in text stays
 * the fallback), and it is marked `admin_edited` so the deploy's
 * translations_seed.xlsx import never puts the old text back.
 */
@Injectable()
export class I18nTextsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bundle: I18nBundleService,
  ) {}

  async list(prefix: string): Promise<I18nTextsDto> {
    const [languages, keys] = await Promise.all([
      this.prisma.i18nLanguage.findMany({
        orderBy: { sort: 'asc' },
        select: { code: true, name_native: true },
      }),
      this.prisma.i18nKey.findMany({
        where: { key: { startsWith: prefix } },
        orderBy: { key: 'asc' },
        take: MAX_KEYS,
        select: {
          key: true,
          translations: {
            select: { lang: true, value: true, admin_edited: true },
          },
        },
      }),
    ]);
    return {
      languages: languages.map((l) => ({ code: l.code, name: l.name_native })),
      keys: keys.map((k) => ({
        key: k.key,
        values: Object.fromEntries(
          k.translations.map((t) => [t.lang, t.value]),
        ),
        edited: k.translations.filter((t) => t.admin_edited).map((t) => t.lang),
      })),
    };
  }

  async update(key: string, lang: string, value: string): Promise<void> {
    const version = await withTxRetry(this.prisma, async (tx) => {
      const keyRow = await tx.i18nKey.findUnique({
        where: { key },
        select: { id: true },
      });
      if (!keyRow) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Unknown text key.',
        });
      }
      const language = await tx.i18nLanguage.findUnique({
        where: { code: lang },
        select: { code: true },
      });
      if (!language) {
        throw new BadRequestException({
          code: ErrorCode.I18N_LANGUAGE_NOT_FOUND,
          message: 'Unknown language.',
        });
      }
      const current = await tx.i18nBundleVersion.findUnique({
        where: { lang },
      });
      const next = (current?.version ?? 0) + 1;
      await tx.i18nTranslation.upsert({
        where: { key_id_lang: { key_id: keyRow.id, lang } },
        create: {
          key_id: keyRow.id,
          lang,
          value,
          version: next,
          admin_edited: true,
        },
        update: { value, version: next, admin_edited: true },
      });
      await tx.i18nBundleVersion.upsert({
        where: { lang },
        create: { lang, version: next },
        update: { version: next },
      });
      return next;
    });
    await this.bundle.cacheVersion(lang, version);
  }
}
