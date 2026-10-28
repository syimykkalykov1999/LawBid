import { HttpException, HttpStatus } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import sharp from 'sharp';
import {
  MediaModerationService,
  toCheckJpeg,
  verdictOf,
} from './media-moderation.service';

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as PinoLogger;

const SETTINGS: Record<string, number | boolean> = {
  'moderation.image.enabled': true,
  'moderation.image.hide_confidence': 90,
  'moderation.image.review_confidence': 60,
  'moderation.image.min_confidence': 50,
  'moderation.csam.ncmec_submit_enabled': true,
  'moderation.image.reuse_approval_enabled': true,
  'moderation.image.recheck_enabled': true,
};

async function png(): Promise<Buffer> {
  return sharp({
    create: { width: 40, height: 30, channels: 3, background: '#808080' },
  })
    .png()
    .toBuffer();
}

/** A tiny in-memory stand-in of the tables the service touches. */
function harness(opts: {
  labels?: { name: string; parent: string | null; confidence: number }[];
  configured?: boolean;
  csam?: 'not_configured' | 'no_match' | 'match';
  budgetExceeded?: boolean;
  twin?: Record<string, unknown> | null;
  postIds?: string[];
  bucket?: string;
}) {
  const checks = new Map<string, Record<string, unknown>>();
  const reports: Record<string, unknown>[] = [];
  const file = {
    id: 'f1',
    owner_user_id: 'u1',
    purpose: 'post_image',
    scan_status: 'clean',
    deleted_at: null,
    sha256: 'a'.repeat(64),
    s3_bucket: opts.bucket ?? 'media',
    s3_key: 'k',
  };
  const prisma: Record<string, unknown> = {
    file: { findUnique: jest.fn(() => Promise.resolve(file)) },
    mediaModerationCheck: {
      upsert: jest.fn(({ create }: { create: Record<string, unknown> }) => {
        const row = {
          id: 'c1',
          status: 'pending',
          decision: null,
          hidden_targets: [],
          video_asset_id: null,
          created_at: new Date(),
          ...create,
        };
        checks.set('c1', row);
        return Promise.resolve(row);
      }),
      findFirst: jest.fn(() => Promise.resolve(opts.twin ?? null)),
      findMany: jest.fn(() => Promise.resolve([...checks.values()])),
      findUnique: jest.fn(() => Promise.resolve(checks.get('c1'))),
      findUniqueOrThrow: jest.fn(() => Promise.resolve(checks.get('c1'))),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; status: string };
          data: Record<string, unknown>;
        }) => {
          const row = checks.get(where.id);
          if (!row || row.status !== where.status)
            return Promise.resolve({ count: 0 });
          checks.set(where.id, { ...row, ...data });
          return Promise.resolve({ count: 1 });
        },
      ),
      update: jest.fn(
        ({
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = { ...checks.get('c1'), ...data };
          checks.set('c1', row);
          return Promise.resolve(row);
        },
      ),
    },
    csamReport: {
      findFirst: jest.fn(() => Promise.resolve(null)),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const r = { id: 'r1', ...data };
        reports.push(r);
        return Promise.resolve(r);
      }),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        Object.assign(reports[0], data);
        return Promise.resolve(reports[0]);
      }),
    },
    postMedia: {
      findMany: jest.fn(() =>
        Promise.resolve((opts.postIds ?? []).map((post_id) => ({ post_id }))),
      ),
    },
    story: { findMany: jest.fn(() => Promise.resolve([])) },
    channelPost: { findMany: jest.fn(() => Promise.resolve([])) },
    videoAsset: { findMany: jest.fn(() => Promise.resolve([])) },
    review: { findMany: jest.fn(() => Promise.resolve([])) },
    clientReview: { findMany: jest.fn(() => Promise.resolve([])) },
    user: { findMany: jest.fn(() => Promise.resolve([])) },
    $transaction: jest.fn(
      (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(prisma),
    ),
  };
  const settings = {
    boolean: jest.fn((k: string) => Promise.resolve(SETTINGS[k])),
    raw: jest.fn((k: string) => Promise.resolve(SETTINGS[k])),
    number: jest.fn((k: string) => Promise.resolve(SETTINGS[k])),
  };
  const costGuard = {
    consume: jest.fn(() =>
      opts.budgetExceeded
        ? Promise.reject(
            new HttpException('budget', HttpStatus.SERVICE_UNAVAILABLE),
          )
        : Promise.resolve(),
    ),
  };
  const provider = {
    name: 'aws_rekognition',
    configured: jest.fn(() => Promise.resolve(opts.configured ?? true)),
    detect: jest.fn(() =>
      Promise.resolve({
        provider: 'aws_rekognition',
        labels: opts.labels ?? [],
      }),
    ),
  };
  const matcher = {
    name: 'photodna',
    match: jest.fn(() =>
      Promise.resolve({ status: opts.csam ?? 'not_configured' }),
    ),
  };
  const reporter = {
    name: 'ncmec',
    submit: jest.fn(() => Promise.resolve({ status: 'manual_required' })),
  };
  const moderation = {
    resolve: jest.fn((type: string, id: string) =>
      Promise.resolve({
        type,
        id,
        status: 'published',
        authorId: 'u1',
        context: {},
      }),
    ),
    setContentStatus: jest.fn(() => Promise.resolve('published')),
  };
  const queue = { enqueueRehide: jest.fn(() => Promise.resolve()) };
  const storage = { read: jest.fn(() => png()) };
  const notices = { mediaHidden: jest.fn(() => Promise.resolve()) };
  const svc = new MediaModerationService(
    prisma as never,
    settings as never,
    costGuard as never,
    storage as never,
    moderation as never,
    { release: jest.fn() } as never,
    provider,
    matcher,
    reporter as never,
    queue as never,
    logger,
    undefined,
    notices as never,
  );
  return {
    svc,
    checks,
    reports,
    provider,
    storage,
    costGuard,
    moderation,
    queue,
    reporter,
    notices,
  };
}

