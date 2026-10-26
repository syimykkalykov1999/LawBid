import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Owner 2026-10-20 (speed). Prisma sends `status = $1` as a parameter, which
 * Postgres cannot match to a `WHERE status = 'published'` partial index; the
 * feed then read the whole posts table (measured: 0.29 ms → 46–600 ms on
 * 100 k posts). The hot post reads must keep an index whose predicate only
 * uses `IS NULL`, and the database must plan with the real values.
 */
describe('feed plan stability migration', () => {
  const read = (dir: string) =>
    readFileSync(
      join(__dirname, `../../prisma/migrations/${dir}/migration.sql`),
      'utf8',
    );
  const sql = [
    '20261021000000_posts_visible_created_idx',
    '20261021000100_posts_author_visible_idx',
    '20261021000200_feed_plan_stability_db',
  ]
    .map(read)
    .join('\n');

  it.each([
    ['posts_visible_created_idx', '(created_at DESC, id DESC)'],
    ['posts_author_visible_idx', '(author_id, created_at DESC, id DESC)'],
  ])('%s is a partial index on IS NULL only', (name, cols) => {
    const m = new RegExp(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name}\\s+ON public\\.posts USING btree \\${cols.replace(/\)/g, '\\)')}\\s+WHERE ([^;]+);`,
    ).exec(sql);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('deleted_at IS NULL AND archived_at IS NULL');
    expect(m![1]).not.toMatch(/status/i);
  });

  it('builds each index in a file of its own (CONCURRENTLY needs that)', () => {
    for (const dir of [
      '20261021000000_posts_visible_created_idx',
      '20261021000100_posts_author_visible_idx',
    ]) {
      const code = read(dir)
        .split('\n')
        .filter((l) => !l.trim().startsWith('--'))
        .join('\n');
      expect(code.match(/;/g)).toHaveLength(1);
    }
  });

  it('plans with the real values', () => {
    expect(sql).toMatch(/plan_cache_mode = force_custom_plan/);
  });
});
