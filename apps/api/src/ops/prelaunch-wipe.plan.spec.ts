import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cascadeViolations,
  FILTERED_TABLES,
  type ForeignKey,
  KEEP_TABLES,
  overlaps,
  planFor,
  redisGroup,
  redisKeyKept,
  s3KeyKept,
  SOFT_USER_REFS,
  WIPE_TABLES,
} from './prelaunch-wipe.plan';

/** Tables and foreign keys straight from prisma/schema.prisma. */
function schema(): { tables: string[]; fks: ForeignKey[] } {
  const src = readFileSync(
    join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
    'utf8',
  );
  const tableOf = new Map<string, string>();
  const bodies = new Map<string, string>();
  for (const m of src.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const map = /@@map\("([^"]+)"\)/.exec(m[2]);
    tableOf.set(m[1], map ? map[1] : m[1]);
    bodies.set(m[1], m[2]);
  }
  const fks: ForeignKey[] = [];
  for (const [model, body] of bodies) {
    for (const line of body.split('\n')) {
      const r = /^\s*\w+\s+(\w+)\??\s.*@relation\(.*fields:\s*\[(\w+)/.exec(
        line,
      );
      if (!r) continue;
      fks.push({
        fromTable: tableOf.get(model)!,
        fromColumn: r[2],
        toTable: tableOf.get(r[1])!,
      });
    }
  }
  return { tables: [...tableOf.values(), '_prisma_migrations'], fks };
}

describe('prelaunch wipe plan', () => {
  const { tables, fks } = schema();

  it('lists every table of the schema exactly once', () => {
    expect(overlaps()).toEqual([]);
    const plan = planFor(tables);
    expect(plan.unknown).toEqual([]);
    expect(plan.missing).toEqual([]);
  });

  it('keeps the launch configuration and admins', () => {
    for (const t of [
      'app_config',
      'feature_flags',
      'countries',
      'legal_documents',
      'email_templates',
      'i18n_translations',
      'plans',
      'plan_prices',
      'admin_profiles',
      'admin_credentials',
      'integration_credentials',
    ]) {
      expect(KEEP_TABLES[t]).toBeDefined();
    }
    expect(FILTERED_TABLES.users).toBeDefined();
    expect(FILTERED_TABLES.files).toBeDefined();
  });

  it('wipes the user-generated data', () => {
    for (const t of [
      'sessions',
      'auth_events',
      'user_identifiers',
      'cases',
      'bids',
      'conversations',
      'messages',
      'posts',
      'notifications',
      'payments',
      'push_tokens',
      'video_assets',
    ]) {
      expect(WIPE_TABLES[t]).toBeDefined();
    }
  });

  it('TRUNCATE … CASCADE cannot reach a kept or filtered table', () => {
    const plan = planFor(tables);
    expect(cascadeViolations(fks, plan.wipe)).toEqual([]);
  });

  it('flags a foreign key from a kept table into the wipe list', () => {
    expect(
      cascadeViolations(
        [{ fromTable: 'app_config', fromColumn: 'x', toTable: 'cases' }],
        ['cases'],
      ),
    ).toHaveLength(1);
  });

  it('stops on a table nobody classified', () => {
    expect(planFor(['app_config', 'brand_new_table']).unknown).toEqual([
      'brand_new_table',
    ]);
  });

  it('soft user references point at kept tables', () => {
    for (const r of SOFT_USER_REFS) expect(KEEP_TABLES[r.table]).toBeDefined();
  });

  it('keeps kept files, their variants and the demo prefix in S3', () => {
    const kept = new Set(['sticker/u1/f1']);
    expect(s3KeyKept('sticker/u1/f1', kept)).toBe(true);
    expect(s3KeyKept('sticker/u1/f1_w256', kept)).toBe(true);
    expect(s3KeyKept('demo/avatar/u/f', kept)).toBe(true);
    expect(s3KeyKept('avatar/u2/f2', kept)).toBe(false);
    expect(s3KeyKept('exports/user-data/u2/x.zip', kept)).toBe(false);
  });

  it('flushes tester keys but keeps spend counters and queues in Redis', () => {
    expect(redisKeyKept('budget:{sms}:d:20261007')).toBe(true);
    expect(redisKeyKept('bull:cron:repeat:x')).toBe(true);
    expect(redisKeyKept('otp:code:abc')).toBe(false);
    expect(redisKeyKept('presence:u1')).toBe(false);
    expect(redisGroup('otp:code:abc')).toBe('otp:*');
    expect(redisGroup('cv:pending')).toBe('cv:*');
  });
});
