import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { nativeNameForLanguage } from '../language-names';
import {
  buildParsedWorkbook,
  parseTranslationsFile,
  type ImportValidationError,
} from '../xlsx/i18n-workbook.util';
import { I18nBundleService } from './i18n-bundle.service';
import type { I18nImportMode } from '../dto/import-query.dto';

export interface I18nChangedEntry {
  key: string;
  lang: string;
}

export interface I18nImportReport {
  mode: I18nImportMode;
  valid: boolean;
  applied: boolean;
  newLanguages: string[];
  newKeys: string[];
  changedKeys: I18nChangedEntry[];
  unchangedCount: number;
  errors: ImportValidationError[];
}

/**
 * POST /admin/i18n/import (docs/01_FOUNDATION_AUTH.md §9.3): parses +
 * validates an uploaded xlsx/csv file (§9.2 format), diffs it against
 * the current DB, and — in `apply` mode only, and only when validation
 * found zero errors — writes the changes. `dry-run` (the default, see
 * I18nImportQueryDto) never writes anything, ever, including when
 * validation fails; it exists specifically so an admin can see the
 * report before committing to anything.
 */
@Injectable()
export class I18nImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bundle: I18nBundleService,
  ) {}

  async run(
    fileBuffer: Buffer,
    mode: I18nImportMode,
  ): Promise<I18nImportReport> {
    const grid = await this.safeParse(fileBuffer);
    if ('errors' in grid) {
      return this.errorReport(mode, grid.errors);
    }

    const { workbook, errors } = buildParsedWorkbook(grid.grid);

    if (errors.length > 0) {
      if (mode === 'apply') {
        throw new BadRequestException({
          code: ErrorCode.I18N_IMPORT_INVALID,
          message: 'Import validation failed — nothing was applied.',
          details: { errors },
        });
      }
      return this.errorReport(mode, errors);
    }

    const existingLanguages = await this.prisma.i18nLanguage.findMany();
    const existingCodes = new Set(existingLanguages.map((l) => l.code));
    const newLanguages = workbook.languageCodes.filter(
      (code) => !existingCodes.has(code),
    );

    const rowKeys = workbook.rows.map((row) => row.key);
    const existingKeyRows =
      rowKeys.length > 0
        ? await this.prisma.i18nKey.findMany({
            where: { key: { in: rowKeys } },
            include: { translations: true },
          })
        : [];
    const existingByKey = new Map(existingKeyRows.map((row) => [row.key, row]));

    const newKeys: string[] = [];
    const changedKeys: I18nChangedEntry[] = [];
    const affectedLangs = new Set<string>();
    let unchangedCount = 0;

    for (const row of workbook.rows) {
      const existing = existingByKey.get(row.key);
      if (!existing) {
        newKeys.push(row.key);
        for (const lang of Object.keys(row.values)) {
          changedKeys.push({ key: row.key, lang });
          affectedLangs.add(lang);
        }
        continue;
      }
      const existingValues = new Map(
        existing.translations.map((t) => [t.lang, t.value]),
      );
      for (const [lang, value] of Object.entries(row.values)) {
        if (existingValues.get(lang) !== value) {
          changedKeys.push({ key: row.key, lang });
          affectedLangs.add(lang);
        } else {
          unchangedCount += 1;
        }
      }
    }

    const report: I18nImportReport = {
      mode,
      valid: true,
      applied: false,
      newLanguages,
      newKeys,
      changedKeys,
      unchangedCount,
      errors: [],
    };

    if (mode === 'dry-run') return report;

    await this.apply(
      workbook,
      newLanguages,
      changedKeys,
      affectedLangs,
      existingLanguages,
    );
    report.applied = true;
    return report;
  }

  private async safeParse(
    fileBuffer: Buffer,
  ): Promise<{ grid: string[][] } | { errors: ImportValidationError[] }> {
    try {
      const grid = await parseTranslationsFile(fileBuffer);
      return { grid };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        errors: [
          { message: `Could not parse file as .xlsx or CSV: ${message}` },
        ],
      };
    }
  }

  private errorReport(
    mode: I18nImportMode,
    errors: ImportValidationError[],
  ): I18nImportReport {
    return {
      mode,
      valid: false,
      applied: false,
      newLanguages: [],
      newKeys: [],
      changedKeys: [],
      unchangedCount: 0,
      errors,
    };
  }

  /**
   * All writes happen in one withTxRetry transaction (.cursorrules:
   * "Транзакции с несколькими записями только через withTxRetry()").
   * Scale note: this issues roughly one query per changed (key, lang)
   * pair rather than a single batched statement — acceptable for an
   * admin-driven, infrequent import of a translation file sized like
   * translations_seed.xlsx (hundreds of keys, not tens of thousands);
   * revisit with batched raw SQL if a future file gets much larger.
   */
  private async apply(
    workbook: {
      languageCodes: string[];
      rows: { key: string; values: Record<string, string> }[];
    },
    newLanguages: string[],
    changedKeys: I18nChangedEntry[],
    affectedLangs: Set<string>,
    existingLanguages: { code: string; sort: number }[],
  ): Promise<void> {
    const rowByKey = new Map(workbook.rows.map((row) => [row.key, row]));
    const versionByLang = new Map<string, number>();

    await withTxRetry(this.prisma, async (tx) => {
      let sortCursor =
        existingLanguages.reduce((max, l) => Math.max(max, l.sort), -1) + 1;
      for (const code of newLanguages) {
        await tx.i18nLanguage.create({
          data: {
            code,
            name_native: nativeNameForLanguage(code),
            is_active: true,
            is_rtl: false,
            sort: sortCursor++,
          },
        });
      }

      for (const lang of affectedLangs) {
        const bundleVersion = await tx.i18nBundleVersion.findUnique({
          where: { lang },
        });
        versionByLang.set(lang, (bundleVersion?.version ?? 0) + 1);
      }

      const keyIdByKey = new Map<string, string>();
      const changedKeySet = new Set(changedKeys.map((c) => c.key));
      for (const key of changedKeySet) {
        const keyRow = await tx.i18nKey.upsert({
          where: { key },
          create: { key },
          update: {},
        });
        keyIdByKey.set(key, keyRow.id);
      }

      for (const { key, lang } of changedKeys) {
        const value = rowByKey.get(key)?.values[lang];
        const keyId = keyIdByKey.get(key);
        const version = versionByLang.get(lang);
        if (
          value === undefined ||
          keyId === undefined ||
          version === undefined
        ) {
          // Unreachable given how changedKeys/rowByKey/versionByLang are
          // built above from the same workbook — guarded rather than
          // asserted so a future refactor that breaks the invariant
          // fails loudly instead of writing a translation with an
          // undefined value.
          throw new Error(
            `i18n import: inconsistent state for key "${key}" lang "${lang}"`,
          );
        }
        await tx.i18nTranslation.upsert({
          where: { key_id_lang: { key_id: keyId, lang } },
          create: { key_id: keyId, lang, value, version },
          update: { value, version },
        });
      }

      for (const [lang, version] of versionByLang) {
        await tx.i18nBundleVersion.upsert({
          where: { lang },
          create: { lang, version },
          update: { version },
        });
      }
    });

    for (const [lang, version] of versionByLang) {
      await this.bundle.cacheVersion(lang, version);
    }
  }
}
