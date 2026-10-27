import { Prisma } from '@prisma/client';
import { familyOf } from './shard-manifest';
import { ghostRow } from './ghost-row';

/**
 * Shard-ready step 6 (docs/architecture/SHARDING_READY.md §3): the runtime
 * safety net behind the `UserDirectory` pattern.
 *
 * Code written for one database freely walks relations across families:
 *
 *   prisma.case.findMany({ include: { client: true, practice_area: true } })
 *
 * `User` and `PracticeArea` are GLOBAL (primary database); `Case` may live on
 * another one, where a join (or Prisma's second query) finds no such row.
 * `cross-family-include.spec.ts` ratchets the places this is written in a way
 * a static scan can see, and the hot paths use `UserDirectory` / `attachUsers`
 * explicitly. This extension covers the rest, wherever the include object
 * was built (shared constants, spreads, helper functions):
 *
 * on a NON-primary database client, for a to-one relation from a sharded
 * model to a GLOBAL model (FK on the sharded row), it
 *   1. takes the relation out of `include` / `select`,
 *   2. adds the FK scalar to a `select` that lacks it (removed again later),
 *   3. runs the query,
 *   4. loads the related rows from the PRIMARY client in one batch per
 *      relation and level (`id IN (...)`, soft-deleted rows included, like a
 *      to-one include),
 *   5. puts them back under the same key.
 * The JSON that comes out is the one the join produced. Nested includes of
 * the related row are passed to the primary query unchanged. Works at any
 * depth below sharded-to-sharded relations.
 *
 * Relation FILTERS (step 8, "two-step queries"): a to-one filter from a
 * sharded model into a global one (`where: { author: { status: 'active' } }`,
 * `is` / `isNot` / `null`, under AND / OR / NOT, in nested sharded relations
 * and in `include` / `select` sub-queries) is resolved first: the primary
 * database answers `id IN (...)` for the filter, and the shard query gets
 * `<fk> IN ids` instead. Exact; the cost is one extra primary query per
 * filter and an id list as long as the matching rows (fine for thousands;
 * the hot feed filters should become a denormalized column kept by the
 * outbox before the matching set reaches the hundreds of thousands).
 *
 * Not covered (counted by `onUncovered`): relation ORDERING (`orderBy:
 * { author: ... }`), to-many relations into a global model, `_count` through
 * a global relation.
 *
 * With one physical database the extension is not installed at all.
 */
type Obj = Record<string, unknown>;

interface Rel {
  readonly target: string;
  readonly isList: boolean;
  readonly required: boolean;
  readonly fk: string | null;
}

const relations = new Map<string, Map<string, Rel>>();
const softDeletes = new Set<string>();
for (const m of Prisma.dmmf.datamodel.models) {
  const rels = new Map<string, Rel>();
  for (const f of m.fields) {
    if (f.name === 'deleted_at') softDeletes.add(m.name);
    if (f.kind !== 'object') continue;
    const single =
      !f.isList &&
      f.relationFromFields?.length === 1 &&
      f.relationToFields?.length === 1 &&
      f.relationToFields[0] === 'id';
    rels.set(f.name, {
      target: f.type,
      isList: f.isList,
      required: f.isRequired,
      fk: single ? f.relationFromFields[0] : null,
    });
  }
  relations.set(m.name, rels);
}

const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** What has to be stitched below one query level. */
interface Plan {
  /** Relations pulled out at this level. */
  readonly links: Array<{
    readonly key: string;
    readonly fk: string;
    readonly target: string;
    readonly sub: Obj | true;
    readonly injected: boolean;
  }>;
  /** Kept relations (same family side) with something to stitch inside. */
  readonly nested: Map<string, { plan: Plan; isList: boolean }>;
}

const isStitched = (model: string, rel: Rel): boolean =>
  !rel.isList &&
  rel.fk !== null &&
  familyOf(model) !== 'global' &&
  familyOf(rel.target) === 'global';

/** Rewrites one `{ include?, select? }` level; returns args + plan. */
function rewrite(
  model: string,
  args: Obj,
  onUncovered?: (what: string) => void,
): { args: Obj; plan: Plan } | null {
  const rels = relations.get(model);
  if (!rels) return null;
  const out: Obj = { ...args };
  const plan: Plan = { links: [], nested: new Map() };
  let changed = false;
  for (const mode of ['include', 'select'] as const) {
    const sel = args[mode];
    if (!isObj(sel)) continue;
    const next: Obj = { ...sel };
    for (const [key, v] of Object.entries(sel)) {
      const rel = rels.get(key);
      if (!rel || !v) continue;
      if (isStitched(model, rel)) {
        const fk = rel.fk!;
        // `include` returns every scalar; a `select` may lack the FK.
        const injected = mode === 'select' && sel[fk] !== true;
        plan.links.push({
          key,
          fk,
          target: rel.target,
          sub: v === true ? true : (v as Obj),
          injected,
        });
        delete next[key];
        if (injected) next[fk] = true;
        changed = true;
        continue;
      }
      if (familyOf(model) !== 'global' && familyOf(rel.target) === 'global') {
        onUncovered?.(`${model}.${key}`);
        continue;
      }
      if (isObj(v)) {
        const inner = rewrite(rel.target, v, onUncovered);
        if (inner) {
          next[key] = inner.args;
          if (inner.plan.links.length > 0 || inner.plan.nested.size > 0) {
            plan.nested.set(key, { plan: inner.plan, isList: rel.isList });
          }
          changed = true;
        }
      }
    }
    out[mode] = next;
  }
  return changed ? { args: out, plan } : null;
}

