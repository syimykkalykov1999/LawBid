import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The static-page generator's shared library (`scripts/seo/lib/*.mjs`):
 * the same code the GitHub workflow runs, loaded here as ES modules. Typed by
 * hand because the files are plain JavaScript.
 */
export interface SeoAttorneyRow {
  username: string;
  displayName: string;
  bio: string | null;
  firmNames: string[];
  languages: string[];
  ratingAvg: number;
  ratingCount: number;
  trustBadge: boolean;
  photoUrl: string | null;
  practiceAreas: Array<{ code: string; name: string }>;
  licensedStates: string[];
  updatedAt: string;
  /**
   * Office city (display name) and its state code. There is NO such field in
   * the database yet, so the directory leaves both out and no city hub can be
   * built from production data; see docs/runbooks/SEO_STATIC_PAGES.md.
   */
  city?: string | null;
  cityState?: string | null;
  /** The future consent field: `false` keeps the attorney out of the 2026-10-27 page types. */
  seoOptIn?: boolean;
}

/** A text post of a listed attorney (page type /attorneys/<username>/posts/<slug>/). */
export interface SeoPostRow {
  id: string;
  authorUsername: string;
  title: string | null;
  body: string;
  kind: 'post' | 'news';
  practiceCode: string | null;
  language: string | null;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
}

/** A public legal question with its reviewed answers (page type /legal-questions/<slug>/). */
export interface SeoQuestionRow {
  id: string;
  title: string;
  body: string;
  practiceCode: string | null;
  stateCode: string | null;
  createdAt: string;
  updatedAt: string;
  answers: Array<{
    id: string;
    attorneyUsername: string;
    body: string;
    /** Always true here: only answers that pass the review rules are read. */
    reviewed: true;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface SeoRenderOptions {
  site: string;
  buildDate: string;
  indexEmpty: boolean;
  sitemapIndex: boolean;
  robotsAi: boolean;
  allowTraining: boolean;
  llms: boolean;
  rampPerDay: number;
  rampBaseline: 'all' | 'none';
  manifest: boolean;
  gate: {
    enabled: boolean;
    minWords: number;
    minAttorneys: number;
    minBioChars: number;
    minPostChars?: number;
    minQaChars?: number;
    minCityAttorneys?: number;
  };
  sitemapMax: number;
  prev: unknown;
  /** Page types of 2026-10-27, all off unless the SEO_PAGES_* switch is set. */
  pagesPosts?: boolean;
  pagesCities?: boolean;
  pagesQa?: boolean;
  adLabel?: 'ny' | 'off';
  posts?: SeoPostRow[];
  questions?: SeoQuestionRow[];
}

export interface SeoPlan {
  upload: string[];
  changed: string[];
  remove: string[];
  unchanged: number;
  massDelete: boolean;
  invalidate: string[];
  skippedInvalidations: number;
  manifest: { files: Record<string, string> } & Record<string, unknown>;
}

export interface SeoLib {
  renderSite: (
    attorneys: SeoAttorneyRow[],
    opts: SeoRenderOptions,
  ) => { files: Map<string, string>; result: Record<string, unknown> };
  sha256: (data: string | Buffer) => string;
  planFiles: (args: {
    files: Record<string, string>;
    prevFiles?: Record<string, string>;
  }) => { upload: string[]; changed: string[]; remove: string[] };
  planPublish: (args: {
    files: Record<string, string>;
    prev: unknown;
    today: string;
    maxInvalidations?: number;
    built?: Record<string, unknown>;
  }) => SeoPlan;
  deleteBatches: (
    keys: string[],
    size?: number,
  ) => Array<{ Objects: Array<{ Key: string }>; Quiet: boolean }>;
  defaultGate: SeoRenderOptions['gate'];
  clampMax: (v: unknown) => number;
}

/** DI token: tests replace the loaded library. */
export const SEO_LIB = Symbol('SEO_LIB');

/** `scripts/seo` of this checkout / image, found from the compiled file up. */
export function findSeoDir(from: string = __dirname): string | null {
  const override = process.env.SEO_SCRIPTS_DIR;
  if (override) return resolve(override);
  let dir = from;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, 'scripts', 'seo');
    if (existsSync(join(candidate, 'lib', 'render.mjs'))) return candidate;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

let cached: Promise<SeoLib> | undefined;

/** Loads render.mjs and manifest.mjs once per process. */
export function loadSeoLib(dir: string | null = findSeoDir()): Promise<SeoLib> {
  if (!dir) {
    return Promise.reject(
      new Error('scripts/seo not found (set SEO_SCRIPTS_DIR)'),
    );
  }
  cached ??= (async () => {
    const load = (f: string): Promise<Record<string, unknown>> =>
      import(pathToFileURL(join(dir, 'lib', f)).href) as Promise<
        Record<string, unknown>
      >;
    const [render, manifest] = await Promise.all([
      load('render.mjs'),
      load('manifest.mjs'),
    ]);
    return { ...render, ...manifest } as unknown as SeoLib;
  })();
  cached.catch(() => {
    cached = undefined;
  });
  return cached;
}
