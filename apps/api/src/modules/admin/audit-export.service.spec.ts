import type { ConfigService } from '@nestjs/config';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import {
  AuditExportService,
  AUDIT_EXPORT_CURSOR_KEY,
} from './audit-export.service';

const row = (seq: number) => ({
  seq: BigInt(seq),
  id: `id-${seq}`,
  admin_id: 'a1',
  action: 'admin.login',
  target_type: 'admin',
  target_id: null,
  justification: null,
  reason_code: null,
  before: null,
  after: { method: 'totp' },
  ip: '203.0.113.9',
  created_at: new Date('2026-10-28T01:00:00Z'),
  prev_hash: seq > 1 ? `h${seq - 1}` : null,
  row_hash: `h${seq}`,
});

function make(opts: {
  bucket?: string;
  enabled?: boolean;
  cursor?: number;
  rows?: number[];
  broken?: number | null;
}) {
  const rows = (opts.rows ?? []).map(row);
  const prisma = {
    appConfig: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.cursor ? { value: { seq: opts.cursor } } : null,
        ),
      upsert: jest.fn().mockResolvedValue(undefined),
    },
    auditLog: {
      findMany: jest
        .fn()
        .mockImplementation((a: { where: { seq: { gt: number } } }) =>
          Promise.resolve(rows.filter((r) => Number(r.seq) > a.where.seq.gt)),
        ),
    },
  };
  const audit = {
    verifyChain: jest.fn().mockResolvedValue({
      checked: rows.length,
      brokenAtSeq: opts.broken ?? null,
      headHash: 'h',
      headSeq: rows.length,
    }),
  };
  const config = {
    get: (k: string) =>
      k === 'ADMIN_AUDIT_EXPORT_BUCKET' ? opts.bucket : undefined,
  };
  const settings = {
    boolean: jest.fn().mockResolvedValue(opts.enabled ?? true),
  };
  const svc = new AuditExportService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditLogService,
    config as unknown as ConfigService,
    settings as unknown as AppSettingsService,
  );
  const put = jest.fn().mockResolvedValue(undefined);
  svc.useUploader({ put });
  return { svc, prisma, put, audit };
}

describe('AuditExportService (owner 2026-10-28)', () => {
  it('does nothing without a bucket', async () => {
    const t = make({ rows: [1] });
    expect(await t.svc.run()).toMatchObject({
      skipped: 'no bucket configured',
    });
    expect(t.put).not.toHaveBeenCalled();
  });

  it('does nothing when switched off', async () => {
    const t = make({ bucket: 'b', enabled: false, rows: [1] });
    expect(await t.svc.run()).toMatchObject({ skipped: 'switched off' });
    expect(t.put).not.toHaveBeenCalled();
  });

  it('uploads only rows after the cursor, one JSON line per row with hashes', async () => {
    const t = make({ bucket: 'audit-bucket', cursor: 2, rows: [1, 2, 3, 4] });
    const r = await t.svc.run(new Date('2026-10-28T01:30:00Z'));
    expect(r).toMatchObject({ files: 1, rows: 2, lastSeq: 4 });
    const [bucket, key, body] = t.put.mock.calls[0];
    expect(bucket).toBe('audit-bucket');
    expect(key).toBe('admin-audit/2026/10/28/audit-3-4.jsonl');
    const lines = (body as string)
      .trim()
      .split('\n')
      .map(
        (l) =>
          JSON.parse(l) as { seq: number; prevHash: string; rowHash: string },
      );
    expect(lines.map((l) => l.seq)).toEqual([3, 4]);
    expect(lines[0]).toMatchObject({ prevHash: 'h2', rowHash: 'h3' });
    expect(t.prisma.appConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: AUDIT_EXPORT_CURSOR_KEY },
        update: { value: { seq: 4 } },
      }),
    );
  });

  it('keeps the cursor when the upload fails (a retry re-sends, never skips)', async () => {
    const t = make({ bucket: 'b', rows: [1, 2] });
    t.put.mockRejectedValue(new Error('S3 down'));
    await expect(t.svc.run()).rejects.toThrow('S3 down');
    expect(t.prisma.appConfig.upsert).not.toHaveBeenCalled();
  });

  it('nothing new → no file', async () => {
    const t = make({ bucket: 'b', cursor: 2, rows: [1, 2] });
    expect(await t.svc.run()).toMatchObject({ files: 0, rows: 0 });
    expect(t.put).not.toHaveBeenCalled();
  });

  it('reports a broken chain but still exports', async () => {
    const t = make({ bucket: 'b', rows: [1, 2], broken: 2 });
    expect(await t.svc.run()).toMatchObject({ chainBrokenAtSeq: 2, rows: 2 });
  });
});
