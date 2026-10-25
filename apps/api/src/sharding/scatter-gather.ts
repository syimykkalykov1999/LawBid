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
  | 'deleteMany';

export const SCATTER_OPS: ReadonlySet<string> = new Set<ScatterOp>([
  'count',
  'findFirst',
  'findUnique',
  'findMany',
  'updateMany',
  'deleteMany',
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

/** The arguments each database gets (skip folded into take). */
export function perDatabaseArgs(op: string, args: unknown): unknown {
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
