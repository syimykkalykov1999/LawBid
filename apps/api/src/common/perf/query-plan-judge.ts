/**
 * Helpers of the user-facing perf guard (test/perf-user.e2e-spec.ts,
 * 2026-11-08): judge an EXPLAIN (FORMAT JSON) plan, inflate the planner's
 * statistics so a seeded database plans like a 10M / 100M-row one, and turn
 * Prisma's logged query parameters into SQL literals for `EXECUTE`.
 *
 * How the inflation works (PostgreSQL 16, src/backend/optimizer/util/plancat.c
 * `estimate_rel_size`): the planner takes the table's CURRENT number of pages
 * and multiplies it by the density `pg_class.reltuples / pg_class.relpages`
 * from the last ANALYZE. Multiplying `reltuples` by F (pages unchanged) makes
 * every row estimate F times bigger; a non-partial index takes the table's
 * row count, a partial one its own `reltuples` (also multiplied). Column
 * statistics with an absolute distinct count (`stadistinct > 0`) above
 * [ID_LIKE_DISTINCT] are id-like (they grow with the table) and are multiplied too; small
 * absolute counts (status, kind) and fractions (`< 0`) already scale.
 * The most-common-values list of an id-like column (a fraction or a big
 * count) is divided by F: a seeded attorney with 2 of 5 000 practice rows
 * is in that list with frequency 0.0004, and left alone the planner would
 * read it as 0.0004 × 20 M = 8 000 rows for ONE attorney at ×4000 (the
 * case feed cost 5.4 M / 51.7 M on 2026-11-09 for an attorney in the list
 * and 1.4 k / 18 k for one outside it). At 10 M attorneys no single id is
 * common, which the divided frequency says. A kind column's list (state,
 * status, topic) keeps its frequencies.
 * Superuser only; run inside a transaction that is rolled back.
 */
export interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Total Cost'?: number;
  'Plan Rows'?: number;
  Plans?: PlanNode[];
}

/**
 * An absolute distinct count above this is id-like (authors, chats, groups:
 * grows with the data) and is inflated with the table; at or below it a
 * column is a kind (status, state, topic). 100: the seed has 40 topics and
 * 45 states, and the CI seed (25 000 people) has ~2 500 attorneys.
 */
export const ID_LIKE_DISTINCT = 100;

/** Tables smaller than this after ANALYZE (config, states) are not inflated. */
export const INFLATE_MIN_ROWS = 1000;

export function inflateStatisticsSql(factor: number): string[] {
  if (!Number.isFinite(factor) || factor < 1) {
    throw new Error(`inflate factor must be >= 1, got ${factor}`);
  }
  const f = Math.floor(factor);
  const tables = `SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.reltuples >= ${INFLATE_MIN_ROWS}`;
  // pg_statistic keeps up to five (stakindN, stanumbersN) slots; kind 1 is
  // the most-common-values list and its stanumbers are the frequencies.
  const mcvSlots = [1, 2, 3, 4, 5]
    .map(
      (n) => `stanumbers${n} = CASE WHEN s.stakind${n} = 1 THEN (
         SELECT array_agg(x / ${f} ORDER BY o)::real[]
         FROM unnest(s.stanumbers${n}) WITH ORDINALITY AS t(x, o))
       ELSE s.stanumbers${n} END`,
    )
    .join(',\n       ');
  return [
    `UPDATE pg_class c SET reltuples = c.reltuples * ${f} FROM pg_index i
     WHERE c.oid = i.indexrelid AND c.reltuples > 0 AND i.indrelid IN (${tables})`,
    `UPDATE pg_statistic s SET ${mcvSlots}
     WHERE (s.stadistinct > ${ID_LIKE_DISTINCT} OR s.stadistinct < 0)
       AND 1 IN (s.stakind1, s.stakind2, s.stakind3, s.stakind4, s.stakind5)
       AND s.starelid IN (${tables})`,
    `UPDATE pg_statistic s SET stadistinct = s.stadistinct * ${f}
     WHERE s.stadistinct > ${ID_LIKE_DISTINCT} AND s.starelid IN (${tables})`,
    `UPDATE pg_class c SET reltuples = c.reltuples * ${f} WHERE c.oid IN (${tables})`,
  ];
}

