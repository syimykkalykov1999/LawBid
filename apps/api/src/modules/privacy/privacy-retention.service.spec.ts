import type { Prisma } from '@prisma/client';
import { PrivacyRetentionService } from './privacy-retention.service';

/** R-39: the session IP blanking walks a partial index, never the table. */
function make(opts: {
  any: boolean;
  pages?: { scanned: number; updated: number }[];
  batch?: number;
}) {
  const sqls: Prisma.Sql[] = [];
  const pages = [...(opts.pages ?? [])];
  const prisma = {
    $queryRaw: jest.fn((q: Prisma.Sql) => {
      sqls.push(q);
      if (q.sql.includes('AS any')) return Promise.resolve([{ any: opts.any }]);
      const p = pages.shift() ?? { scanned: 0, updated: 0 };
      return Promise.resolve([
        {
          last_id: '00000000-0000-4000-8000-000000000001',
          last_at: new Date('2026-01-01T00:00:00Z'),
          scanned: BigInt(p.scanned),
          updated: BigInt(p.updated),
        },
      ]);
    }),
    $executeRaw: jest.fn(() => Promise.resolve(0)),
  };
  const days: Record<string, number> = {
    'privacy.retention_audit_log_days': 0,
    'privacy.retention_data_access_log_days': 0,
    'privacy.retention_session_ip_days': 90,
    'privacy.retention_contact_disclosure_ip_days': 0,
    'privacy.retention_batch': opts.batch ?? 5000,
    'privacy.retention_max_rows': 1_000_000,
  };
  const settings = {
    boolean: jest.fn(() => Promise.resolve(true)),
    number: jest.fn((k: string) => Promise.resolve(days[k] ?? 0)),
  };
  const svc = new PrivacyRetentionService(
    prisma as never,
    settings as never,
    { get: () => undefined } as never,
    { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() } as never,
  );
  return { svc, sqls };
}

describe('PrivacyRetentionService session IPs (R-39)', () => {
  it('an idle night costs one index probe and no batch', async () => {
    const { svc, sqls } = make({ any: false });
    expect((await svc.run())?.sessionIps).toBe(0);
    expect(sqls).toHaveLength(1);
    expect(sqls[0].sql).toContain('ip IS NOT NULL OR user_agent IS NOT NULL');
  });

  it('walks the partial index by keyset (created_at, id), batch from the setting', async () => {
    const { svc, sqls } = make({
      any: true,
      batch: 200,
      pages: [
        { scanned: 200, updated: 150 },
        { scanned: 10, updated: 10 },
      ],
    });
    expect((await svc.run())?.sessionIps).toBe(160);
    const batches = sqls.filter((q) => q.sql.includes('WITH batch'));
    expect(batches).toHaveLength(2);
    expect(batches[0].sql).toContain('ORDER BY created_at, id');
    expect(batches[0].sql).not.toContain('(created_at, id) >');
    expect(batches[1].sql).toContain('(created_at, id) >');
    expect(batches[0].values).toContain(200);
    expect(batches[0].sql).not.toMatch(/WHERE id >/);
  });
});
