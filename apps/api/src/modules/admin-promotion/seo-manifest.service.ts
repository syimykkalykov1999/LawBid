import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_PUBLIC_ORIGIN } from '../../common/utils/public-urls';
import type { PromotionManifestDto, PromotionStatusDto } from './promotion.dto';

/** The answer is reused this long (the manifest changes once a day). */
export const MANIFEST_CACHE_MS = 10 * 60_000;
/** A failed read is retried sooner but not on every page open. */
const FAILURE_CACHE_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;
/** ~300 bytes a page: 100 000 pages is ~30 MB. Anything bigger is refused. */
const MAX_MANIFEST_BYTES = 80_000_000;

/**
 * Pure: counts from the published `seo-manifest.json`
 * (scripts/seo/lib/manifest.mjs: `{ version, builtAt, pages: { path:
 * { hash, lastmod, index } }, ramp?: { perDay, date, deferred } }`).
 * Returns null for anything that is not a manifest.
 */
export function summarizeManifest(raw: unknown): PromotionManifestDto | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const pages = m.pages;
  if (!pages || typeof pages !== 'object' || Array.isArray(pages)) return null;
  let total = 0;
  let indexed = 0;
  for (const p of Object.values(pages as Record<string, unknown>)) {
    total += 1;
    if (p && typeof p === 'object' && (p as { index?: unknown }).index === true)
      indexed += 1;
  }
  const ramp =
    m.ramp && typeof m.ramp === 'object'
      ? (m.ramp as Record<string, unknown>)
      : null;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  return {
    builtAt:
      typeof m.builtAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(m.builtAt)
        ? m.builtAt
        : null,
    pages: total,
    indexed,
    noindex: total - indexed,
    rampPerDay: ramp ? num(ramp.perDay) : null,
    rampDeferred: ramp ? num(ramp.deferred) : null,
  };
}

/**
 * Owner 2026-10-27 («Продвижение», status): reads the published
 * `seo-manifest.json` from the public site (CDN), cached 10 minutes per
 * process; any failure is tolerated (the page shows «ещё не опубликован»).
 */
@Injectable()
export class SeoManifestService {
  private readonly log = new Logger(SeoManifestService.name);
  private cache: { until: number; value: PromotionStatusDto } | null = null;

  constructor(private readonly config: ConfigService) {}

  url(): string {
    const base = (
      this.config.get<string>('APP_LINK_BASE_URL') || DEFAULT_PUBLIC_ORIGIN
    ).replace(/\/+$/, '');
    return `${base}/seo-manifest.json`;
  }

  async status(now: number = Date.now()): Promise<PromotionStatusDto> {
    if (this.cache && this.cache.until > now) return this.cache.value;
    const manifestUrl = this.url();
    let manifest: PromotionManifestDto | null = null;
    let error: string | null = null;
    try {
      const res = await fetch(manifestUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.status === 404 || res.status === 403) {
        error =
          'Файла seo-manifest.json на сайте ещё нет: он появляется после первой сборки с включённым «Только изменённые файлы» или лимитом в день.';
      } else if (!res.ok) {
        error = `Сайт ответил ${res.status}.`;
      } else if (
        Number(res.headers.get('content-length') ?? 0) > MAX_MANIFEST_BYTES
      ) {
        error = 'Файл seo-manifest.json слишком большой, цифры не считаются.';
      } else {
        manifest = summarizeManifest(await res.json());
        if (!manifest) error = 'seo-manifest.json в неожиданном формате.';
      }
    } catch (e) {
      this.log.warn(
        `seo-manifest read failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      error = 'Не удалось открыть сайт, чтобы прочитать seo-manifest.json.';
    }
    const value: PromotionStatusDto = {
      manifestUrl,
      manifest,
      error,
      checkedAt: new Date(now).toISOString(),
    };
    this.cache = {
      until: now + (manifest ? MANIFEST_CACHE_MS : FAILURE_CACHE_MS),
      value,
    };
    return value;
  }
}
