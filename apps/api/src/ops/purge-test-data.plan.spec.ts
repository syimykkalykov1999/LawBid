import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type ForeignKey } from './prelaunch-wipe.plan';
import {
  applyDb,
  deleteInBatches,
  type Db,
  type Fk,
  loadUsers,
  purgeCascadeViolations,
  survivors,
} from './purge-test-data.db';
import {
  chunks,
  CONFIRM_ALL_USERS,
  CONFIRM_KEEP_PHONES,
  maskPhone,
  normalisePhone,
  parsePurgeArgs,
  PURGE_ALSO_KEEP,
  PURGE_RESET_SQL,
  purgePlanFor,
  splitUsers,
  USER_ROW_TABLES,
  type UserRow,
} from './purge-test-data.plan';

/** Tables and foreign keys straight from prisma/schema.prisma (same parser
 * as prelaunch-wipe.plan.spec.ts). */
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

const user = (over: Partial<UserRow>): UserRow => ({
  id: 'u',
  role: 'client',
  phone: null,
  idPhones: [],
  username: null,
  created: null,
  isAdmin: false,
  ...over,
});

/** A Prisma stand-in that records every statement. */
function mockDb(
  query: (sql: string, params: unknown[]) => unknown[] = () => [],
  exec: (sql: string, params: unknown[]) => number = () => 0,
) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db: Db = {
    $queryRawUnsafe: jest.fn((sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
      return Promise.resolve(query(sql, params));
    }) as Db['$queryRawUnsafe'],
    $executeRawUnsafe: jest.fn((sql: string, ...params: unknown[]) => {
      calls.push({ sql, params });
      return Promise.resolve(exec(sql, params));
    }),
  };
  return { db, calls };
}

describe('purge test data — plan', () => {
  const { tables, fks } = schema();

  it('classifies every table of the schema', () => {
    expect(purgePlanFor(tables).unknown).toEqual([]);
  });

  it('keeps config, the admin panel, staff and the audit trail', () => {
    const plan = purgePlanFor(tables);
    for (const t of [
      'app_config',
      'feature_flags',
      'i18n_translations',
      'plans',
      'plan_prices',
      'legal_documents',
      'document_templates',
      'integration_credentials',
      'admin_profiles',
      'admin_credentials',
      'audit_log',
      'audit_log_chain_head',
      'work_leases',
      'staff_daily_stats',
      'demo_accounts',
    ]) {
      expect(plan.keep).toContain(t);
    }
    expect(plan.userRows).toEqual([...USER_ROW_TABLES].sort());
    expect(plan.filtered).toEqual(['files', 'sticker_packs', 'users']);
  });

  it('wipes users’ content', () => {
    const plan = purgePlanFor(tables);
    for (const t of [
      'posts',
      'comments',
      'post_likes',
      'cases',
      'bids',
      'conversations',
      'messages',
      'stories',
      'notifications',
      'push_tokens',
      'saved_items',
      'consultations',
      'video_assets',
      'follows',
      'attorney_profiles',
      'client_profiles',
      'usernames',
    ]) {
      expect(plan.wipe).toContain(t);
    }
  });

  it('TRUNCATE … CASCADE cannot reach a kept, user-row or filtered table', () => {
    expect(purgeCascadeViolations(fks, purgePlanFor(tables))).toEqual([]);
  });

  it('every extra kept table exists in the schema', () => {
    for (const t of [...Object.keys(PURGE_ALSO_KEEP), ...USER_ROW_TABLES]) {
      expect(tables).toContain(t);
    }
  });

  it('does not reset the audit chain (the audit log stays)', () => {
    expect(PURGE_RESET_SQL.some((s) => s.includes('audit_log'))).toBe(false);
    expect(PURGE_RESET_SQL.length).toBeGreaterThan(0);
  });
});

describe('purge test data — phones', () => {
  it.each([
    ['7739935153', '+17739935153'],
    ['17739935153', '+17739935153'],
    ['+1 (773) 993-5153', '+17739935153'],
    ['(224) 422-4434', '+12244224434'],
    ['+996555123456', '+996555123456'],
  ])('normalises %s', (raw, e164) => {
    expect(normalisePhone(raw)).toBe(e164);
  });

  it.each(['', 'abc', '12345', '27739935153'])('rejects %s', (raw) => {
    expect(normalisePhone(raw)).toBeNull();
  });

  it('masks all but the last four digits', () => {
    expect(maskPhone('+17739935153')).toBe('+*******5153');
    expect(maskPhone(null)).toBe('-');
  });
});

