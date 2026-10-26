import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { ScaleExtrasDto } from './admin-ops.dto';

const SEARCH_ENGINES = ['postgres', 'opensearch', 'meilisearch'];

/**
 * Batch D (2026-10-24, item 17): the few facts the admin «Масштаб» page
 * needs that no other endpoint gives. Everything else on that page comes
 * from `GET /admin/economy` (containers, database / Redis tiers, what the
 * system did by itself) and `GET /admin/system-health` (incidents, usage).
 * Read-only; Terraform passes the switches in OPS_* env vars.
 */
@Injectable()
export class ScaleService {
  constructor(
    private readonly config: ConfigService,
    private readonly settings: AppSettingsService,
  ) {}

  private env(name: string): string | undefined {
    const v = this.config.get<string>(name);
    return v && v.length > 0 ? v : undefined;
  }

  private mode(name: string): 'on' | 'off' | 'unknown' {
    const v = this.env(name);
    return v === 'on' || v === 'off' ? v : 'unknown';
  }

  private int(name: string): number | null {
    const n = Number(this.env(name));
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  /** The `search.engine` setting (added by the search-ready work); until
   * it is stored the built-in Postgres search is what runs. */
  private async searchEngine(): Promise<string> {
    try {
      const raw = await this.settings.raw('search.engine');
      return typeof raw === 'string' && SEARCH_ENGINES.includes(raw)
        ? raw
        : 'postgres';
    } catch {
      return 'postgres';
    }
  }

  async report(): Promise<ScaleExtrasDto> {
    return {
      dbAutoscale: this.mode('OPS_DB_AUTOSCALE'),
      redisAutoscale: this.mode('OPS_REDIS_AUTOSCALE'),
      poolerEnabled: !!this.env('DB_POOLER_HOST'),
      poolerMinTasks: this.int('OPS_POOLER_MIN'),
      poolerMaxTasks: this.int('OPS_POOLER_MAX'),
      searchEngine: await this.searchEngine(),
    };
  }
}
