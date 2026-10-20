import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import type { I18nTextsDto } from '../dto/i18n-texts.dto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TranslationService } from '../../translation/translation.service';
import {
  buildParsedWorkbook,
  parseTranslationsFile,
} from '../xlsx/i18n-workbook.util';
import { I18nBundleService } from './i18n-bundle.service';

/** Parallel Google calls for «Перевести на все языки». */
const TRANSLATE_CONCURRENCY = 6;

/** The built-in texts: the workbook the deploy imports. */
function seedWorkbookPath(): string | null {
  const candidates = [
    join(process.cwd(), 'prisma/seed/translations_seed.xlsx'),
    join(process.cwd(), 'apps/api/prisma/seed/translations_seed.xlsx'),
    join(__dirname, '../../../../prisma/seed/translations_seed.xlsx'),
    join(__dirname, '../../../../../prisma/seed/translations_seed.xlsx'),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

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
    @Optional() private readonly translator?: TranslationService,
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
    await this.saveMany(key, { [lang]: value });
  }

  /**
   * Several languages of one text at once («Перевести на все языки» after
   * the admin confirmed the preview). Each language gets its next bundle
   * version; [adminEdited] false = back to the built-in text.
   */
  async saveMany(
    key: string,
    values: Record<string, string>,
    adminEdited = true,
  ): Promise<void> {
    const langs = Object.keys(values);
    if (langs.length === 0) return;
    const versions = await withTxRetry(this.prisma, async (tx) => {
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
      const known = await tx.i18nLanguage.findMany({
        where: { code: { in: langs } },
        select: { code: true },
      });
      if (known.length !== langs.length) {
        throw new BadRequestException({
          code: ErrorCode.I18N_LANGUAGE_NOT_FOUND,
          message: 'Unknown language.',
        });
      }
      const out = new Map<string, number>();
      for (const lang of langs) {
        const value = values[lang];
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
            admin_edited: adminEdited,
          },
          update: { value, version: next, admin_edited: adminEdited },
        });
        await tx.i18nBundleVersion.upsert({
          where: { lang },
          create: { lang, version: next },
          update: { version: next },
        });
        out.set(lang, next);
      }
      return out;
    });
    for (const [lang, version] of versions) {
      await this.bundle.cacheVersion(lang, version);
    }
  }

  /**
   * «Перевести на все языки»: [text] (the source language's text as the
   * admin edited it) machine-translated into every other language. A
   * preview only — nothing is saved until [saveMany].
   */
  async translatePreview(
    text: string,
    source: string,
  ): Promise<{ values: Record<string, string>; failed: string[] }> {
    if (!this.translator) {
      throw new BadRequestException({
        code: ErrorCode.TRANSLATION_UNAVAILABLE,
        message: 'Translation is not available.',
      });
    }
    const translator = this.translator;
    const targets = (
      await this.prisma.i18nLanguage.findMany({
        orderBy: { sort: 'asc' },
        select: { code: true },
      })
    )
      .map((l) => l.code)
      .filter((c) => c !== source);
    const values: Record<string, string> = {};
    const failed: string[] = [];
    let at = 0;
    const worker = async () => {
      while (at < targets.length) {
        const lang = targets[at++];
        try {
          values[lang] = await translator.translateForAdmin(
            text,
            // Google spells Traditional Chinese zh-TW.
            lang === 'zh-tw' ? 'zh-TW' : lang,
            source,
          );
        } catch {
          failed.push(lang);
        }
      }
    };
    await Promise.all(
      Array.from({ length: TRANSLATE_CONCURRENCY }, () => worker()),
    );
    return { values, failed };
  }

  /** «Сбросить к встроенному тексту»: the text from the deploy's
   * translations file, for [lang] or every language; no longer marked as
   * changed in the admin. */
  async reset(key: string, lang?: string): Promise<void> {
    const path = seedWorkbookPath();
    if (!path) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'The built-in texts file is missing.',
      });
    }
    const { workbook } = buildParsedWorkbook(
      await parseTranslationsFile(readFileSync(path)),
    );
    const row = workbook.rows.find((r) => r.key === key);
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'This text has no built-in version.',
      });
    }
    const values = lang
      ? row.values[lang] === undefined
        ? {}
        : { [lang]: row.values[lang] }
      : row.values;
    await this.saveMany(key, values, false);
  }
}
