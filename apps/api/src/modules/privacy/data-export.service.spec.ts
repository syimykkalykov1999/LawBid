import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { DataExportService } from './data-export.service';

jest.setTimeout(180_000);

const MESSAGES = 50_000;

// A full GC before every memory sample: heapUsed without it also counts
// garbage V8 has not collected yet (under `jest --coverage` in CI that
// alone passed 256 MB while the export itself held ~one page). With it,
// the sample is what the export really keeps alive.
setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;

/** 50 000 own messages of ~2 KB, served by cursor like Prisma would. */
function messagePage(args: {
  take: number;
  // #358: messages page by their compound key (id, conversation_id).
  cursor?: { id_conversation_id: { id: string } };
  skip?: number;
}) {
  const start = args.cursor
    ? Number(args.cursor.id_conversation_id.id.slice(1)) + (args.skip ?? 0)
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
  // A plain function, not jest.fn(messagePage): a jest mock keeps every
  // returned page in mock.results, i.e. all 50 000 messages, and the
  // memory check below would measure the mock instead of the export.
  const messageTakes: number[] = [];
  let onPage: () => void = () => undefined;
  const findMessages = (args: Parameters<typeof messagePage>[0]) => {
    messageTakes.push(args.take);
    // The previous page and every stream buffer are still alive here, so
    // a whole-list leak would show up in this sample.
    onPage();
    return messagePage(args);
  };
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
    message: { findMany: findMessages },
    file: {
      create: jest.fn().mockResolvedValue({ id: 'f1' }),
      // S10-3 (#380): a takeover reuses the first run's file row.
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  let streamed = 0;
  const storage = {
    bucket: () => 'docs',
    putStream: jest.fn(async (_b: string, _k: string, body: Readable) => {
      for await (const c of body) streamed += (c as Buffer).length;
      return { bytes: streamed, sha256: 'test' };
    }),
  };
  const notifications = { emit: jest.fn() };
  // Union merge (#360 + #366): the round-13 export reads many more tables;
  // every model not listed above is empty.
  const anyModel = {
    findMany: empty,
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
  };
  const prismaAll = new Proxy(prisma, {
    get: (t, k) =>
      k in t
        ? { ...anyModel, ...(t[k as keyof typeof t] as object) }
        : anyModel,
  });
  const svc = new DataExportService(
    prismaAll as never,
    storage as never,
    notifications as never,
    { get: () => undefined } as never,
    { sendEmail: jest.fn() },
    { setContext: jest.fn(), warn: jest.fn() } as never,
  );
  return {
    svc,
    prisma,
    storage,
    notifications,
    messageTakes,
    streamed: () => streamed,
    setOnPage: (f: () => void) => (onPage = f),
  };
}

const used = () => {
  gc();
  const m = process.memoryUsage();
  return m.heapUsed + m.external + m.arrayBuffers;
};

describe('DataExportService (streamed)', () => {
  it('builds a 50 000-message export from pages, never the whole list', async () => {
    const {
      svc,
      prisma,
      storage,
      notifications,
      messageTakes,
      streamed,
      setOnPage,
    } = build();
    const base = used();
    let peak = 0;
    const sample = () => (peak = Math.max(peak, used() - base));
    setOnPage(sample);
    const t = setInterval(sample, 250);
    const progress: number[] = [];
    const r = await svc.process('e1', {
      onProgress: (p) => progress.push(p.rows),
    });
    clearInterval(t);
    sample();

    expect(r.bytes).toBeGreaterThan(50 * 1024 * 1024);
    expect(streamed()).toBe(r.bytes);
    // 1000 messages per round trip: 50 full pages plus one empty probe.
    expect(messageTakes.length).toBe(51);
    expect(messageTakes.every((t) => t === 1000)).toBe(true);
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

    console.log(
      `data export ${Math.round(r.bytes / 1048576)} MB, peak +${Math.round(peak / 1048576)} MB`,
    );
    expect(peak).toBeLessThan(256 * 1024 * 1024);
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
