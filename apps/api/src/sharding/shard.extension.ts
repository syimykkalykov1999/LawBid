import { Prisma, PrismaClient } from '@prisma/client';
import { hashShard, isShardedId, newShardedId, shardOf } from './shard-id';
import { SHARDED_MODELS, ShardKey } from './shard-manifest';

/**
 * Shard-ready steps 1 and 2 (docs/architecture/SHARDING_READY.md §4): a
 * Prisma client extension that, on create, gives every NEW row of a sharded
 * family (case / user / content, see shard-manifest.ts)
 *
 *  - a UUIDv8 `id` carrying its logical shard (only when the caller did not
 *    pass an id and the model's id column defaults to gen_random_uuid()),
 *  - the `shard_id` column.
 *
 * The shard is found from the manifest keys, in order:
 *  - owner key  -> hashShard(owner user id)       (Case: client_id)
 *  - parent key -> the parent's shard             (children inherit): read
 *                  from the parent's UUIDv8 id; for a legacy v4 parent the
 *                  parent's `shard_id` is looked up (`lookupParentShard`)
 * No key in the data (e.g. a nested relation create) -> shard 0 and the
 * database defaults (`shard_id` 0, v4 id): same as before this change.
 *
 * Covers create, createMany, createManyAndReturn and the create branch of
 * upsert. Does not see: nested writes (`data: { children: { create } }`),
 * raw SQL inserts. Those rows keep the DB defaults (shard_id 0).
 *
 * Kill switch: SHARD_IDS=off restores plain gen_random_uuid() ids and
 * shard_id 0.
 */

export type ParentShardLookup = (
  model: string,
  id: string,
) => Promise<number | null>;

/**
 * Reads a parent's stored `shard_id` through the RAW client (no extensions:
 * no soft-delete filter, no recursion). Only used for legacy parents whose
 * id is a random v4 uuid, i.e. rows created before this change.
 */
export function parentShardLookup(client: PrismaClient): ParentShardLookup {
  return async (model, id) => {
    const delegate = (
      client as unknown as Record<
        string,
        {
          findFirst(a: unknown): Promise<{ shard_id: number } | null>;
        }
      >
    )[model[0].toLowerCase() + model.slice(1)];
    // findFirst: a model with a composite key has no unique `id` filter.
    const row = await delegate.findFirst({
      where: { id },
      select: { shard_id: true },
    });
    return row?.shard_id ?? null;
  };
}

interface ModelMeta {
  readonly keys: readonly ShardKey[];
  /** key field -> relation field name (to read `{ rel: { connect: { id } } }`) */
  readonly relationOf: ReadonlyMap<string, string>;
  /** the id column is a uuid with a DB default we can replace */
  readonly generateId: boolean;
}

let metaCache: Map<string, ModelMeta> | null = null;

function metaFor(model: string): ModelMeta | undefined {
  if (!metaCache) {
    metaCache = new Map();
    for (const m of Prisma.dmmf.datamodel.models) {
      const spec = SHARDED_MODELS[m.name];
      if (!spec) continue;
      const relationOf = new Map<string, string>();
      for (const f of m.fields) {
        if (f.kind === 'object' && f.relationFromFields?.length === 1) {
          relationOf.set(f.relationFromFields[0], f.name);
        }
      }
      // `isId` is false for a composite key (@@id([id, conversation_id]) on
      // the hash partitioned messages / notifications): the column called
      // `id` is still the row's own uuid.
      const idField =
        m.fields.find((f) => f.isId) ??
        m.fields.find((f) => f.name === 'id' && f.kind === 'scalar');
      const def = idField?.default as
        { name?: string; args?: unknown[] } | undefined;
      const generateId =
        !!idField &&
        idField.name === 'id' &&
        idField.type === 'String' &&
        def?.name === 'dbgenerated' &&
        (def.args ?? []).some((a) => String(a).includes('gen_random_uuid'));
      metaCache.set(m.name, { keys: spec.keys, relationOf, generateId });
    }
  }
  return metaCache.get(model);
}

type Row = Record<string, unknown>;

function readKey(
  data: Row,
  field: string,
  relation: string | undefined,
): string | null {
  const direct = data[field];
  if (typeof direct === 'string') return direct;
  if (relation) {
    const rel = data[relation] as { connect?: { id?: unknown } } | undefined;
    const id = rel?.connect?.id;
    if (typeof id === 'string') return id;
  }
  return null;
}

async function resolveShard(
  meta: ModelMeta,
  data: Row,
  lookup: ParentShardLookup,
): Promise<number | null> {
  for (const key of meta.keys) {
    const value = readKey(data, key.field, meta.relationOf.get(key.field));
    if (!value) continue;
    try {
      if (key.kind === 'owner') return hashShard(value);
      if (isShardedId(value)) return shardOf(value);
      // Legacy v4 parent: its stored shard_id is the truth.
      const stored = await lookup(key.model, value);
      return stored ?? hashShard(value);
    } catch {
      // Not a uuid: let the database reject it as it always did.
      continue;
    }
  }
  return null;
}

async function stamp(
  model: string,
  data: Row,
  lookup: ParentShardLookup,
): Promise<Row> {
  const meta = metaFor(model);
  if (!meta) return data;
  const shard = await resolveShard(meta, data, lookup);
  const out: Row = { ...data };
  if (shard !== null && out.shard_id === undefined) out.shard_id = shard;
  if (meta.generateId && out.id === undefined) {
    out.id = newShardedId(shard ?? 0);
  }
  return out;
}

export function shardIdsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.SHARD_IDS ?? '').trim().toLowerCase() !== 'off';
}

interface OperationParams {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: never) => Promise<unknown>;
}

/** The `$allOperations` handler (exported for unit tests). */
export function shardOperationHandler(
  lookupParentShard: ParentShardLookup,
  enabled: () => boolean = shardIdsEnabled,
) {
  return async ({
    model,
    operation,
    args,
    query,
  }: OperationParams): Promise<unknown> => {
    const run = (a: unknown) => query(a as never);
    if (!model || !metaFor(model) || !enabled()) return run(args);
    const a = args as Row;
    switch (operation) {
      case 'create':
        return run({
          ...a,
          data: await stamp(model, a.data as Row, lookupParentShard),
        });
      case 'createMany':
      case 'createManyAndReturn': {
        const data = a.data as Row | Row[];
        const stamped = Array.isArray(data)
          ? await Promise.all(
              data.map((d) => stamp(model, d, lookupParentShard)),
            )
          : await stamp(model, data, lookupParentShard);
        return run({ ...a, data: stamped });
      }
      case 'upsert':
        return run({
          ...a,
          create: await stamp(model, a.create as Row, lookupParentShard),
        });
      default:
        return run(args);
    }
  };
}

export function shardExtension(
  lookupParentShard: ParentShardLookup,
  enabled: () => boolean = shardIdsEnabled,
) {
  const handler = shardOperationHandler(lookupParentShard, enabled);
  return Prisma.defineExtension({
    name: 'shard-ids',
    query: {
      async $allOperations({ model, operation, args, query }) {
        return handler({
          model,
          operation,
          args,
          query: query as OperationParams['query'],
        });
      },
    },
  });
}
