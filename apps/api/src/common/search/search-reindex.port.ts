/**
 * The part of the search reindex the cloud automation drives (infra «Авто»,
 * search-engine-auto.logic.ts), as a token so admin-launch never imports the
 * search module (which pulls cases, posts, profiles). SearchModule provides
 * it with `useExisting: SearchReindexService`.
 */
export const SEARCH_REINDEX_PORT = Symbol('SEARCH_REINDEX_PORT');

/** Redis list of the automatic search steps, newest first (50 kept):
 * JSON `{ at, step, reason }`. Written by infra «Авто», shown on «Масштаб». */
export const SEARCH_AUTO_LOG_KEY = 'ops:infra-auto:search-log';

export interface SearchAutoLogEntry {
  at: string;
  step: string;
  reason: string;
}

/** The newest [n] entries of the log; broken lines are skipped. */
export function parseSearchAutoLog(
  lines: readonly string[],
): SearchAutoLogEntry[] {
  const out: SearchAutoLogEntry[] = [];
  for (const l of lines) {
    try {
      const v = JSON.parse(l) as Partial<SearchAutoLogEntry>;
      if (typeof v.at === 'string' && typeof v.step === 'string') {
        out.push({ at: v.at, step: v.step, reason: String(v.reason ?? '') });
      }
    } catch {
      // a line from an older format: not shown
    }
  }
  return out;
}

export interface SearchReindexPort {
  status(): Promise<{
    engineConfigured: boolean;
    state: { phase: string } | null;
  }>;
  start(source?: 'postgres' | 'engine'): Promise<unknown>;
  swap(): Promise<unknown>;
}
