import { Module } from '@nestjs/common';
import { I18nController } from './controllers/i18n.controller';
import { I18nAdminController } from './controllers/i18n-admin.controller';
import { I18nLanguagesService } from './services/i18n-languages.service';
import { I18nBundleService } from './services/i18n-bundle.service';
import { I18nImportService } from './services/i18n-import.service';
import { I18nExportService } from './services/i18n-export.service';

/**
 * docs/01_FOUNDATION_AUTH.md §15, stage 1.6 ("Бэкенд: модуль i18n").
 * No `imports: [AuthModule]` needed — unlike UsersModule, this module
 * only uses AuthModule's @Public() decorator (a plain import, not a
 * provider) and reads req.user off the request the global JwtAuthGuard
 * already populated; it has no dependency on anything AuthModule
 * exports.
 */
@Module({
  controllers: [I18nController, I18nAdminController],
  providers: [
    I18nLanguagesService,
    I18nBundleService,
    I18nImportService,
    I18nExportService,
  ],
})
export class I18nModule {}
