import { Prisma } from '@prisma/client';

/**
 * docs/02_DATABASE.md §1.4: "Soft delete: колонка `deleted_at`. Все
 * выборки по умолчанию фильтруют `deleted_at IS NULL` (Prisma
 * middleware/extension, а не вручную в каждом запросе)."
 *
 * A Prisma Client query extension (applied once, in PrismaService) that:
 *
 *  1. Top level — for every model that has a `deleted_at` column (derived
 *     from the generated DMMF, never hardcoded), read operations
 *     (findMany, findFirst(OrThrow), findUnique(OrThrow), count, aggregate,
 *     groupBy) get `deleted_at: null` added to their `where`.
 *  2. Nested reads — to-many relations pulled in through `include` /
 *     `select` (any operation, any model, any depth) whose target model
 *     soft-deletes get the same filter in their nested `where`, and
 *     relation counts (`_count`) count only live rows.
 *
 * Opt-out: a caller that mentions `deleted_at` anywhere in a `where`
 * (top level or inside AND / OR / NOT) owns the filter and is left alone —
 * `withDeleted(where)` (every row) and `onlyDeleted(where)` (soft-deleted
 * rows only) are the explicit helpers for that. `deleted_at: undefined`
 * does NOT count as mentioning it (Prisma ignores undefined).
 *
 * Deliberately NOT done:
 *  - Deletes are not rewritten into soft deletes: the spec only asks for
 *    read filtering, and which tables may be physically deleted (§1.4
 *    CASCADE helpers vs legally significant rows) is a per-service call.
 *  - Writes (update/updateMany/delete/upsert) keep their `where` as given,
 *    so services can still restore/anonymize soft-deleted rows.
 *  - To-one relations (`include: { author: true }`) cannot be filtered by
 *    Prisma — a nullable-to-one include would silently turn a required
 *    relation into null. They return the related row even if soft-deleted
 *    (e.g. a live post of a deleted author); callers check `deleted_at`.
 *  - Relation filters inside `where` (`where: { author: { ... } }`) and
 *    raw SQL ($queryRaw) are untouched.
 */

export const SOFT_DELETE_FIELD = 'deleted_at';

/** Read operations whose top-level `where` is filtered. */
export const SOFT_DELETE_READ_OPERATIONS: ReadonlySet<string> = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

interface DmmfField {
  readonly name: string;
  readonly kind: string;
  readonly type: string;
  readonly isList: boolean;
}

interface DmmfModel {
  readonly name: string;
  readonly fields: readonly DmmfField[];
}

interface RelationInfo {
  readonly target: string;
  readonly isList: boolean;
}

export interface SoftDeleteMeta {
  /** Models (PascalCase, as in Prisma.ModelName) with a deleted_at column. */
  readonly models: ReadonlySet<string>;
  /** model -> relation field -> target model / cardinality. */
  readonly relations: ReadonlyMap<string, ReadonlyMap<string, RelationInfo>>;
}

export function buildSoftDeleteMeta(
  models: readonly DmmfModel[],
): SoftDeleteMeta {
  const softDeleteModels = new Set<string>();
  const relations = new Map<string, Map<string, RelationInfo>>();
  for (const model of models) {
    const rel = new Map<string, RelationInfo>();
    for (const field of model.fields) {
      if (field.name === SOFT_DELETE_FIELD && field.kind === 'scalar') {
        softDeleteModels.add(model.name);
      }
      if (field.kind === 'object') {
        rel.set(field.name, { target: field.type, isList: field.isList });
      }
    }
    relations.set(model.name, rel);
  }
  return { models: softDeleteModels, relations };
}

/** Built from the generated client's DMMF: adding `deleted_at` to a model
 * in schema.prisma is all it takes to get it filtered. */
export const SOFT_DELETE_META: SoftDeleteMeta = buildSoftDeleteMeta(
  Prisma.dmmf.datamodel.models,
);

type Where = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/** True when the where clause already constrains deleted_at itself —
 * top level or inside the AND / OR / NOT combinators. */
export function mentionsSoftDeleteField(where: unknown): boolean {
  if (Array.isArray(where)) return where.some(mentionsSoftDeleteField);
  if (!isPlainObject(where)) return false;
  if (where[SOFT_DELETE_FIELD] !== undefined) return true;
  return ['AND', 'OR', 'NOT'].some((op) => mentionsSoftDeleteField(where[op]));
}

function withLiveFilter(where: unknown): Where {
  const base = isPlainObject(where) ? where : {};
  if (mentionsSoftDeleteField(base)) return base;
  return { ...base, [SOFT_DELETE_FIELD]: null };
}