describe('purge test data — arguments', () => {
  it('refuses without a keep list or --all-users', () => {
    expect(() => parsePurgeArgs([])).toThrow(/--keep-phones/);
    expect(() => parsePurgeArgs(['--apply'])).toThrow(/refused/);
    expect(() => parsePurgeArgs(['--keep-phones='])).toThrow(/empty/);
  });

  it('refuses both modes at once and bad numbers', () => {
    expect(() =>
      parsePurgeArgs(['--all-users', '--keep-phones=7739935153']),
    ).toThrow(/not both/);
    expect(() => parsePurgeArgs(['--keep-phones=7739935153,12'])).toThrow(
      /not a phone/,
    );
  });

  it('is a dry run by default', () => {
    const a = parsePurgeArgs([
      '--keep-phones=7739935153,2244224434,8722720655',
    ]);
    expect(a.apply).toBe(false);
    expect(a.mode).toBe('keep_phones');
    expect(a.keepPhones).toEqual([
      '+17739935153',
      '+12244224434',
      '+18722720655',
    ]);
  });

  it('needs the matching confirmation to apply', () => {
    expect(() =>
      parsePurgeArgs(['--keep-phones=7739935153', '--apply']),
    ).toThrow(CONFIRM_KEEP_PHONES);
    expect(() =>
      parsePurgeArgs([
        '--keep-phones=7739935153',
        '--apply',
        `--confirm=${CONFIRM_ALL_USERS}`,
      ]),
    ).toThrow(/refused/);
    expect(() => parsePurgeArgs(['--all-users', '--apply'])).toThrow(
      CONFIRM_ALL_USERS,
    );
    expect(
      parsePurgeArgs([
        '--all-users',
        '--apply',
        `--confirm=${CONFIRM_ALL_USERS}`,
      ]).apply,
    ).toBe(true);
  });

  it('accepts phases and refuses unknown ones', () => {
    expect([...parsePurgeArgs(['--all-users', '--only=db,s3']).phases]).toEqual(
      ['db', 's3'],
    );
    expect(() => parsePurgeArgs(['--all-users', '--only=disk'])).toThrow(
      /unknown phase/,
    );
    expect(() => parsePurgeArgs(['--all-users', '--wat'])).toThrow(
      /unknown argument/,
    );
  });
});

describe('purge test data — KEEP / DELETE split', () => {
  const users = [
    user({ id: 'admin', role: 'admin' }),
    user({ id: 'staff', role: null, isAdmin: true }),
    user({ id: 'lawyer1', role: 'attorney', phone: '+17739935153' }),
    user({ id: 'lawyer2', role: 'attorney', idPhones: ['+12244224434'] }),
    user({ id: 'client', role: 'client', phone: '+13125550100' }),
    user({ id: 'partner', role: 'client' }),
    user({ id: 'assistant', role: 'assistant' }),
  ];

  it('keeps the listed phones, admins and referenced users', () => {
    const s = splitUsers(
      users,
      ['+17739935153', '2244224434'],
      new Set(['partner']),
    );
    expect(s.keep.map((k) => [k.user.id, k.reason])).toEqual([
      ['admin', 'admin'],
      ['staff', 'admin'],
      ['lawyer1', 'phone'],
      ['lawyer2', 'phone'],
      ['partner', 'referenced'],
    ]);
    expect(s.remove.map((u) => u.id)).toEqual(['client', 'assistant']);
  });

  it('removes every app user in --all-users mode, never an admin', () => {
    const s = splitUsers(users, null, new Set());
    expect(s.keep.map((k) => k.user.id)).toEqual(['admin', 'staff']);
    expect(s.remove.map((u) => u.id)).toEqual([
      'lawyer1',
      'lawyer2',
      'client',
      'partner',
      'assistant',
    ]);
  });

  it('reads users from the database (mocked Prisma)', async () => {
    const { db } = mockDb(() => [
      {
        id: 'u1',
        role: 'attorney',
        phone: '+17739935153',
        id_phones: null,
        username: 'lawyer',
        created: new Date('2026-10-01T00:00:00Z'),
        is_admin: false,
        status: 'active',
      },
    ]);
    const rows = await loadUsers(db);
    expect(rows).toEqual([
      expect.objectContaining({ id: 'u1', idPhones: [], isAdmin: false }),
    ]);
    expect(splitUsers(rows, ['7739935153'], new Set()).keep).toHaveLength(1);
  });
});

