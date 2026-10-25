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
