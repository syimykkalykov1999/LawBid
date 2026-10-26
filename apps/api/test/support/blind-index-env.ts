/**
 * BUG-1 (package N-12b): chat-search-blind-index.e2e-spec.ts needs sealed
 * chat texts and the search index key BEFORE AppModule (and its config)
 * loads, so it imports this module first. The previous values are kept so
 * the suite can put them back for the next file in the same worker.
 */
export const BLIND_INDEX_ENV = {
  MESSAGE_ENC_KEYS: 'm1:e2eA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6',
  MESSAGE_ENC_ACTIVE_KID: 'm1',
  SEARCH_INDEX_KEY: 'e2eQ9w8E7r6T5y4U3i2O1p0AsDfGhJkL',
} as const;

export const SAVED_ENV: Record<string, string | undefined> = {};
for (const [k, v] of Object.entries(BLIND_INDEX_ENV)) {
  SAVED_ENV[k] = process.env[k];
  process.env[k] = v;
}

export function restoreBlindIndexEnv(): void {
  for (const [k, v] of Object.entries(SAVED_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
