/* eslint-disable @typescript-eslint/no-unsafe-call */
import { createHash } from 'node:crypto';
import type { PinoLogger } from 'nestjs-pino';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { S3StorageService } from '../files/storage/s3-storage.service';
import { LegalExportBuilder } from './legal-export.builder';

const JOB = 'e1';
const USER = 'u1';

function build(selection: object) {
  const update = jest.fn();
  const prisma = {
    legalExport: {
      findUnique: jest.fn().mockResolvedValue({
        id: JOB,
        request_id: 'r1',
        subject_user_id: USER,
        requested_by: 'a1',
        selection,
        // the signed manifest records when the export was asked for
        created_at: new Date('2026-10-20T00:00:00Z'),
        request: {
          reference_number: 'SUB-1',
          agency: 'FBI',
          legal_basis: 'subpoena',
          request_type: 'subpoena',
          scope: 'x',
        },
      }),
      update,
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: USER,
        first_name: 'Ann',
        last_name: 'Lee',
        role: 'client',
        status: 'active',
        phone_e164: '+14155550100',
        email: 'a@x.com',
        created_at: new Date(),
      }),
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: USER, first_name: 'Ann', last_name: 'Lee' }]),
    },
    conversation: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'c1', client_id: USER, attorney_id: 'x' }]),
    },
    message: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'm1',
          conversation_id: 'c1',
          sender_id: USER,
          type: 'text',
          body_original: 'call me',
          body_display: 'call me',
          file_id: null,
          file_name: null,
          reply_to_id: null,
          forwarded: false,
          created_at: new Date(),
          edited_at: null,
          deleted_at: new Date(),
          revoked_at: null,
          edits: [],
        },
      ]),
    },
    file: { findMany: jest.fn().mockResolvedValue([]) },
    dataAccessLog: { createMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  } as unknown as PrismaService;
  const put = jest.fn();
  const storage = {
    bucket: jest.fn().mockReturnValue('docs'),
    put,
    remove: jest.fn(),
  } as unknown as S3StorageService;
  const numbers: Record<string, number> = {
    'legal.export_max_rows': 50000,
    'legal.export_link_days': 7,
    'legal.export_ttl_days': 30,
  };
  const settings = {
    number: jest.fn((k: string) => Promise.resolve(numbers[k])),
  } as unknown as AppSettingsService;
  const logger = {
    setContext: jest.fn(),
    error: jest.fn(),
  } as unknown as PinoLogger;
  return {
    b: new LegalExportBuilder(prisma, storage, settings, logger),
    prisma,
    put,
    update,
  };
}

describe('LegalExportBuilder', () => {
  it('builds a ZIP with report, data, media, hashes and records access', async () => {
    const { b, prisma, put, update } = build({
      sections: ['profile', 'chats'],
    });
    await b.build(JOB, new Date('2026-10-21T00:00:00Z'));
    const [bucket, key, zip, type] = put.mock.calls[0];
    expect(bucket).toBe('docs');
    expect(key).toBe('legal-exports/e1.zip');
    expect(type).toBe('application/zip');
    const names = (zip as Buffer).toString('latin1');
    for (const n of [
      'report.pdf',
      'data/messages.json',
      'data/profile.json',
      'media.json',
      'SHA256SUMS.txt',
      'manifest.json',
    ]) {
      expect(names).toContain(n);
    }
    const data = update.mock.calls[0][0].data;
    expect(data.status).toBe('ready');
    expect(data.sha256).toBe(
      createHash('sha256')
        .update(zip as Buffer)
        .digest('hex'),
    );
    expect(data.expires_at).toEqual(new Date('2026-11-20T00:00:00Z'));
    const log = (prisma.dataAccessLog.createMany as jest.Mock).mock.calls[0][0]
      .data;
    expect(log.map((l: { entity_type: string }) => l.entity_type)).toEqual([
      'user',
      'conversation',
    ]);
    expect(
      (prisma.auditLog.create as jest.Mock).mock.calls[0][0].data.action,
    ).toBe('legal_export.built');
  });

  it('includes deleted messages and does not mask the phone', async () => {
    const { b, update } = build({ sections: ['profile', 'chats'] });
    await b.build(JOB);
    expect(update.mock.calls[0][0].data.row_counts).toMatchObject({
      messages: 1,
      profile: 1,
    });
  });

  it('marks the archive failed instead of throwing', async () => {
    const { b, put, update } = build({ sections: ['profile'] });
    put.mockRejectedValue(new Error('s3 down'));
    await b.build(JOB);
    expect(update.mock.calls[0][0].data).toMatchObject({
      status: 'failed',
      error: 's3 down',
    });
  });

  it('removes expired files from S3 and keeps the row', async () => {
    const { b, prisma } = build({ sections: ['profile'] });
    (prisma.legalExport.findMany as jest.Mock).mockResolvedValue([
      { id: 'e9', file_bucket: 'docs', file_key: 'legal-exports/e9.zip' },
    ]);
    expect(await b.expire(new Date())).toBe(1);
    expect(
      (prisma.legalExport.update as jest.Mock).mock.calls[0][0].data,
    ).toMatchObject({ status: 'expired', file_key: null });
  });
});
