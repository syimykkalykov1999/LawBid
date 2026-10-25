/**
 * Shard-ready step 8 (docs/architecture/SHARDING_READY.md §3 "scatter-gather
 * over the few physical DBs"): the merge half of a query that names no shard
 * (a list of one attorney's bids, a count of notifications by type, a job
 * that sweeps every case). PrismaService runs it on every physical database
 * and these functions put the answers together. Only the operations whose
 * merge is exact are supported; anything else keeps its old routing:
 *
 *  - count: sum
 *  - findFirst / findUnique (+ OrThrow handled by the caller): first hit
 *  - findMany: concatenation; with `orderBy` on plain columns the rows are
 *    re-sorted and `skip` / `take` re-applied (each database is asked for
 *    `skip + take` rows without `skip`); `cursor`, `distinct`, relation
 *    ordering or `_count` ordering are NOT merged
 *  - updateMany / deleteMany: counts summed
 *  - aggregate: `_count`, `_sum`, `_min`, `_max` (sum / sum / min / max of the
 *    partial answers); `_avg` is NOT exact (needs the sum and the count of
 *    each database) and is never scattered, nor is `take` / `skip` /
 *    `cursor` / `orderBy` on an aggregate
 *  - groupBy: groups with the same `by` key are merged with the same four
 *    aggregates; each database returns ALL its groups (no `skip` / `take`),
 *    the merged groups are re-sorted by `orderBy` (plain columns or
 *    `{ _count: { col: dir } }`-style aggregates) and `skip` / `take` are
 *    re-applied. `having` and `_avg` are NOT exact and keep the old routing
 *    (a HAVING on a partial aggregate would drop groups whose total passes)
 *
 * Text ordering uses JS comparison, not the database collation: the merged
 * page order of rows that differ only by case or accents can differ from a
 * single database's. Time, number and uuid orderings are exact.
 */
type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export type ScatterOp =
  | 'count'
  | 'findFirst'
  | 'findUnique'
  | 'findMany'
  | 'updateMany'
  | 'deleteMany'
  | 'aggregate'
  | 'groupBy';

export const SCATTER_OPS: ReadonlySet<string> = new Set<ScatterOp>([
  'count',
  'findFirst',
  'findUnique',
  'findMany',
  'updateMany',
  'deleteMany',
  'aggregate',
  'groupBy',
]);

interface Order {
  field: string;
  dir: 'asc' | 'desc';
  nulls?: 'first' | 'last';
}

function parseOrderBy(raw: unknown): Order[] | null {
  if (raw === undefined) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out: Order[] = [];
  for (const item of list) {
    if (!isObj(item)) return null;
    const entries = Object.entries(item);
    if (entries.length !== 1) return null;
    const [field, v] = entries[0];
    if (v === 'asc' || v === 'desc') {
      out.push({ field, dir: v });
    } else if (
      isObj(v) &&
      (v.sort === 'asc' || v.sort === 'desc') &&
      (v.nulls === undefined || v.nulls === 'first' || v.nulls === 'last')
    ) {
      out.push({
        field,
        dir: v.sort,
        nulls: v.nulls,
      });
    } else {
      return null; // relation / aggregate ordering
    }
  }
  return out;
}

/** Can [op] with [args] be merged exactly? */
export function canScatter(op: string, args: unknown): boolean {
  if (!SCATTER_OPS.has(op)) return false;
  const a = isObj(args) ? args : {};
  if (op === 'count') return a.select === undefined;
  if (op === 'aggregate') {
    return (
      a._avg === undefined &&
      a.take === undefined &&
      a.skip === undefined &&
      a.cursor === undefined &&
      a.orderBy === undefined
    );
  }
  if (op === 'groupBy') {
    return (
      a.by !== undefined &&
      a._avg === undefined &&
      a.having === undefined &&
      a.cursor === undefined &&
      parseGroupOrder(a.orderBy, a.by) !== null
    );
  }
  if (op !== 'findMany' && op !== 'findFirst') return true;
  if (a.cursor !== undefined || a.distinct !== undefined) return false;
  if (typeof a.take === 'number' && a.take < 0) return false;
  const order = parseOrderBy(a.orderBy);
  if (order === null) return false;
  // The sort columns must be part of the result rows.
  if (isObj(a.select)) {
    const select = a.select;
    return order.every((o) => select[o.field] === true);
  }
  return true;
}

