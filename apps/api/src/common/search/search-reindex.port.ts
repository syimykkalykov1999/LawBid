/**
 * The part of the search reindex the cloud automation drives (infra «Авто»,
 * search-engine-auto.logic.ts), as a token so admin-launch never imports the
 * search module (which pulls cases, posts, profiles). SearchModule provides
 * it with `useExisting: SearchReindexService`.
 */
export const SEARCH_REINDEX_PORT = Symbol('SEARCH_REINDEX_PORT');

export interface SearchReindexPort {
  status(): Promise<{
    engineConfigured: boolean;
    state: { phase: string } | null;
  }>;
  start(source?: 'postgres' | 'engine'): Promise<unknown>;
  swap(): Promise<unknown>;
}
