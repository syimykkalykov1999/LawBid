import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Owner 2026-10-14 (database security on PostgreSQL): user input never
 * reaches SQL as text. Tagged `$queryRaw` / `$executeRaw` templates bind
 * every `${value}` as a parameter; the `...Unsafe` variants take a plain
 * string, so they are allowed only in the files below, where the string is
 * a constant or a checked identifier (database name, table list).
 */
const ALLOWED = new Set([
  'common/secrets/secrets.service.ts',
  'modules/demo/demo-database.service.ts',
  'prisma/prisma.service.ts',
]);
const SRC = resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (n.endsWith('.ts') && !n.endsWith('.spec.ts')) out.push(f);
  }
  return out;
}

describe('SQL safety', () => {
  it('only the reviewed files use the *Unsafe raw-SQL calls', () => {
    const offenders = walk(SRC)
      .filter((f) => /\$(query|execute)RawUnsafe/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f).split(sep).join('/'))
      .filter((f) => !ALLOWED.has(f));
    expect(offenders).toEqual([]);
  });

  it('every make_interval(unit => ${value}) casts the bound value to INT', () => {
    // A JS number binds as bigint; make_interval takes integer, so without
    // the cast (secs is double precision and takes a bigint) PostgreSQL 16 fails with "function make_interval(mins => bigint)
    // does not exist" (it did, in the legal-exports worker).
    const bare =
      /make_interval\(\s*(?:years|months|weeks|days|hours|mins)\s*=>\s*\$\{[^}]+\}\s*\)/;
    const offenders = walk(SRC)
      .filter((f) => bare.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f).split(sep).join('/'));
    expect(offenders).toEqual([]);
  });
});
