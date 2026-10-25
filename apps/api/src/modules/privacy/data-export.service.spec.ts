import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { DataExportService } from './data-export.service';

jest.setTimeout(180_000);

const MESSAGES = 50_000;

/** 50 000 own messages of ~2 KB, served by cursor like Prisma would. */
function messagePage(args: {
  take: number;
  cursor?: { id: string };
  skip?: number;
}) {
  const start = args.cursor
    ? Number(args.cursor.id.slice(1)) + (args.skip ?? 0)
    : 0;
  const out = [];
  for (let i = start; i < Math.min(MESSAGES, start + args.take); i++) {
    out.push({
      id: `m${i}`,
      conversation_id: 'c1',
      type: 'text',
      body_original: randomBytes(1000).toString('hex'),
      file_id: null,
      duration_ms: null,
      created_at: new Date(1_700_000_000_000 + i * 1000),
    });
  }
  return Promise.resolve(out);
}

function build() {
  const empty = jest.fn().mockResolvedValue([]);
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    dataExportJob: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'e1',
        type: 'user_data',
        user_id: 'u1',
        user: {
          email: null,
          email_verified_at: null,
          status: 'active',
          ui_language: 'en',
        },
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update,
    },
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) },
    clientProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    attorneyProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    userConsent: { findMany: empty },
    userPrivacySettings: { findUnique: jest.fn().mockResolvedValue(null) },
    session: { findMany: empty },
    case: { findMany: empty },
    bid: { findMany: empty },
    post: { findMany: empty },
    comment: { findMany: empty },
    caseComment: { findMany: empty },
    postLike: { findMany: empty },
    commentLike: { findMany: empty },
    caseCommentLike: { findMany: empty },
    message: { findMany: jest.fn(messagePage) },
    file: { create: jest.fn().mockResolvedValue({ id: 'f1' }) },
  };
  let streamed = 0;
  const storage = {
    bucket: () => 'docs',
    putStream: jest.fn(async (_b: string, _k: string, body: Readable) => {
      for await (const c of body) streamed += (c as Buffer).length;
    }),
  };
  const notifications = { emit: jest.fn() };
  const svc = new DataExportService(
    prisma as never,
    storage as never,
    notifications as never,
    { get: () => undefined } as never,
    { sendEmail: jest.fn() } as never,
    { setContext: jest.fn(), warn: jest.fn() } as never,
  );
  return { svc, prisma, storage, notifications, streamed: () => streamed };
}

const used = () => {
  const m = process.memoryUsage();
  return m.heapUsed + m.external + m.arrayBuffers;
};

describe('DataExportService (streamed)', () => {
  it('builds a 50 000-message export from pages, never the whole list', async () => {
    const { svc, prisma, storage, notifications, streamed } = build();
    const base = used();
    let peak = 0;
    const t = setInterval(() => (peak = Math.max(peak, used() - base)), 20);
    const progress: number[] = [];
    const r = await svc.process('e1', {
      onProgress: (p) => progress.push(p.rows),
    });
    clearInterval(t);

    expect(r.bytes).toBeGreaterThan(100 * 1024 * 1024);
    expect(streamed()).toBe(r.bytes);
    // 1000 messages per round trip: 50 full pages plus one empty probe.
    const calls = (prisma.message.findMany as jest.Mock).mock.calls;
    expect(calls.length).toBe(51);
    expect(calls.every((c) => c[0].take === 1000)).toBe(true);
    expect(storage.putStream).toHaveBeenCalledWith(
      'docs',
      'exports/user-data/u1/e1.zip',
      expect.anything(),
      'application/zip',
    );
    expect(prisma.dataExportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ready' }),
      }),
    );
    expect(notifications.emit).toHaveBeenCalled();
    expect(progress.length).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(
      `data export ${Math.round(r.bytes / 1048576)} MB, peak +${Math.round(peak / 1048576)} MB`,
    );
    expect(peak).toBeLessThan(120 * 1024 * 1024);
  });

  it('puts the job back to queued when the upload fails, so a retry can claim it', async () => {
    const { svc, prisma, storage } = build();
    (storage.putStream as jest.Mock).mockRejectedValueOnce(
      new Error('S3 down'),
    );
    await expect(svc.process('e1')).rejects.toThrow('S3 down');
    expect(prisma.dataExportJob.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'e1', status: 'processing' },
      data: { status: 'queued' },
    });
  });
});
