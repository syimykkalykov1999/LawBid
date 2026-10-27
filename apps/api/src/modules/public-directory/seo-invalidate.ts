/**
 * CloudFront cache reset for the generated public pages: the API-side twin of
 * scripts/seo/lib/invalidate.mjs (the GitHub workflow's helper), with the same
 * numbers. It is mirrored, not imported, because Jest cannot load the ES
 * module; seo-invalidate.spec.ts reads the .mjs file and fails when a number
 * here drifts from it.
 *
 * The pages are already live when this runs and expire from the cache within
 * an hour (max-age=3600), so a reset that cannot be created is a warning,
 * never a failed run.
 */
export const MAX_WILDCARDS = 10; // per run; the account allows 15 in progress
export const MAX_PATHS = 30; // per run, and the most per day (the manifest counts)
export const MAX_IN_PROGRESS = 10;
export const BACKOFF_MS: readonly number[] = [30_000, 90_000]; // between the 3 tries
export const TRIES = 3;

export const isWildcard = (p: string): boolean => p.includes('*');

export const isLimitError = (text: string | undefined): boolean =>
  /TooManyInvalidationsInProgress|maximum number of in-progress/i.test(
    text ?? '',
  );

/**
 * At most `maxWildcards` wildcard paths and `maxPaths` paths in all; the
 * order given is the priority. The generator passes `maxWildcards: 0`: it only
 * ever resets exact page paths, never `/*`.
 */
export function capPaths(
  paths: readonly string[],
  opts: { maxWildcards?: number; maxPaths?: number } = {},
): { paths: string[]; dropped: number } {
  const maxWildcards = opts.maxWildcards ?? MAX_WILDCARDS;
  const maxPaths = opts.maxPaths ?? MAX_PATHS;
  const out: string[] = [];
  const seen = new Set<string>();
  let wild = 0;
  for (const p of paths) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    if (isWildcard(p)) {
      if (wild >= maxWildcards) continue;
      wild++;
    }
    if (out.length >= maxPaths) continue;
    out.push(p);
  }
  return { paths: out, dropped: seen.size - out.length };
}

export interface BackoffArgs {
  paths: string[];
  /** Resets running now; optional (the task role may not be allowed to list). */
  inProgress?: () => Promise<number>;
  create: (paths: string[]) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  tries?: number;
  maxInProgress?: number;
  waits?: readonly number[];
  log?: (message: string) => void;
}

/**
 * Creates the reset unless CloudFront is busy: counts the running resets
 * first (when it can) and waits, up to `tries` attempts, and treats the limit
 * error of `create` the same way. After the last try it gives up with
 * `skipped` instead of throwing; any other error is thrown.
 */
export async function invalidateWithBackoff(
  args: BackoffArgs,
): Promise<{ status: 'nothing' | 'created' | 'skipped'; attempts: number }> {
  const {
    paths,
    inProgress,
    create,
    sleep,
    tries = TRIES,
    maxInProgress = MAX_IN_PROGRESS,
    waits = BACKOFF_MS,
    log = () => undefined,
  } = args;
  if (paths.length === 0) return { status: 'nothing', attempts: 0 };
  for (let attempt = 1; attempt <= tries; attempt++) {
    let busy = false;
    if (inProgress) {
      try {
        busy = (await inProgress()) >= maxInProgress;
      } catch (e) {
        log(
          `could not count the running resets (${e instanceof Error ? e.message : String(e)}); trying anyway`,
        );
      }
    }
    if (!busy) {
      try {
        await create(paths);
        return { status: 'created', attempts: attempt };
      } catch (e) {
        if (!isLimitError(e instanceof Error ? e.message : undefined)) throw e;
        busy = true;
      }
    }
    if (attempt < tries) {
      const wait = waits[Math.min(attempt - 1, waits.length - 1)];
      log(
        `CloudFront is busy with other resets; waiting ${Math.round(wait / 1000)} s (try ${attempt} of ${tries})`,
      );
      await sleep(wait);
    }
  }
  return { status: 'skipped', attempts: tries };
}