describe('verdictOf (owner 2026-10-22, audit #4 §5)', () => {
  const t = { hide: 90, review: 60 };
  it('clean below review, flagged at review, hidden at hide', () => {
    expect(verdictOf([], t).status).toBe('clean');
    expect(
      verdictOf([{ name: 'Suggestive', parent: null, confidence: 59.9 }], t)
        .status,
    ).toBe('clean');
    expect(
      verdictOf([{ name: 'Suggestive', parent: null, confidence: 60 }], t)
        .status,
    ).toBe('flagged');
    const v = verdictOf(
      [
        { name: 'Suggestive', parent: null, confidence: 70 },
        { name: 'Nudity', parent: 'Explicit', confidence: 97.5 },
      ],
      t,
    );
    expect(v).toEqual({
      status: 'hidden',
      max: 97.5,
      top: 'Explicit / Nudity',
    });
  });
});

describe('toCheckJpeg', () => {
  it('turns any image into a JPEG within the size cap', async () => {
    const out = await toCheckJpeg(await png());
    expect((await sharp(out).metadata()).format).toBe('jpeg');
  });
});

describe('MediaModerationService.checkFile', () => {
  it('an R2 object is read as bytes from its own bucket (no S3Object reference)', async () => {
    const h = harness({ labels: [], bucket: 'lawbid-public-r2' });
    expect(await h.svc.checkFile('f1')).toBe('clean');
    expect(h.storage.read).toHaveBeenCalledWith('lawbid-public-r2', 'k');
  });

  it('a clean picture is marked clean, nothing hidden', async () => {
    const h = harness({ labels: [] });
    expect(await h.svc.checkFile('f1')).toBe('clean');
    expect(h.costGuard.consume).toHaveBeenCalledWith('image_moderation');
    expect(h.moderation.setContentStatus).not.toHaveBeenCalled();
  });

  it('above the hide threshold the post showing it is hidden', async () => {
    const h = harness({
      labels: [{ name: 'Nudity', parent: 'Explicit', confidence: 95 }],
      postIds: ['p1'],
    });
    expect(await h.svc.checkFile('f1')).toBe('hidden');
    expect(h.moderation.setContentStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'post', id: 'p1' }),
      'hide',
      expect.any(Array),
    );
    expect(h.checks.get('c1')?.hidden_targets).toEqual([
      { type: 'post', id: 'p1' },
    ]);
  });

  it('hidden but not posted yet: retried later', async () => {
    const h = harness({
      labels: [{ name: 'Violence', parent: null, confidence: 99 }],
    });
    expect(await h.svc.checkFile('f1')).toBe('hidden');
    expect(h.queue.enqueueRehide).toHaveBeenCalledWith('c1');
  });

  it('S10-6: the sweep hides what a lost delayed rehide job would have', async () => {
    const h = harness({ postIds: ['p1'] });
    h.checks.set('c1', {
      id: 'c1',
      file_id: 'f1',
      video_asset_id: null,
      owner_user_id: 'u1',
      purpose: 'post_image',
      status: 'hidden',
      decision: null,
      hidden_targets: [],
      checked_at: new Date(Date.now() - 3 * 3_600_000),
    });
    const out = await h.svc.rehideSweep(new Date());
    expect(out.reapplied).toBe(1);
    expect(h.moderation.setContentStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'post', id: 'p1' }),
      'hide',
      expect.any(Array),
    );
  });

  it('over the money cap the check is skipped, not paid', async () => {
    const h = harness({ budgetExceeded: true });
    expect(await h.svc.checkFile('f1')).toBe('skipped');
    expect(h.provider.detect).not.toHaveBeenCalled();
    expect(h.checks.get('c1')?.skip_reason).toBe('budget');
  });

  it('the same picture again reuses the verdict (no paid call)', async () => {
    const h = harness({
      twin: {
        id: 'c0',
        status: 'flagged',
        labels: [],
        max_confidence: 70,
        top_label: 'Suggestive',
        csam_status: 'no_match',
      },
    });
    expect(await h.svc.checkFile('f1')).toBe('flagged');
    expect(h.costGuard.consume).not.toHaveBeenCalled();
    expect(h.provider.detect).not.toHaveBeenCalled();
  });

  it('without keys nothing is sent and the check says why', async () => {
    const h = harness({ configured: false });
    expect(await h.svc.checkFile('f1')).toBe('skipped');
    expect(h.checks.get('c1')?.skip_reason).toBe('not_configured');
  });

  it('a CSAM hash match hides at once and opens an NCMEC report', async () => {
    const h = harness({ csam: 'match', postIds: ['p1'] });
    expect(await h.svc.checkFile('f1')).toBe('csam_match');
    expect(h.provider.detect).not.toHaveBeenCalled();
    expect(h.reporter.submit).toHaveBeenCalled();
    expect(h.reports[0]).toMatchObject({
      check_id: 'c1',
      status: 'manual_required',
    });
  });
});

