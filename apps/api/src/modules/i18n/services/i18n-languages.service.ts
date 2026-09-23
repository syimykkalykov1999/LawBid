import { Injectable, NotFoundException } from '@nestjs/common';
import type { I18nLanguage } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';

/**
 * GET /i18n/languages (docs/01_FOUNDATION_AUTH.md §9.3): "список активных
 * языков". Also the shared "does this language exist and is it active"
 * check the bundle endpoint needs — i18n_languages is the single source
 * of truth for which locales the backend serves (not a hardcoded
 * enum/constant: the whole point of §9.3's admin-import flow is that
 * uploading a file with a new language column adds a language without a
 * redeploy — see I18nImportService and the stage-1.6 acceptance
 * criterion in docs/01_FOUNDATION_AUTH.md §15).
 */
@Injectable()
export class I18nLanguagesService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<I18nLanguage[]> {
    return this.prisma.i18nLanguage.findMany({
      where: { is_active: true },
      orderBy: { sort: 'asc' },
    });
  }

  async getActiveOrThrow(code: string): Promise<I18nLanguage> {
    const language = await this.prisma.i18nLanguage.findUnique({
      where: { code },
    });
    if (!language || !language.is_active) {
      throw new NotFoundException({
        code: ErrorCode.I18N_LANGUAGE_NOT_FOUND,
        message: `Unknown or inactive language "${code}".`,
      });
    }
    return language;
  }
}