/**
 * Sequential scans of big tables anywhere in a plan: a page request must
 * never read a whole table at 100M rows.
 */
export function seqScans(plan: PlanNode, big: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const stack: PlanNode[] = [plan];
  while (stack.length) {
    const node = stack.pop() as PlanNode;
    if (node.Plans) stack.push(...node.Plans);
    const rel = node['Relation Name'];
    if (node['Node Type'] === 'Seq Scan' && rel && big.has(rel)) {
      const msg = `Seq Scan on ${rel} (~${Math.round(node['Plan Rows'] ?? 0)} rows)`;
      if (!problems.includes(msg)) problems.push(msg);
    }
  }
  return problems;
}

export const planCost = (plan: PlanNode): number => plan['Total Cost'] ?? 0;

/**
 * The cost of one statement at several inflation factors. A page whose
 * plan touches a bounded number of rows costs the same at 10M and 100M; one
 * that reads a share of a table (a full index scan for COUNT(*), a deep
 * OFFSET, a sort of every row) grows with it. Problems: over [costMax] at
 * the biggest factor AND more than twice the cost at the smallest; or over
 * [hardMax] at any size.
 */
export function judgeCost(
  costs: ReadonlyMap<number, number>,
  costMax: number,
  hardMax: number,
): string[] {
  if (!costs.size) return [];
  const factors = [...costs.keys()].sort((a, b) => a - b);
  const lo = costs.get(factors[0]) ?? 0;
  const hiFactor = factors[factors.length - 1];
  const hi = costs.get(hiFactor) ?? 0;
  const problems: string[] = [];
  const worst = Math.max(...costs.values());
  if (worst > hardMax) {
    problems.push(`plan cost ${Math.round(worst)} > ${hardMax}`);
  } else if (factors.length > 1 && hi > costMax && hi > 2 * lo) {
    problems.push(
      `plan cost grows with the data: ${Math.round(lo)} @×${factors[0]} -> ${Math.round(hi)} @×${hiFactor}`,
    );
  } else if (factors.length === 1 && hi > costMax) {
    problems.push(`plan cost ${Math.round(hi)} > ${costMax}`);
  }
  return problems;
}

/**
 * Prisma's query event `params` (a JSON array as text) -> the argument list
 * of `EXECUTE stmt(...)`. Every value becomes a quoted literal of unknown
 * type, so PostgreSQL coerces it to the parameter's type (uuid, int,
 * timestamptz, jsonb...); arrays become array literals.
 */
export function paramLiterals(params: string): string {
  const values = parseParams(params);
  return values.map(literal).join(', ');
}

function parseParams(params: string): unknown[] {
  if (!params || params === '[]') return [];
  try {
    const v: unknown = JSON.parse(params);
    return Array.isArray(v) ? v : [v];
  } catch {
    // Some engine versions print dates bare: [2026-11-08 10:00:00 UTC,1]
    const quoted = params.replace(
      /(?<=[[,])\s*(\d{4}-\d\d-\d\d[ T][\d:.]+(?: ?(?:UTC|Z|[+-]\d\d:?\d\d))?)\s*(?=[,\]])/g,
      '"$1"',
    );
    const v: unknown = JSON.parse(quoted);
    return Array.isArray(v) ? v : [v];
  }
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** A JSON value (what JSON.parse gives) as text: objects as JSON. */
const text = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return `${v}`;
  return JSON.stringify(v);
};

function arrayElement(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  const s = text(v);
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function literal(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (Array.isArray(v)) return quote(`{${v.map(arrayElement).join(',')}}`);
  return quote(text(v));
}