/** groupBy ordering: plain `by` columns or `{ _count|_sum|_min|_max: { col: dir } }`. */
function parseGroupOrder(
  raw: unknown,
  by: unknown,
): { path: string[]; dir: 'asc' | 'desc' }[] | null {
  if (raw === undefined) return [];
  const byList = Array.isArray(by) ? by : [by];
  const out: { path: string[]; dir: 'asc' | 'desc' }[] = [];
  for (const item of Array.isArray(raw) ? raw : [raw]) {
    if (!isObj(item)) return null;
    const entries = Object.entries(item);
    if (entries.length !== 1) return null;
    const [k, v] = entries[0];
    if (v === 'asc' || v === 'desc') {
      if (!byList.includes(k)) return null;
      out.push({ path: [k], dir: v });
    } else if (
      (k === '_count' || k === '_sum' || k === '_min' || k === '_max') &&
      isObj(v)
    ) {
      const inner = Object.entries(v);
      if (inner.length !== 1) return null;
      const [col, dir] = inner[0];
      if (dir !== 'asc' && dir !== 'desc') return null;
      out.push({ path: [k, col], dir });
    } else {
      return null;
    }
  }
  return out;
}

/** The arguments each database gets (skip folded into take). */
export function perDatabaseArgs(op: string, args: unknown): unknown {
  if (op === 'groupBy' && isObj(args)) {
    const { skip: _s, take: _t, ...rest } = args;
    void _s;
    void _t;
    return rest;
  }
  if (op !== 'findMany' || !isObj(args)) return args;
  const skip = typeof args.skip === 'number' ? args.skip : 0;
  const take = typeof args.take === 'number' ? args.take : undefined;
  if (take === undefined && skip === 0) return args;
  const { skip: _skip, ...rest } = args;
  void _skip;
  return take === undefined ? rest : { ...rest, take: take + skip };
}

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (
    isObj(a) &&
    isObj(b) &&
    typeof (a as { comparedTo?: unknown }).comparedTo === 'function'
  ) {
    return (a as unknown as { comparedTo(o: unknown): number }).comparedTo(b);
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'bigint' && typeof b === 'bigint') return a < b ? -1 : 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return +a - +b;
  return String(a) < String(b) ? -1 : 1;
}

function sortRows(rows: Obj[], order: Order[]): Obj[] {
  if (order.length === 0) return rows;
  return rows
    .map((row, i) => ({ row, i }))
    .sort((x, y) => {
      for (const o of order) {
        const a = x.row[o.field];
        const b = y.row[o.field];
        const aNull = a === null || a === undefined;
        const bNull = b === null || b === undefined;
        if (aNull || bNull) {
          if (aNull && bNull) continue;
          // PostgreSQL: NULLS LAST for asc, NULLS FIRST for desc.
          const nullsFirst = o.nulls ? o.nulls === 'first' : o.dir === 'desc';
          return aNull === nullsFirst ? -1 : 1;
        }
        const c = cmp(a, b);
        if (c !== 0) return o.dir === 'asc' ? c : -c;
      }
      return x.i - y.i;
    })
    .map((x) => x.row);
}

function structuredCloneRow(row: Obj): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] =
      isObj(v) &&
      !(v instanceof Date) &&
      typeof (v as { plus?: unknown }).plus !== 'function'
        ? { ...v }
        : v;
  }
  return out;
}

const isNil = (v: unknown): boolean => v === null || v === undefined;

function plus(a: unknown, b: unknown): unknown {
  if (isNil(a)) return b;
  if (isNil(b)) return a;
  if (typeof a === 'number' && typeof b === 'number') return a + b;
  if (typeof a === 'bigint' && typeof b === 'bigint') return a + b;
  const d = a as { plus?: (o: unknown) => unknown };
  if (typeof d.plus === 'function') return d.plus(b); // Prisma.Decimal
  return a;
}

