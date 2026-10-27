import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  SEO_LAST_RUN_KEY,
  SeoGeneratorTrigger,
  parseSeoGeneratorMode,
} from '../../common/seo/seo-generator.trigger';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  createCloudFrontInvalidationSender,
  type InvalidationSender,
} from '../../modules/files/storage/cloudfront-invalidation.client';
import { PublicDirectoryService } from '../../modules/public-directory/public-directory.service';
import {
  SEO_LIB,
  loadSeoLib,
  type SeoAttorneyRow,
  type SeoLib,
  type SeoRenderOptions,
} from '../../modules/public-directory/seo-lib';
import {
  SEO_WEB_STORE,
  createSeoWebStore,
  type SeoWebStore,
} from '../../modules/public-directory/seo-web-store';

/** Test seam: replaces the signed CloudFront call. */
export const SEO_INVALIDATION_SENDER = Symbol('SEO_INVALIDATION_SENDER');

/** The GitHub workflow's manifest (page states, ramp counters): read only. */
export const WORKFLOW_MANIFEST_KEY = 'seo-manifest.json';
/** This job's own manifest: which files it published, the day's reset budget. */
export const GENERATOR_MANIFEST_KEY = 'seo-gen-manifest.json';
const PAGE_CACHE = 'public,max-age=3600';
/** Rows per read of the public directory (its own limit is 100). */
const PAGE_ROWS = 100;
const UPLOAD_CONCURRENCY = 8;

export type SeoGenerateResult =
  | { skipped: string }
  | {
      pages: number;
      attorneys: number;
      uploaded: number;
      deferred: number;
      unchanged: number;
      removed: number;
      invalidated: number;
      ms: number;
    };

const truthy = (v: string | undefined): boolean =>
  /^(1|true|yes|on)$/i.test(v ?? '');
const int = (v: string | undefined, fallback: number): number => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** Object key of a page path: '/lawyers/' -> 'lawyers/index.html'. */
export const pageKey = (path: string): string =>
  `${path.replace(/^\/+/, '')}index.html`;

/**
 * Programmatic SEO (2026-10-27): the cron job `seo.generate`.
 *
 * Reads the public directory straight from the database read path (the same
 * service the public API uses; 100 rows per page, three statements per page,
 * no per-row queries), renders the pages with the shared library
 * (scripts/seo/lib/render.mjs, the code the GitHub workflow runs), and
 * publishes only what changed: PUT new/changed pages, DELETE pages that are
 * gone, reset the CDN for changed paths within the day's budget, and store its
 * manifest last (a failed run is simply planned again).
 *
 * Does nothing unless `seo.generator_mode` is nightly or nightly+events AND
 * SEO_WEB_BUCKET + SEO_SITE_URL are set. It publishes the pages only
 * (/lawyers, /practice-areas, /attorneys); sitemap.xml, robots.txt and
 * llms.txt stay with the nightly workflow, which merges them with the company
 * site. SEO_* switches are read from the environment exactly as build.mjs
 * reads them (all off by default).
 */
@Injectable()
export class SeoGenerateJob {
  private sender?: InvalidationSender;
  private store?: SeoWebStore;
  private lib?: SeoLib;

  constructor(
    private readonly config: ConfigService,
    private readonly directory: PublicDirectoryService,
    private readonly logger: PinoLogger,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
    @Optional() private readonly trigger?: SeoGeneratorTrigger,
    @Optional() @Inject(SEO_LIB) lib?: SeoLib,
    @Optional() @Inject(SEO_WEB_STORE) store?: SeoWebStore,
    @Optional()
    @Inject(SEO_INVALIDATION_SENDER)
    sender?: InvalidationSender,
  ) {
    this.lib = lib;
    this.store = store;
    this.sender = sender;
    this.logger.setContext(SeoGenerateJob.name);
  }

  async run(): Promise<SeoGenerateResult> {
    // Off first, before anything else is read or loaded.
    const mode = this.settings
      ? parseSeoGeneratorMode(await this.settings.string('seo.generator_mode'))
      : 'off';
    if (mode === 'off') return { skipped: 'off' };
    const bucket = this.config.get<string>('SEO_WEB_BUCKET');
    const site = this.config.get<string>('SEO_SITE_URL');
    if (!bucket || !site)
      return { skipped: 'SEO_WEB_BUCKET/SEO_SITE_URL not set' };

    const startedAt = Date.now();
    await this.redis?.set(
      SEO_LAST_RUN_KEY,
      String(startedAt),
      'EX',
      7 * 86_400,
    );
    try {
      return await this.generate({ bucket, site, startedAt });
    } finally {
      // Events that arrived during the run get one follow-up run.
      await this.trigger?.afterRun(startedAt).catch(() => undefined);
    }
  }

