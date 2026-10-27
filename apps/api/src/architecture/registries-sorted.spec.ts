import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Shared hand-kept registries (two-db-suites.json, the Redis and
 * cross-family allowlists, SWITCH_INVENTORY rows …) are stored in canonical
 * sorted order so parallel PRs merge cleanly. Nobody sorts by hand: run
 * `npm run lists:sort --workspace apps/api` (lint-staged does it on commit).
 * The ordering rules live in scripts/sort-lists.mjs and are tested in
 * scripts/sort-lists.test.mjs.
 */
describe('shared registries are in canonical (sorted) order', () => {
  it('npm run lists:sort has nothing to change', () => {
    const script = join(__dirname, '..', '..', 'scripts', 'sort-lists.mjs');
    let out = '';
    try {
      execFileSync(process.execPath, [script, '--check'], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (e) {
      out = (e as { stderr: string }).stderr;
    }
    expect(out).toBe('');
  });
});