/** Opt-out: every row, live and soft-deleted. `deleted_at: {}` is an empty
 * filter (no SQL condition) that still counts as "mentioned". */
export function withDeleted<T extends object>(
  where: T = {} as T,
): T & { deleted_at: Record<string, never> } {
  return { ...where, deleted_at: {} };
}

/** Opt-out: soft-deleted rows only. */
export function onlyDeleted<T extends object>(
  where: T = {} as T,
): T & { deleted_at: { not: null } } {
  return { ...where, deleted_at: { not: null } };
}

/** Rewrites a to-many relation's include/select value so it only returns
 * live rows of a soft-delete target, and recurses into its own nested
 * include/select. */
function rewriteRelationArg(
  meta: SoftDeleteMeta,
  info: RelationInfo,
  value: unknown,
): unknown {
  if (value === false || value === undefined || value === null) return value;
  const filter = info.isList && meta.models.has(info.target);
  if (value === true) {
    return filter ? { where: { [SOFT_DELETE_FIELD]: null } } : value;
  }
  if (!isPlainObject(value)) return value;
  const next = rewriteNested(meta, info.target, value);
  if (filter) next.where = withLiveFilter(next.where);
  return next;
}

/** `_count: true` / `_count: { select: { rel: true } }` -> filtered counts
 * for to-many relations whose target soft-deletes. */
function rewriteCount(
  meta: SoftDeleteMeta,
  model: string,
  value: unknown,
): unknown {
  const relations = meta.relations.get(model);
  if (!relations) return value;
  if (value === true) {
    const listRelations = [...relations].filter(([, info]) => info.isList);
    if (!listRelations.some(([, info]) => meta.models.has(info.target))) {
      return value;
    }
    return {
      select: Object.fromEntries(
        listRelations.map(([field, info]) => [
          field,
          meta.models.has(info.target)
            ? { where: { [SOFT_DELETE_FIELD]: null } }
            : true,
        ]),
      ),
    };
  }
  if (!isPlainObject(value) || !isPlainObject(value.select)) return value;
  const select: Record<string, unknown> = {};
  for (const [field, arg] of Object.entries(value.select)) {
    const info = relations.get(field);
    if (!info || !meta.models.has(info.target) || arg === false) {
      select[field] = arg;
    } else if (arg === true) {
      select[field] = { where: { [SOFT_DELETE_FIELD]: null } };
    } else if (isPlainObject(arg)) {
      select[field] = { ...arg, where: withLiveFilter(arg.where) };
    } else {
      select[field] = arg;
    }
  }
  return { ...value, select };
}

function rewriteSelection(
  meta: SoftDeleteMeta,
  model: string,
  selection: unknown,
): unknown {
  if (!isPlainObject(selection)) return selection;
  const relations = meta.relations.get(model);
  if (!relations) return selection;
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(selection)) {
    if (field === '_count') {
      out[field] = rewriteCount(meta, model, value);
      continue;
    }
    const info = relations.get(field);
    out[field] = info ? rewriteRelationArg(meta, info, value) : value;
  }
  return out;
}

/** Returns a shallow copy of args with nested include/select rewritten. */
function rewriteNested(
  meta: SoftDeleteMeta,
  model: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...args };
  if (next.include !== undefined) {
    next.include = rewriteSelection(meta, model, next.include);
  }
  if (next.select !== undefined) {
    next.select = rewriteSelection(meta, model, next.select);
  }
  return next;
}

/** Pure args transform — the whole extension logic, unit-testable without
 * a database. */
export function applySoftDeleteToArgs(
  meta: SoftDeleteMeta,
  model: string,
  operation: string,
  args: unknown,
): unknown {
  const base = isPlainObject(args) ? args : {};
  const next = rewriteNested(meta, model, base);
  if (meta.models.has(model) && SOFT_DELETE_READ_OPERATIONS.has(operation)) {
    next.where = withLiveFilter(next.where);
  }
  // Leave args untouched (same reference, possibly undefined) when there
  // was nothing to rewrite — e.g. findMany() on a model without deleted_at.
  if (!isPlainObject(args)) {
    return Object.keys(next).length > 0 ? next : args;
  }
  return next;
}

export function softDeleteExtension(meta: SoftDeleteMeta = SOFT_DELETE_META) {
  return Prisma.defineExtension({
    name: 'soft-delete',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(
            applySoftDeleteToArgs(meta, model, operation, args) as typeof args,
          );
        },
      },
    },
  });
}