type Primary = {
  [delegate: string]: { findMany(args: unknown): Promise<Obj[]> };
};

async function stitch(
  model: string,
  rows: Obj[],
  plan: Plan,
  primary: Primary,
): Promise<void> {
  if (rows.length === 0) return;
  for (const link of plan.links) {
    const ids = [
      ...new Set(
        rows
          .map((r) => r[link.fk])
          .filter((x): x is string => typeof x === 'string'),
      ),
    ];
    let byId = new Map<string, Obj>();
    if (ids.length > 0) {
      const delegate = link.target[0].toLowerCase() + link.target.slice(1);
      let sub: Obj = link.sub === true ? {} : link.sub;
      // A `select` without id still needs it for the lookup; stripped below.
      const stripId = isObj(sub.select) && sub.select.id !== true;
      if (stripId)
        sub = { ...sub, select: { ...(sub.select as Obj), id: true } };
      // A to-one include returns the row even when it is soft-deleted.
      const where: Obj = { id: { in: ids } };
      if (softDeletes.has(link.target)) where.deleted_at = {};
      const found = await primary[delegate].findMany({ where, ...sub });
      byId = new Map(
        found.map((r) => {
          if (!stripId) return [r.id as string, r];
          const { id, ...rest } = r;
          return [id as string, rest];
        }),
      );
    }
    for (const r of rows) {
      const fk = r[link.fk];
      // Step 9: no foreign key any more. A REQUIRED relation whose row is
      // gone becomes a ghost (selected fields null) instead of null, which
      // code written for a guaranteed row would dereference.
      const missing =
        relations.get(model)?.get(link.key)?.required === true
          ? isObj(link.sub) && isObj(link.sub.select)
            ? ghostRow(link.sub.select)
            : null
          : null;
      r[link.key] = typeof fk === 'string' ? (byId.get(fk) ?? missing) : null;
      if (link.injected) delete r[link.fk];
    }
  }
  for (const [key, { plan: inner, isList }] of plan.nested) {
    const children: Obj[] = [];
    for (const r of rows) {
      const v = r[key];
      if (isList && Array.isArray(v)) children.push(...(v as Obj[]));
      else if (isObj(v)) children.push(v);
    }
    const relModel = relations.get(model)!.get(key)!.target;
    await stitch(relModel, children, inner, primary);
  }
}

type PrimaryIds = (target: string, filter: Obj) => Promise<string[]>;

/** Rewrites one `where` (recursing through AND/OR/NOT and sharded relations). */
async function rewriteWhere(
  model: string,
  where: unknown,
  ids: PrimaryIds,
): Promise<unknown> {
  if (!isObj(where)) return where;
  const rels = relations.get(model);
  if (!rels) return where;
  const out: Obj = {};
  let changed = false;
  for (const [key, v] of Object.entries(where)) {
    if (key === 'AND' || key === 'OR' || key === 'NOT') {
      const list = Array.isArray(v) ? v : [v];
      const done = await Promise.all(
        list.map((w) => rewriteWhere(model, w, ids)),
      );
      if (done.some((w, i) => w !== list[i])) changed = true;
      out[key] = Array.isArray(v) ? done : done[0];
      continue;
    }
    const rel = rels.get(key);
    if (!rel || !(isObj(v) || v === null)) {
      out[key] = v;
      continue;
    }
    if (isStitched(model, rel)) {
      const fk = rel.fk!;
      changed = true;
      // `{author: null}` / `{is: null}`: no related row.
      if (v === null || (isObj(v) && v.is === null)) {
        out[`__and_${key}`] = { [fk]: null };
        continue;
      }
      const isNot = isObj(v) && isObj(v.isNot) ? v.isNot : null;
      const filter = isObj(v) && isObj(v.is) ? v.is : isNot ? isNot : v;
      if (isObj(v) && v.isNot === null) {
        out[`__and_${key}`] = { [fk]: { not: null } };
        continue;
      }
      const found = await ids(rel.target, filter);
      out[`__and_${key}`] = isNot
        ? { OR: [{ [fk]: null }, { [fk]: { notIn: found } }] }
        : { [fk]: { in: found } };
      continue;
    }
    if (familyOf(model) !== 'global' && familyOf(rel.target) === 'global') {
      out[key] = v; // to-many into global: not covered
      continue;
    }
    // A sharded relation: filters inside it can name global relations too.
    const inner = await rewriteRelationFilter(rel.target, v, ids);
    if (inner !== v) changed = true;
    out[key] = inner;
  }
  if (!changed) return where;
  // Fold the synthetic keys into an AND list.
  const extra: unknown[] = [];
  for (const k of Object.keys(out)) {
    if (k.startsWith('__and_')) {
      extra.push(out[k]);
      delete out[k];
    }
  }
  const andPrev: unknown[] =
    out.AND === undefined
      ? []
      : Array.isArray(out.AND)
        ? (out.AND as unknown[])
        : [out.AND];
  if (extra.length > 0) out.AND = [...andPrev, ...extra];
  return out;
}