describe('purge test data — database steps (mocked Prisma)', () => {
  it('deletes in batches until a short batch', async () => {
    const left = [5000, 5000, 1200];
    const { db, calls } = mockDb(undefined, () => left.shift() ?? 0);
    const n = await deleteInBatches(db, 'users', 'TRUE', [], 5000);
    expect(n).toBe(11200);
    expect(calls).toHaveLength(3);
    expect(calls[0].sql).toContain('LIMIT 5000');
    expect(calls[0].sql).toContain('DELETE FROM "users" WHERE "id" IN (SELECT');
  });

  it('chunks lists', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(() => chunks([1], 0)).toThrow();
  });

  it('keeps users and files pinned by kept rows, to a fixpoint', async () => {
    const fks: Fk[] = [
      {
        fromTable: 'partners',
        fromColumn: 'user_id',
        toTable: 'users',
        onDelete: 'r',
      },
      {
        fromTable: 'webauthn_credentials',
        fromColumn: 'user_id',
        toTable: 'users',
        onDelete: 'c',
      },
      {
        fromTable: 'users',
        fromColumn: 'avatar_file_id',
        toTable: 'files',
        onDelete: 'r',
      },
      {
        fromTable: 'files',
        fromColumn: 'owner_user_id',
        toTable: 'users',
        onDelete: 'r',
      },
    ];
    const { db, calls } = mockDb((sql) => {
      if (sql.includes('FROM "partners"')) return [{ id: 'partner' }];
      if (sql.includes('FROM "users"')) return [{ id: 'f-avatar' }];
      if (sql.includes('FROM "files"')) return [{ id: 'partner' }];
      return [];
    });
    const plan = purgePlanFor([
      'partners',
      'webauthn_credentials',
      'users',
      'files',
    ]);
    const live = await survivors(db, plan, fks, ['admin']);
    expect([...live.users].sort()).toEqual(['admin', 'partner']);
    expect([...live.files]).toEqual(['f-avatar']);
    // A cascading key (passkeys) never pins a user.
    expect(calls.some((c) => c.sql.includes('webauthn_credentials'))).toBe(
      false,
    );
  });

  it('applies: truncate, sign-in rows, packs, avatars, files, users, counters', async () => {
    const { db, calls } = mockDb(undefined, () => 0);
    const plan = purgePlanFor([
      'posts',
      'sessions',
      'users',
      'files',
      'sticker_packs',
      'app_config',
    ]);
    const fks: Fk[] = [
      {
        fromTable: 'sessions',
        fromColumn: 'user_id',
        toTable: 'users',
        onDelete: 'r',
      },
      {
        fromTable: 'users',
        fromColumn: 'avatar_file_id',
        toTable: 'files',
        onDelete: 'r',
      },
    ];
    await applyDb(db, plan, fks, {
      users: new Set(['admin']),
      files: new Set(),
    });
    const sqls = calls.map((c) => c.sql.replace(/\s+/g, ' '));
    expect(sqls[0]).toBe('TRUNCATE "posts" CASCADE');
    expect(sqls[1]).toContain('DELETE FROM "sessions"');
    expect(sqls[2]).toContain('DELETE FROM "sticker_packs"');
    expect(sqls[3]).toContain('UPDATE "users" SET "avatar_file_id" = NULL');
    expect(sqls[4]).toContain('DELETE FROM "files"');
    expect(sqls[5]).toContain('DELETE FROM "users"');
    expect(sqls.some((s) => s.includes('app_config'))).toBe(false);
    for (const c of calls.slice(1, 6)) {
      if (c.params.length) expect(c.params[0]).toEqual(expect.any(Array));
    }
    expect(calls[5].params[0]).toEqual(['admin']);
  });
});
