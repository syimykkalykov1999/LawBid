// `--recreate` used to drop the live index. Once the search engine is read
// through an alias (zero-downtime reindex), that would empty search for
// everyone, so the flag is refused and points to the versioned path.
export const RECREATE_REFUSED =
  '--recreate is no longer supported: it would drop the live index and empty search. ' +
  'Use the zero-downtime reindex instead: `node dist/src/cli/search-alias.js start`, then `run`, `verify`, `swap` ' +
  '(the old index is kept for rollback). See docs/runbooks/search-reindex.md.';

export function assertNoRecreate(argv: readonly string[]): void {
  if (argv.includes('--recreate')) throw new Error(RECREATE_REFUSED);
}
