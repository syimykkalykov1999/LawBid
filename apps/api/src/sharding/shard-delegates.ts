import { Prisma } from '@prisma/client';
import { ShardFamily, familyOf } from './shard-manifest';

/**
 * Prisma delegate property name (`case`, `callLogHidden` ...) -> the model
 * and its shard family. PrismaService uses it to send a query on a GLOBAL
 * model to the primary database whatever the shard context says, and to
 * count queries on sharded models that have no context.
 */
export interface DelegateInfo {
  readonly model: string;
  readonly family: ShardFamily;
}

let cache: Map<string, DelegateInfo> | null = null;

export function delegateInfo(prop: string): DelegateInfo | undefined {
  if (!cache) {
    cache = new Map();
    for (const m of Prisma.dmmf.datamodel.models) {
      const family = familyOf(m.name);
      if (!family) continue;
      cache.set(m.name[0].toLowerCase() + m.name.slice(1), {
        model: m.name,
        family,
      });
    }
  }
  return cache.get(prop);
}

let tables: Map<string, ShardFamily> | null = null;

/** Table name (as in SQL: `@@map` or the model name) -> shard family. */
function tableFamilies(): Map<string, ShardFamily> {
  if (!tables) {
    tables = new Map();
    for (const m of Prisma.dmmf.datamodel.models) {
      const family = familyOf(m.name);
      if (!family) continue;
      tables.set((m.dbName ?? m.name).toLowerCase(), family);
    }
  }
  return tables;
}

/**
 * Two databases (SHARDING_READY step 8): a hand-written SQL statement that
 * names ONLY global tables (users, profiles, practice areas, translations
 * ...) belongs on the primary database, whatever shard the request is in —
 * the same rule the router applies to model delegates, and how Vitess /
 * Citus route a query on reference tables. Conservative: every word of the
 * text that is a known table name counts, so one sharded table anywhere
 * (also in a nested fragment or a column-like word) keeps the old routing;
 * text naming no known table keeps it too.
 */
export function rawSqlIsGlobalOnly(sql: string): boolean {
  const map = tableFamilies();
  let sawGlobal = false;
  for (const word of sql.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? []) {
    const family = map.get(word);
    if (family === undefined) continue;
    if (family !== 'global') return false;
    sawGlobal = true;
  }
  return sawGlobal;
}

/** The SQL text of a `$queryRaw` / `$executeRaw` / `...Unsafe` call:
 * template strings plus nested `Prisma.sql` fragments, or the plain string. */
export function rawSqlText(args: readonly unknown[]): string {
  const [first, ...values] = args;
  if (typeof first === 'string') return first;
  const parts: string[] = [];
  const add = (v: unknown): void => {
    if (v && typeof v === 'object') {
      const o = v as { sql?: unknown; strings?: unknown; raw?: unknown };
      if (typeof o.sql === 'string') parts.push(o.sql);
      else if (Array.isArray(o.strings)) parts.push(o.strings.join(' '));
      else if (Array.isArray(v)) parts.push((v as unknown[]).join(' '));
    }
  };
  add(first);
  for (const v of values) add(v);
  return parts.join(' ');
}
