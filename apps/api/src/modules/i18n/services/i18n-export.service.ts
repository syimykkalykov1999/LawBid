import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildTranslationsWorkbookBuffer } from '../xlsx/i18n-workbook.util';

/**
 * GET /admin/i18n/export (docs/01_FOUNDATION_AUTH.md §9.3: "выгрузка в
 * xlsx"). Exports every active language (same set /i18n/languages
 * returns, in the same sort order) and every key that has at least one
 * translation — same shape as the import format (§9.2), so the file this
 * produces re-imports unchanged with `mode=dry-run` reporting zero
 * changes.
 */
@Injectable()
export class I18nExportService {
  constructor(private readonly prisma: PrismaService) {}

  async buildWorkbook(): Promise<Buffer> {
    const languages = await this.prisma.i18nLanguage.findMany({
      where: { is_active: true },
      orderBy: { sort: 'asc' },
    });
    const languageCodes = languages.map((l) => l.code);

    const keys = await this.prisma.i18nKey.findMany({
      orderBy: { key: 'asc' },
      include: { translations: true },
    });

    const rows = keys.map((keyRow) => {
      const values: Record<string, string> = {};
      for (const translation of keyRow.translations) {
        if (languageCodes.includes(translation.lang)) {
          values[translation.lang] = translation.value;
        }
      }
      return { key: keyRow.key, values };
    });

    return buildTranslationsWorkbookBuffer(languageCodes, rows);
  }
}