async function rewriteRelationFilter(
  target: string,
  v: unknown,
  ids: PrimaryIds,
): Promise<unknown> {
  if (!isObj(v)) return v;
  const keys = ['is', 'isNot', 'some', 'every', 'none'];
  if (keys.some((k) => k in v)) {
    const out: Obj = { ...v };
    let changed = false;
    for (const k of keys) {
      if (isObj(v[k])) {
        const w = await rewriteWhere(target, v[k], ids);
        if (w !== v[k]) {
          out[k] = w;
          changed = true;
        }
      }
    }
    return changed ? out : v;
  }
  return rewriteWhere(target, v, ids);
}

/** Rewrites `where` of the query and of nested include / select sub-queries. */
async function rewriteArgsFilters(
  model: string,
  args: Obj,
  ids: PrimaryIds,
): Promise<Obj> {
  const rels = relations.get(model);
  if (!rels) return args;
  let out = args;
  if (args.where !== undefined) {
    const w = await rewriteWhere(model, args.where, ids);
    if (w !== args.where) out = { ...out, where: w };
  }
  for (const mode of ['include', 'select'] as const) {
    const sel = args[mode];
    if (!isObj(sel)) continue;
    let next: Obj | null = null;
    for (const [key, v] of Object.entries(sel)) {
      const rel = rels.get(key);
      if (!rel || !isObj(v)) continue;
      if (familyOf(model) !== 'global' && familyOf(rel.target) === 'global')
        continue; // stitched from the primary database, its own filters are fine there
      const inner = await rewriteArgsFilters(rel.target, v, ids);
      if (inner !== v) (next ??= { ...sel })[key] = inner;
    }
    if (next) out = { ...out, [mode]: next };
  }
  return out;
}

const FILTER_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
  'update',
  'delete',
  'upsert',
]);

const READ_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'create',
  'update',
  'upsert',
  'delete',
]);

/**
 * `primary` returns the client of the primary database (called per query).
 * Install it on non-primary clients only.
 */
export interface StitchParams {
  model: string;
  operation: string;
  args: unknown;
  query: (args: never) => Promise<unknown>;
}

/** The `$allOperations` handler (exported for unit tests). */
export function stitchHandler(
  primary: () => unknown,
  onUncovered?: (what: string) => void,
) {
  return async ({
    model,
    operation,
    args,
    query,
  }: StitchParams): Promise<unknown> => {
    if (!isObj(args)) return query(args as never);
    if (FILTER_OPS.has(operation) && familyOf(model) !== 'global') {
      const p = primary() as Primary;
      args = await rewriteArgsFilters(model, args, async (target, filter) => {
        const delegate = target[0].toLowerCase() + target.slice(1);
        const where: Obj = { AND: [filter] };
        if (softDeletes.has(target)) where.deleted_at = {};
        const rows = await p[delegate].findMany({
          where,
          select: { id: true },
        });
        return rows.map((r) => r.id as string);
      });
    }
    if (!READ_OPS.has(operation)) return query(args as never);
    const rewritten = rewrite(model, args as Obj, onUncovered);
    if (!rewritten) return query(args as never);
    const result = (await query(rewritten.args as never)) as Obj | Obj[] | null;
    if (result === null || result === undefined) return result;
    await stitch(
      model,
      Array.isArray(result) ? result : [result],
      rewritten.plan,
      primary() as Primary,
    );
    return result;
  };
}

export function crossFamilyStitchExtension(
  primary: () => unknown,
  onUncovered?: (what: string) => void,
) {
  const handler = stitchHandler(primary, onUncovered);
  return Prisma.defineExtension({
    name: 'cross-family-stitch',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return handler({
            model,
            operation,
            args,
            query: query,
          });
        },
      },
    },
  });
}

/** For tests: which relations of [model] would be stitched. */
export function stitchedRelations(model: string): string[] {
  const rels = relations.get(model);
  if (!rels) return [];
  return [...rels]
    .filter(([, rel]) => isStitched(model, rel))
    .map(([name]) => name);
}