  private async generate(args: {
    bucket: string;
    site: string;
    startedAt: number;
  }): Promise<SeoGenerateResult> {
    const settings = this.settings!;
    const maxAttorneys = await settings.number('seo.generator_max_attorneys');
    const attorneys = await this.readAttorneys(maxAttorneys);
    if (!attorneys) {
      this.logger.error(
        { alert: 'seo_generator_too_many', maxAttorneys },
        'seo.generate refused: more attorneys than seo.generator_max_attorneys (a partial set would delete pages)',
      );
      return { skipped: 'more attorneys than the limit' };
    }

    const lib = (this.lib ??= await loadSeoLib());
    const store = (this.store ??= createSeoWebStore({
      bucket: args.bucket,
      region:
        this.config.get<string>('S3_REGION') ??
        this.config.get<string>('AWS_REGION'),
    }));
    const today = new Date(args.startedAt).toISOString().slice(0, 10);

    const [workflowManifest, ownManifest] = await Promise.all([
      this.readJson(store, WORKFLOW_MANIFEST_KEY),
      this.readJson(store, GENERATOR_MANIFEST_KEY),
    ]);

    const { files } = lib.renderSite(
      attorneys,
      this.renderOptions(lib, args.site, today, workflowManifest),
    );
    const html = new Map<string, string>();
    const hashes: Record<string, string> = {};
    for (const [path, page] of files) {
      const key = pageKey(path);
      html.set(key, page);
      hashes[key] = lib.sha256(page);
    }

    // One run uploads at most N files; the rest waits (and is planned again,
    // because the manifest keeps the old hash or leaves the file out).
    const maxUploads = await settings.number(
      'seo.generator_max_uploads_per_run',
    );
    const prevFiles = (ownManifest as { files?: Record<string, string> } | null)
      ?.files;
    const full = lib.planFiles({ files: hashes, prevFiles });
    const deferred = full.upload.slice(maxUploads);
    const effective: Record<string, string> = { ...hashes };
    for (const key of deferred) {
      if (prevFiles && key in prevFiles) effective[key] = prevFiles[key];
      else delete effective[key];
    }
    const plan = lib.planPublish({
      files: effective,
      prev: ownManifest,
      today,
      maxInvalidations: await settings.number(
        'seo.max_invalidation_paths_per_day',
      ),
    });
    if (plan.massDelete) {
      this.logger.error(
        { alert: 'seo_generator_mass_delete', remove: plan.remove.length },
        'seo.generate refused: it would remove over 30% of the published pages (empty directory?). Nothing was written.',
      );
      return { skipped: 'would remove over 30% of the pages' };
    }

    await this.pool(plan.upload, async (key) => {
      await store.put(
        key,
        html.get(key)!,
        'text/html; charset=utf-8',
        PAGE_CACHE,
      );
    });
    for (const batch of lib.deleteBatches(plan.remove)) {
      await store.deleteMany(batch.Objects.map((o) => o.Key));
    }
    let invalidated = 0;
    const distributionId = this.config.get<string>('SEO_WEB_DISTRIBUTION_ID');
    if (distributionId && plan.invalidate.length > 0) {
      try {
        this.sender ??= createCloudFrontInvalidationSender();
        await this.sender({
          distributionId,
          paths: plan.invalidate,
          callerReference: `seo-gen-${args.startedAt}`,
        });
        invalidated = plan.invalidate.length;
      } catch (err) {
        // The pages expire by their one-hour cache; not worth failing the run.
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'seo.generate: CDN reset failed; pages expire by their cache lifetime',
        );
      }
    }
    // The manifest goes last: a failed run above is planned again next time.
    await store.put(
      GENERATOR_MANIFEST_KEY,
      JSON.stringify(plan.manifest),
      'application/json',
      'no-cache',
    );

    const result: SeoGenerateResult = {
      pages: files.size,
      attorneys: attorneys.length,
      uploaded: plan.upload.length,
      deferred: deferred.length,
      unchanged: plan.unchanged,
      removed: plan.remove.length,
      invalidated,
      ms: Date.now() - args.startedAt,
    };
    // Counts only: no names, no page text.
    this.logger.info(
      { metric: 'seo_generate', ...result },
      'seo pages generated',
    );
    return result;
  }

  /** All verified attorneys, 100 per read; null when there are more than `max`. */
  private async readAttorneys(max: number): Promise<SeoAttorneyRow[] | null> {
    const all: SeoAttorneyRow[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.directory.attorneys({
        limit: PAGE_ROWS,
        cursor,
      });
      all.push(...page.items);
      if (all.length > max) return null;
      if (!page.nextCursor) return all;
      cursor = page.nextCursor;
    }
  }

  private async readJson(
    store: SeoWebStore,
    key: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const text = await store.getText(key);
      return text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      return null; // first run, or an unreadable file: plan everything again
    }
  }

  /** The same switches (names and meaning) as scripts/seo/build.mjs. */
  private renderOptions(
    lib: SeoLib,
    site: string,
    today: string,
    prev: unknown,
  ): SeoRenderOptions {
    const env = (k: string) => this.config.get<string>(k);
    return {
      site,
      buildDate: today,
      indexEmpty: truthy(env('SEO_INDEX_EMPTY')),
      // Discovery files are not published by this job: skip building them.
      sitemapIndex: false,
      robotsAi: false,
      allowTraining: false,
      llms: false,
      rampPerDay: int(env('SEO_RAMP_PER_DAY'), 0),
      rampBaseline: env('SEO_RAMP_BASELINE') === 'none' ? 'none' : 'all',
      manifest: false,
      gate: {
        enabled: truthy(env('SEO_QUALITY_GATE')),
        minWords: int(env('SEO_MIN_WORDS'), lib.defaultGate.minWords),
        minAttorneys: int(
          env('SEO_MIN_ATTORNEYS'),
          lib.defaultGate.minAttorneys,
        ),
        minBioChars: int(env('SEO_MIN_BIO_CHARS'), lib.defaultGate.minBioChars),
      },
      sitemapMax: lib.clampMax(env('SEO_SITEMAP_MAX')),
      prev,
    };
  }

  /** Runs `fn` over `items`, UPLOAD_CONCURRENCY at a time; the first error stops the run. */
  private async pool<T>(
    items: T[],
    fn: (item: T) => Promise<void>,
  ): Promise<void> {
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const item = items[next++];
        await fn(item);
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(UPLOAD_CONCURRENCY, items.length) },
        worker,
      ),
    );
  }
}
