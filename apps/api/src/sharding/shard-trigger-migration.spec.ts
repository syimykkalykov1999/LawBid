import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shardTriggerSql } from '../../scripts/generate-shard-trigger-migration';
import { SHARDED_MODELS } from './shard-manifest';

const migration = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20261024150000_shard_map_and_triggers/migration.sql',
  ),
  'utf8',
);

describe('shard_id trigger migration', () => {
  it('contains exactly the triggers generated from the manifest', () => {
    // Regenerate with:
    //   npx ts-node --transpile-only scripts/generate-shard-trigger-migration.ts
    expect(migration.endsWith(shardTriggerSql() + '\n')).toBe(true);
  });

  it('has one trigger per sharded model', () => {
    const n = (migration.match(/CREATE TRIGGER/g) ?? []).length;
    expect(n).toBe(Object.keys(SHARDED_MODELS).length);
  });
});
