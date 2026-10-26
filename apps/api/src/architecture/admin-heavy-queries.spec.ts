import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Owner 2026-10-25: admin counters must never load the database or cost
 * money. Every admin number is computed by the snapshot job (dashboard +
 * analytics, once a day / on the admin button) and read from the stored
 * snapshot. This guard fails CI when an admin or analytics file gets MORE
 * count / groupBy / aggregate / $queryRaw calls on a big table than the
 * baseline below (the baseline = the older heavy spots still to convert,
 * see the PR "Ещё живые тяжёлые запросы"). Fewer is fine: lower the baseline.
 * Allowed without limit: the snapshot compute itself.
 */
const SRC = resolve(__dirname, '..');
const BASELINE = join(__dirname, 'admin-heavy-queries.baseline.json');
const SNAPSHOT_COMPUTE = new Set([
  'modules/admin/dashboard.service.ts',
  'modules/analytics/analytics.service.ts',
]);
const BIG_MODELS =
  'user|message|notification|case|bid|auditLog|payment|casePayment|userActivityDay';
const BIG_TABLES =
  'users|messages|notifications|cases|bids|payments|case_payments|audit_log|user_activity_days';
const DELEGATE = new RegExp(
  `\\.(${BIG_MODELS})\\.(count|groupBy|aggregate)\\(`,
  'g',
);

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (n.endsWith('.ts') && !n.endsWith('.spec.ts')) out.push(f);
  }
  return out;
}

export function heavyCalls(text: string): number {
  let n = (text.match(DELEGATE) ?? []).length;
  const raw = /\$queryRaw/g;
  const from = new RegExp(`(FROM|JOIN)\\s+(${BIG_TABLES})\\b`, 'i');
  for (let m = raw.exec(text); m; m = raw.exec(text)) {
    const end = text.indexOf('`;', m.index);
    if (from.test(text.slice(m.index, end < 0 ? undefined : end))) n += 1;
  }
  return n;
}

function scan(): Record<string, number> {
  const found: Record<string, number> = {};
  for (const f of walk(join(SRC, 'modules'))) {
    const rel = relative(SRC, f).split(sep).join('/');
    if (!/^modules\/(admin|admin-[^/]+|analytics)\//.test(rel)) continue;
    if (SNAPSHOT_COMPUTE.has(rel)) continue;
    const n = heavyCalls(readFileSync(f, 'utf8'));
    if (n > 0) found[rel] = n;
  }
  return found;
}

describe('admin heavy queries', () => {
  it('does not grow past the baseline (new counters go through the snapshot)', () => {
    const found = scan();
    if (process.env.WRITE_BASELINE) {
      writeFileSync(BASELINE, JSON.stringify(found, null, 2) + '\n');
      return;
    }
    const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<
      string,
      number
    >;
    const worse = Object.entries(found)
      .filter(([f, n]) => n > (base[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} > ${base[f] ?? 0}`);
    expect(worse).toEqual([]);
  });

  it('counts a delegate call and a raw query on a big table', () => {
    expect(heavyCalls('p.user.count({})')).toBe(1);
    expect(heavyCalls('p.$queryRaw`SELECT 1 FROM users u`;')).toBe(1);
    expect(heavyCalls('p.$queryRaw`SELECT 1 FROM tiny_table`;')).toBe(0);
    expect(heavyCalls('p.featureFlag.count({})')).toBe(0);
  });
});