describe('algo audit 2026-10-27 — image moderation', () => {
  it('CONTENT H-2: the author is told once when a picture of theirs is hidden', async () => {
    const h = harness({
      labels: [{ name: 'Nudity', parent: 'Explicit', confidence: 95 }],
      postIds: ['p1'],
    });
    expect(await h.svc.checkFile('f1')).toBe('hidden');
    expect(h.notices.mediaHidden).toHaveBeenCalledWith({
      userId: 'u1',
      checkId: 'c1',
      hidden: 1,
    });
    // A later re-apply (something already hidden) does not tell them again.
    await h.svc.rehide('c1');
    expect(h.notices.mediaHidden).toHaveBeenCalledTimes(1);
  });

  it('CONTENT H-2: never a notice for a CSAM match', async () => {
    const h = harness({ csam: 'match', postIds: ['p1'] });
    expect(await h.svc.checkFile('f1')).toBe('csam_match');
    expect(h.notices.mediaHidden).not.toHaveBeenCalled();
  });

  it('CONTENT M-2: a re-upload of an approved picture keeps the approval (not hidden again)', async () => {
    const h = harness({
      postIds: ['p1'],
      twin: {
        id: 'c0',
        status: 'hidden',
        decision: 'approved',
        labels: [],
        max_confidence: 95,
        top_label: 'Nudity',
        csam_status: 'no_match',
      },
    });
    expect(await h.svc.checkFile('f1')).toBe('hidden');
    expect(h.checks.get('c1')?.decision).toBe('approved');
    expect(h.moderation.setContentStatus).not.toHaveBeenCalled();
  });

  it('CONTENT M-2: an undecided hidden twin still hides the new copy', async () => {
    const h = harness({
      postIds: ['p1'],
      twin: {
        id: 'c0',
        status: 'hidden',
        decision: null,
        labels: [],
        max_confidence: 95,
        top_label: 'Nudity',
        csam_status: 'no_match',
      },
    });
    expect(await h.svc.checkFile('f1')).toBe('hidden');
    expect(h.checks.get('c1')?.decision ?? null).toBeNull();
    expect(h.moderation.setContentStatus).toHaveBeenCalled();
  });

  it('CONTENT M-1: a check skipped for the budget is run again later', async () => {
    const h = harness({ labels: [] });
    h.checks.set('c1', {
      id: 'c1',
      file_id: 'f1',
      video_asset_id: null,
      owner_user_id: 'u1',
      purpose: 'post_image',
      status: 'skipped',
      skip_reason: 'budget',
      decision: null,
      hidden_targets: [],
      created_at: new Date(),
      checked_at: new Date(Date.now() - 2 * 3_600_000),
    });
    const out = await h.svc.recheckSweep(new Date());
    expect(out.rechecked).toBe(1);
    expect(h.provider.detect).toHaveBeenCalled();
    expect(h.checks.get('c1')?.status).toBe('clean');
  });

  it('CONTENT M-1: still over the budget — stays skipped, the sweep stops', async () => {
    const h = harness({ budgetExceeded: true });
    h.checks.set('c1', {
      id: 'c1',
      file_id: 'f1',
      video_asset_id: null,
      owner_user_id: 'u1',
      purpose: 'post_image',
      status: 'skipped',
      skip_reason: 'budget',
      decision: null,
      hidden_targets: [],
      created_at: new Date(),
      checked_at: new Date(Date.now() - 2 * 3_600_000),
    });
    await h.svc.recheckSweep(new Date());
    expect(h.checks.get('c1')).toMatchObject({
      status: 'skipped',
      skip_reason: 'budget',
    });
    expect(h.provider.detect).not.toHaveBeenCalled();
  });

  it('CONTENT M-1: switch off — nothing is re-run', async () => {
    const h = harness({ labels: [] });
    SETTINGS['moderation.image.recheck_enabled'] = false;
    try {
      expect((await h.svc.recheckSweep(new Date())).rechecked).toBe(0);
    } finally {
      SETTINGS['moderation.image.recheck_enabled'] = true;
    }
  });
});
