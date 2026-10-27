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
  };
  sitemapMax: number;
  prev: unknown;
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
    /** Never a wildcard path: what is over the budget waits for the cache. */
    exactOnly?: boolean;
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
