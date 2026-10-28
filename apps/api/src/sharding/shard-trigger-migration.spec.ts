import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shardTriggerSql } from '../../scripts/generate-shard-trigger-migration';
import { SHARDED_MODELS } from './shard-manifest';

const MIGRATIONS = join(__dirname, '../../prisma/migrations');

/** Every migration.sql, oldest first. */
function allMigrationSql(): string {
  return readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((name) =>
      readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8'),
    )
    .join('\n');
}

/**
 * The shard_id triggers: 20261024150000_shard_map_and_triggers holds the
 * ones generated when the manifest was written; a model added later (deal
 * record 2026-10-27) carries its own trigger in its own migration, because
 * an applied migration file must never change. The generated SQL is the
 * source of truth for both: every generated line must exist somewhere.
 */
describe('shard_id trigger migration', () => {
  const sql = allMigrationSql();

  it('contains every trigger generated from the manifest', () => {
    // Regenerate with:
    //   npx ts-node --transpile-only scripts/generate-shard-trigger-migration.ts
    const missing = shardTriggerSql()
      .split('\n')
      .filter((line) => line.startsWith('CREATE TRIGGER'))
      .filter((line) => !sql.includes(line));
    expect(missing).toEqual([]);
  });

  it('has one trigger per sharded model', () => {
    // Distinct names: a later migration may re-create a trigger (a table
    // rebuilt for partitioning keeps its name).
    const names = new Set(sql.match(/CREATE TRIGGER "[a-z_]+_shard_fill"/g));
    expect(names.size).toBe(Object.keys(SHARDED_MODELS).length);
  });
});
