import { Prisma } from '@prisma/client';
import { hashShard, isShardedId, shardOf } from './shard-id';
import { SHARDED_MODELS } from './shard-manifest';

/**
 * Shard-ready steps 4 and 7: finds the logical shard of a query from the
 * query itself, for the calls that run WITHOUT a (strong) shard context:
 * jobs, webhooks, sockets, scripts and tests that name the entity in the
 * arguments instead of in a route.
 *
 *  - `create` / `createMany` / `upsert`: from `data` (or `create`): the
 *    manifest keys, in order (`client_id` -> hashShard, `case_id` -> the
 *    parent's shard read from its UUIDv8 id), the same rule the shard
 *    extension uses to stamp `shard_id`;
 *  - reads / updates / deletes: from the same key columns in `where`
 *    (equality, `equals`, `in` with one shard, compound unique keys, `AND`),
 *    else from `where.id` when that id is a sharded UUIDv8.
 *
 * Returns undefined when nothing identifies the shard (the caller then keeps
 * the context / primary database, exactly as before). Pure and synchronous.
 */
type Obj = Record<string, unknown>;

interface Meta {
  readonly keys: ReadonlyArray<{ field: string; owner: boolean }>;
  readonly relationOf: ReadonlyMap<string, string>;
}

let cache: Map<string, Meta> | null = null;

function metaOf(model: string): Meta | undefined {
  if (!cache) {
    cache = new Map();
    for (const m of Prisma.dmmf.datamodel.models) {
      const spec = SHARDED_MODELS[m.name];
      if (!spec) continue;
      const relationOf = new Map<string, string>();
      for (const f of m.fields) {
        if (f.kind === 'object' && f.relationFromFields?.length === 1) {
          relationOf.set(f.relationFromFields[0], f.name);
        }
      }
      cache.set(m.name, {
        keys: spec.keys.map((k) => ({
          field: k.field,
          owner: k.kind === 'owner',
        })),
        relationOf,
      });
    }
  }
  return cache.get(model);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** One uuid string a filter pins a column to, or null. */
function pinned(v: unknown): string | null {
  if (typeof v === 'string') return UUID_RE.test(v) ? v : null;
  if (!isObj(v)) return null;
  if (typeof v.equals === 'string') return pinned(v.equals);
  if (Array.isArray(v.in) && v.in.length > 0) {
    const first = pinned(v.in[0]);
    return first;
  }
  return null;
}

function find(
  obj: Obj,
  field: string,
  relation: string | undefined,
  depth = 0,
): string | null {
  const direct = pinned(obj[field]);
  if (direct) return direct;
  if (relation) {
    const rel = obj[relation];
    if (isObj(rel) && isObj(rel.connect)) {
      const id = pinned(rel.connect.id);
      if (id) return id;
    }
  }
  if (depth > 1) return null;
  // Compound unique keys: { case_id_attorney_id: { case_id, attorney_id } }.
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'NOT' || k === 'OR') continue; // do not pin a shard
    if (isObj(v) && !('in' in v) && !('equals' in v)) {
      const hit = find(v, field, undefined, depth + 1);
      if (hit) return hit;
    }
  }
  const and = obj.AND;
  const parts = Array.isArray(and) ? and : isObj(and) ? [and] : [];
  for (const p of parts) {
    if (isObj(p)) {
      const hit = find(p, field, relation, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

function shardFrom(meta: Meta, obj: Obj, withId: boolean): number | undefined {
  for (const key of meta.keys) {
    const value = find(obj, key.field, meta.relationOf.get(key.field));
    if (!value) continue;
    return key.owner ? hashShard(value) : shardOf(value);
  }
  if (withId) {
    const id = pinned(obj.id);
    if (id && isShardedId(id)) return shardOf(id);
  }
  return undefined;
}

export function shardFromArgs(
  model: string,
  operation: string,
  args: unknown,
): number | undefined {
  const meta = metaOf(model);
  if (!meta || !isObj(args)) return undefined;
  try {
    switch (operation) {
      case 'create':
      case 'createMany':
      case 'createManyAndReturn': {
        const data: unknown = Array.isArray(args.data)
          ? (args.data[0] as unknown)
          : args.data;
        return isObj(data) ? shardFrom(meta, data, false) : undefined;
      }
      case 'upsert': {
        const fromCreate = isObj(args.create)
          ? shardFrom(meta, args.create, false)
          : undefined;
        if (fromCreate !== undefined) return fromCreate;
        return isObj(args.where)
          ? shardFrom(meta, args.where, true)
          : undefined;
      }
      default:
        return isObj(args.where)
          ? shardFrom(meta, args.where, true)
          : undefined;
    }
  } catch {
    return undefined;
  }
}
