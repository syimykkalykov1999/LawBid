import { Injectable } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import { PdfWordCache } from '../../common/pdf-fonts/pdf-fonts';

export const DEAL_RECORD_WORD_CACHE_KEY = 'deal_record.pdf_word_cache_words';

/**
 * Row 145: the shaped words every deal record of this process reuses
 * (headings, labels, legal texts). The bound is the admin setting
 * `deal_record.pdf_word_cache_words`, read before each render (app_config
 * is cached, no DB hit), so a change applies to the next record; 0 = each
 * record shapes its words itself, as before. Never changes the PDF bytes.
 */
@Injectable()
export class DealRecordPdfCache {
  private readonly cache = new PdfWordCache(
    APP_SETTINGS[DEAL_RECORD_WORD_CACHE_KEY],
  );

  constructor(private readonly settings: AppSettingsService) {}

  /** The process-wide word cache with the admin's current bound. */
  async current(): Promise<PdfWordCache> {
    try {
      const n = await this.settings.number(DEAL_RECORD_WORD_CACHE_KEY);
      this.cache.maxWords = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    } catch {
      // Settings unreadable: keep the last bound; the record still renders.
    }
    return this.cache;
  }
}
