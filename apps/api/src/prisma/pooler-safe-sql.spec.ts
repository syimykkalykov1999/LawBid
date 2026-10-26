import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * DB-ops S5-9: PgBouncer runs in TRANSACTION pooling (infra/pgbouncer): a
 * server connection belongs to one client only while a transaction runs, so
 * anything that lives on the SESSION silently breaks (or leaks into another
 * request) once the pooler is on, while it works fine against a local
 * database. This spec fails the build when raw SQL in src/ uses:
 *  - session-level advisory locks `pg_advisory_lock(` / `pg_try_advisory_lock(`
 *    (use `pg_advisory_xact_lock`, released at COMMIT);
 *  - `LISTEN` / `UNLISTEN` (use Redis);
 *  - `SET name = ...` without `LOCAL` and `set_config(..., false)` (use
 *    `SET LOCAL` / `set_config(..., true)` inside a transaction).
 * Docs: docs/runbooks/db-ops.md.
 */
const SRC = join(__dirname, '..');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'node_modules') out.push(...files(p));
    } else if (/\.ts$/.test(name) && !/\.(spec|e2e-spec|d)\.ts$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** Same line count, comments blanked (a doc comment may name these words). */
function withoutComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const RULES: Array<[RegExp, string]> = [
  [
    /\bpg_(?:try_)?advisory_lock(?:_shared)?\s*\(/i,
    'session-level advisory lock (use pg_advisory_xact_lock)',
  ],
  [/[`'"]\s*(?:UN)?LISTEN\s+[a-z_"]/i, 'LISTEN / UNLISTEN (use Redis)'],
  [
    // An opening quote (not the closing quote of `"table"`) or a `;` right
    // before SET: the statement starts there, so it is not `UPDATE t SET`.
    /(?:[`';]|(?<!\w)")\s*SET\s+(?!LOCAL\b)(?:SESSION\s+)?[a-z_][a-z0-9_.]*\s*(?:=|\bTO\b)/i,
    'session-level SET (use SET LOCAL inside a transaction)',
  ],
  [
    /\bset_config\s*\([^)]*,\s*false\s*\)/i,
    'set_config(..., false) is session-level (use true)',
  ],
];

describe('raw SQL is safe behind PgBouncer transaction pooling (DB-ops S5-9)', () => {
  it('uses no session-level advisory lock, LISTEN or SET', () => {
    const hits: string[] = [];
    for (const f of files(SRC)) {
      const code = withoutComments(readFileSync(f, 'utf8'));
      const lines = code.split('\n');
      for (const [re, why] of RULES) {
        lines.forEach((line, i) => {
          // A template literal may start on the previous line: test both.
          const text = i > 0 ? `${lines[i - 1].slice(-1)}${line}` : line;
          if (re.test(line) || re.test(text)) {
            hits.push(`${relative(SRC, f)}:${i + 1}  ${why}`);
          }
        });
      }
    }
    expect([...new Set(hits)]).toEqual([]);
  });

  it('the rules do catch the bad forms (the guard itself works)', () => {
    const bad = [
      'SELECT pg_advisory_lock(42)',
      'await db.$executeRaw`LISTEN jobs`',
      "await db.$executeRawUnsafe('SET statement_timeout = 0')",
      "SELECT set_config('app.user', 'x', false)",
    ];
    for (const sql of bad) {
      expect(RULES.some(([re]) => re.test(sql))).toBe(true);
    }
    const ok = [
      'SELECT pg_advisory_xact_lock(42)',
      "SELECT set_config('app.user', 'x', true)",
      "await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`",
      'UPDATE users SET name = 1',
      'UPDATE "_prisma_migrations" SET finished_at = now()',
    ];
    for (const sql of ok) {
      expect(RULES.some(([re]) => re.test(sql))).toBe(false);
    }
  });
});