/** Combines two partial aggregate objects (`_count` / `_sum` / `_min` / `_max`). */
function mergeAggregate(into: Obj, add: Obj): void {
  for (const [agg, v] of Object.entries(add)) {
    if (agg === '_count' && typeof v === 'number') {
      into._count = ((into._count as number) ?? 0) + v;
      continue;
    }
    if (!isObj(v)) continue;
    const cur = isObj(into[agg]) ? into[agg] : (into[agg] = {});
    for (const [col, x] of Object.entries(v)) {
      if (agg === '_count' || agg === '_sum') {
        cur[col] =
          agg === '_count'
            ? ((cur[col] as number) ?? 0) + (x as number)
            : plus(cur[col], x);
      } else if (isNil(cur[col])) {
        cur[col] = x;
      } else if (!isNil(x)) {
        const c = cmp(x, cur[col]);
        if (agg === '_min' ? c < 0 : c > 0) cur[col] = x;
      }
    }
  }
}

const keyOf = (row: Obj, by: string[]): string =>
  JSON.stringify(
    by.map((b) => row[b]),
    (_k, v: unknown) => (typeof v === 'bigint' ? `${v}n` : v),
  );

export function mergeScatter(
  op: string,
  args: unknown,
  results: unknown[],
): unknown {
  switch (op) {
    case 'count':
      return results.reduce<number>(
        (sum, r) => sum + (typeof r === 'number' ? r : 0),
        0,
      );
    case 'aggregate': {
      const out: Obj = {};
      for (const r of results) if (isObj(r)) mergeAggregate(out, r);
      return out;
    }
    case 'groupBy': {
      const a = isObj(args) ? args : {};
      const by = (Array.isArray(a.by) ? a.by : [a.by]) as string[];
      const groups = new Map<string, Obj>();
      for (const rows of results as Obj[][]) {
        for (const row of rows) {
          const k = keyOf(row, by);
          const have = groups.get(k);
          if (!have) {
            groups.set(k, structuredCloneRow(row));
          } else {
            const agg: Obj = {};
            for (const [f, v] of Object.entries(row))
              if (!by.includes(f)) agg[f] = v;
            mergeAggregate(have, agg);
          }
        }
      }
      const order = parseGroupOrder(a.orderBy, a.by) ?? [];
      const merged = [...groups.values()]
        .map((row, i) => ({ row, i }))
        .sort((x, y) => {
          for (const o of order) {
            const get = (r: Obj): unknown =>
              o.path.length === 1
                ? r[o.path[0]]
                : (r[o.path[0]] as Obj | undefined)?.[o.path[1]];
            const av = get(x.row);
            const bv = get(y.row);
            if (isNil(av) !== isNil(bv)) {
              return isNil(av) === (o.dir === 'desc') ? -1 : 1;
            }
            if (isNil(av)) continue;
            const c = cmp(av, bv);
            if (c !== 0) return o.dir === 'asc' ? c : -c;
          }
          return x.i - y.i;
        })
        .map((x) => x.row);
      const skip = typeof a.skip === 'number' ? a.skip : 0;
      const take = typeof a.take === 'number' ? a.take : undefined;
      return take === undefined
        ? merged.slice(skip)
        : merged.slice(skip, skip + take);
    }
    case 'findUnique':
      return results.find((r) => r !== null && r !== undefined) ?? null;
    case 'findFirst': {
      const a = isObj(args) ? args : {};
      const hits = results.filter(
        (r): r is Obj => r !== null && r !== undefined,
      );
      return sortRows(hits, parseOrderBy(a.orderBy) ?? [])[0] ?? null;
    }
    case 'updateMany':
    case 'deleteMany':
      return {
        count: results.reduce<number>(
          (sum, r) =>
            sum + (isObj(r) && typeof r.count === 'number' ? r.count : 0),
          0,
        ),
      };
    case 'findMany': {
      const a = isObj(args) ? args : {};
      const order = parseOrderBy(a.orderBy) ?? [];
      const all = sortRows((results as Obj[][]).flat(), order);
      const skip = typeof a.skip === 'number' ? a.skip : 0;
      const take = typeof a.take === 'number' ? a.take : undefined;
      return take === undefined
        ? all.slice(skip)
        : all.slice(skip, skip + take);
    }
    default:
      throw new Error(`mergeScatter: unsupported ${op}`);
  }
}
