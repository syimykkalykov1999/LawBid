/**
 * Generates the trigger part of migration 20261024150000_shard_map_and_triggers
 * from src/sharding/shard-manifest.ts + the Prisma DMMF (table / column names).
 *
 *   npx ts-node --transpile-only scripts/generate-shard-trigger-migration.ts
 *
 * Prints one trigger per sharded table. The committed migration holds this
 * output after the hand-written shard_map DDL and the trigger function;
 * `src/sharding/shard-trigger-migration.spec.ts` fails when they drift.
 */
import { Prisma } from '@prisma/client';
import { SHARDED_MODELS } from '../src/sharding/shard-manifest';

export function shardTriggerSql(): string {
  const models = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
  const table = (name: string) => models.get(name)!.dbName ?? name;
  const column = (model: string, field: string) => {
    const f = models.get(model)!.fields.find((x) => x.name === field)!;
    return f.dbName ?? f.name;
  };
  const lines: string[] = [];
  const names = Object.keys(SHARDED_MODELS).sort((a, b) =>
    table(a).localeCompare(table(b)),
  );
  for (const name of names) {
    const args = SHARDED_MODELS[name].keys
      .map((k) =>
        k.kind === 'owner'
          ? `'owner', '${column(name, k.field)}', ''`
          : `'parent', '${column(name, k.field)}', '${table(k.model)}'`,
      )
      .join(', ');
    const t = table(name);
    lines.push(
      `DROP TRIGGER IF EXISTS "${t}_shard_fill" ON "${t}";`,
      `CREATE TRIGGER "${t}_shard_fill" BEFORE INSERT ON "${t}" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill(${args});`,
    );
  }
  return lines.join('\n');
}

if (require.main === module) {
  process.stdout.write(shardTriggerSql() + '\n');
}
