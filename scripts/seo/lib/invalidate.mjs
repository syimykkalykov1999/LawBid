// CloudFront cache reset for the public pages, with the account's limits in
// mind: at most 15 wildcard invalidations may be in progress at once
// (TooManyInvalidationsInProgress). The pages are already live when this
// runs and expire from the cache within an hour (max-age=3600), so a reset
// that cannot be created is a warning, never a failed run.

export const MAX_WILDCARDS = 10; // per run; the account allows 15 in progress
export const MAX_PATHS = 30; // per run, as before
export const MAX_IN_PROGRESS = 10; // wait while this many resets are running
export const BACKOFF_MS = [30_000, 90_000]; // waits between the 3 tries

export const isWildcard = (p) => p.includes('*');

export const isLimitError = (text) => /TooManyInvalidationsInProgress|maximum number of in-progress/i.test(String(text ?? ''));

/**
 * At most `maxWildcards` wildcard paths and `maxPaths` paths in all; the
 * order given is the priority. Exact paths never count against the
 * wildcard cap. Returns { paths, dropped }.
 */
export function capPaths(paths, { maxWildcards = MAX_WILDCARDS, maxPaths = MAX_PATHS } = {}) {
  const out = [];
  const seen = new Set();
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

/**
 * Creates the reset unless CloudFront is busy: counts the running resets
 * first and waits (at most `tries` attempts), and treats the limit error
 * of `create` the same way. After the last try it gives up with
 * { status: 'skipped' } instead of throwing; any other error is thrown.
 *
 *  inProgress(): Promise<number>   resets running now (may throw: unknown)
 *  create(paths): Promise<void>    throws an Error carrying the AWS message
 *  sleep(ms): Promise<void>
 */
export async function invalidateWithBackoff({
  paths,
  inProgress,
  create,
  sleep,
  tries = 3,
  maxInProgress = MAX_IN_PROGRESS,
  waits = BACKOFF_MS,
  log = () => {},
}) {
  if (paths.length === 0) return { status: 'nothing', attempts: 0 };
  for (let attempt = 1; attempt <= tries; attempt++) {
    let busy = false;
    try {
      busy = (await inProgress()) >= maxInProgress;
    } catch (e) {
      log(`could not count the running resets (${e.message}); trying anyway`);
    }
    if (!busy) {
      try {
        await create(paths);
        return { status: 'created', attempts: attempt };
      } catch (e) {
        if (!isLimitError(e.message)) throw e;
        busy = true;
      }
    }
    if (attempt < tries) {
      const wait = waits[Math.min(attempt - 1, waits.length - 1)];
      log(`CloudFront is busy with other resets; waiting ${Math.round(wait / 1000)} s (try ${attempt} of ${tries})`);
      await sleep(wait);
    }
  }
  return { status: 'skipped', attempts: tries };
}
