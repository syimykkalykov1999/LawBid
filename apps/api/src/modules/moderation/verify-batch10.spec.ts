import { AdminModerationService } from './admin-moderation.service';
import { StrikesService } from './strikes.service';
import { ModerationAppealsService } from './moderation-appeals.service';
import { AutoAppealsService } from './auto-appeals.service';
import { ReporterReputationService } from './reporter-reputation.service';
import { AutoModerationService } from './auto-moderation.service';
import { ReportsService } from '../reports/reports.module';
import { MediaModerationService } from '../media-moderation/media-moderation.service';
import { AdminClientFraudService } from '../client-fraud/admin-client-fraud.service';

/** Verify 18.11 (batch 10): reports, moderation, media moderation, fraud. */

type AnyCtor<T> = new (...a: unknown[]) => T;
const make = <T>(C: unknown, ...a: unknown[]): T => new (C as AnyCtor<T>)(...a);

const ADMIN = {
  id: 'ad000000-0000-4000-8000-000000000001',
  adminRole: 'moderator',
  ip: null,
} as never;
const AUTHOR = 'a0000000-0000-4000-8000-000000000001';
const POST = 'p0000000-0000-4000-8000-000000000001';

function txPrisma(extra: Record<string, unknown> = {}) {
  const prisma: Record<string, unknown> = {
    report: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
    },
    moderationAction: {
      create: jest.fn().mockResolvedValue({ id: 'act1' }),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    mediaModerationCheck: { count: jest.fn().mockResolvedValue(0) },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: AUTHOR,
        role: 'client',
        status: 'active',
        first_name: 'A',
        last_name: 'B',
        attorney_profile: null,
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    ...extra,
  };
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma as Record<string, Record<string, jest.Mock>> & {
    $queryRaw: jest.Mock;
  };
}

function adminModeration(
  prisma: ReturnType<typeof txPrisma>,
  target: Record<string, unknown> | null,
) {
  const moderation = {
    resolve: jest.fn().mockResolvedValue(target),
    setContentStatus: jest.fn().mockResolvedValue('hidden'),
  };
  const users = {
    warn: jest.fn().mockResolvedValue(undefined),
    suspend: jest.fn().mockResolvedValue(undefined),
    restore: jest.fn().mockResolvedValue(undefined),
  };
  const strikes = {
    issue: jest.fn().mockResolvedValue(null),
    revokeForTarget: jest.fn().mockResolvedValue(undefined),
  };
  const summary = { dropFamily: jest.fn().mockResolvedValue(undefined) };
  const svc = make<AdminModerationService>(
    AdminModerationService,
    prisma,
    moderation,
    users,
    { record: jest.fn() },
    { emit: jest.fn() },
    strikes,
    { onReportsDecided: jest.fn() },
    undefined,
    undefined,
    summary,
  );
  return { svc, moderation, users, strikes, summary };
}

const hiddenPost = {
  type: 'post',
  id: POST,
  status: 'hidden',
  authorId: AUTHOR,
  authorDeleted: false,
  text: 'x',
  context: {},
  createdAt: new Date(),
};

describe('RP1: reports on objects that do not exist', () => {
  it('a report on a missing object is not stored', async () => {
    const prisma = txPrisma();
    const redis = { set: jest.fn(), del: jest.fn() };
    const moderation = {
      resolve: jest.fn().mockResolvedValue(null),
      autoHideIfThreshold: jest.fn(),
    };
    const svc = make<ReportsService>(
      ReportsService,
      prisma,
      { consume: jest.fn() },
      redis,
      moderation,
      { onComplaint: jest.fn() },
    );
    await svc.create(AUTHOR, {
      targetType: 'post',
      targetId: POST,
      reason: 'spam',
    } as never);
    expect(redis.set).not.toHaveBeenCalled();
    expect(prisma.report.create).not.toHaveBeenCalled();
  });

  it('the queue closes the open reports of objects that are gone', async () => {
    const prisma = txPrisma();
    prisma.$queryRaw.mockResolvedValue([
      {
        target_type: 'story',
        target_id: POST,
        reports: 1n,
        reporters: 1n,
        reasons: ['spam'],
        priority: false,
        first_at: new Date(),
        last_at: new Date(),
      },
    ]);
    const { svc, summary } = adminModeration(prisma, null);
    await svc.queue({});
    expect(prisma.report.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'open',
        OR: [{ target_type: 'story', target_id: POST }],
      },
      data: expect.objectContaining({ status: 'dismissed' }),
    });
    expect(summary.dropFamily).toHaveBeenCalled();
  });

  it('opening the card of a gone object closes its reports too', async () => {
    const prisma = txPrisma();
    const { svc } = adminModeration(prisma, null);
    await expect(svc.card('story', POST)).rejects.toMatchObject({
      status: 404,
    });
    expect(prisma.report.updateMany).toHaveBeenCalled();
  });
});

describe('RP2: a failed insert frees the duplicate claim', () => {
  it('the next try is not dropped for 30 days', async () => {
    const prisma = txPrisma();
    prisma.report.create.mockRejectedValue(new Error('db down'));
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    const svc = make<ReportsService>(
      ReportsService,
      prisma,
      { consume: jest.fn() },
      redis,
      {
        resolve: jest.fn().mockResolvedValue(hiddenPost),
        autoHideIfThreshold: jest.fn(),
      },
      { onComplaint: jest.fn() },
    );
    await expect(
      svc.create(AUTHOR, {
        targetType: 'post',
        targetId: POST,
        reason: 'spam',
      } as never),
    ).rejects.toThrow('db down');
    expect(redis.del).toHaveBeenCalledWith(`report:${AUTHOR}:post:${POST}`);
  });
});

describe('MO1: a restore lifts the strike', () => {
  it("the moderator's restore revokes the strike on the object", async () => {
    const prisma = txPrisma();
    const { svc, strikes } = adminModeration(prisma, hiddenPost);
    await svc.act(ADMIN, 'post', POST, 'restore', 'fine');
    expect(strikes.revokeForTarget).toHaveBeenCalledWith(
      ADMIN,
      AUTHOR,
      'post',
      POST,
      'fine',
    );
  });

  it('an accepted appeal revokes the strike of the object, whatever action it hangs on', async () => {
    const prisma = txPrisma({
      moderationAppeal: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ap1',
          status: 'pending',
          action_id: 'remove-1',
          appellant_id: AUTHOR,
          target_type: 'post',
          target_id: POST,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const strikes = {
      revokeByAction: jest.fn(),
      revokeForTarget: jest.fn(),
    };
    const svc = make<ModerationAppealsService>(
      ModerationAppealsService,
      prisma,
      {
        resolve: jest
          .fn()
          .mockResolvedValue({ ...hiddenPost, status: 'published' }),
      },
      { act: jest.fn() },
      { record: jest.fn() },
      { emit: jest.fn() },
      strikes,
    );
    await svc.decide(ADMIN, 'ap1', true, 'ok');
    expect(strikes.revokeForTarget).toHaveBeenCalledWith(
      ADMIN,
      AUTHOR,
      'post',
      POST,
      'Appeal accepted: ok',
    );
  });
});

describe('MO2: revoking a strike re-levels the ladder', () => {
  function strikesService(live: Record<string, unknown>[], revoked: unknown) {
    const prisma = {
      userStrike: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(revoked),
        findMany: jest.fn().mockResolvedValue(live),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const settings = {
      number: jest.fn((k: string) =>
        Promise.resolve(
          k.endsWith('cooldown_at')
            ? 3
            : k.endsWith('limited_at')
              ? 6
              : k.endsWith('suspend_at')
                ? 9
                : 0,
        ),
      ),
    };
    const svc = make<StrikesService>(
      StrikesService,
      prisma,
      settings,
      { invalidate: jest.fn() },
      { record: jest.fn() },
      { emit: jest.fn() },
    );
    return { svc, prisma };
  }
  const future = new Date(Date.now() + 86_400_000);

  it('the step a remaining strike carries is lowered when the points no longer reach it', async () => {
    // 3 strikes × 1 point; #3 carried «cooldown». #1 is revoked → 2 points.
    const { svc, prisma } = strikesService(
      [
        { id: 's2', points: 1, restriction: null, restriction_until: null },
        {
          id: 's3',
          points: 1,
          restriction: 'cooldown',
          restriction_until: future,
        },
      ],
      { restriction: null, restriction_until: null },
    );
    await svc.revoke(ADMIN, 's1', 'appeal');
    expect(prisma.userStrike.update).toHaveBeenCalledWith({
      where: { id: 's3' },
      data: { restriction: null, restriction_until: null },
    });
  });

  it('revoking the carrier keeps the step the remaining points still reach', async () => {
    // 4 strikes × 1 point, #3 carried «cooldown»; #3 revoked → 3 points left.
    const { svc, prisma } = strikesService(
      [
        { id: 's1', points: 1, restriction: null, restriction_until: null },
        { id: 's2', points: 1, restriction: null, restriction_until: null },
        { id: 's4', points: 1, restriction: null, restriction_until: null },
      ],
      { restriction: 'cooldown', restriction_until: future },
    );
    prisma.userStrike.findUnique
      .mockResolvedValueOnce({ id: 's3', user_id: AUTHOR, revoked_at: null })
      .mockResolvedValueOnce({
        restriction: 'cooldown',
        restriction_until: future,
      });
    await svc.revoke(ADMIN, 's3', 'appeal');
    expect(prisma.userStrike.update).toHaveBeenCalledWith({
      where: { id: 's4' },
      data: { restriction: 'cooldown', restriction_until: future },
    });
  });
});

describe('MO3: a user sanction is recorded once', () => {
  it('«Предупредить» on a reported user adds no second moderation action', async () => {
    const prisma = txPrisma();
    const { svc, users } = adminModeration(prisma, {
      type: 'user',
      id: AUTHOR,
      status: 'active',
      authorId: AUTHOR,
      text: null,
      context: {},
    });
    await svc.act(ADMIN, 'user', AUTHOR, 'warn', 'spam');
    expect(users.warn).toHaveBeenCalled();
    expect(prisma.moderationAction.create).not.toHaveBeenCalled();
  });
});

describe('MO4: the system «auto_hold» ticket is not a report', () => {
  it('«my reports» leaves it out', async () => {
    const prisma = txPrisma();
    const svc = make<ModerationAppealsService>(
      ModerationAppealsService,
      prisma,
    );
    await svc.myReports(AUTHOR);
    expect(prisma.report.findMany.mock.calls[0][0].where).toMatchObject({
      reporter_id: AUTHOR,
      OR: [{ note: null }, { NOT: { note: { startsWith: 'auto_hold' } } }],
    });
  });

  it('the unfounded-reports ladder leaves it out', async () => {
    const groupBy = jest.fn().mockResolvedValue([]);
    const prisma = {
      reporterStanding: { findUnique: jest.fn().mockResolvedValue(null) },
      report: { groupBy },
    };
    const settings = {
      boolean: jest.fn().mockResolvedValue(true),
      number: jest.fn().mockResolvedValue(5),
    };
    const svc = make<ReporterReputationService>(
      ReporterReputationService,
      prisma,
      settings,
      { record: jest.fn() },
      { emit: jest.fn() },
    );
    await (
      svc as unknown as { evaluate: (u: string) => Promise<void> }
    ).evaluate(AUTHOR);
    expect(groupBy.mock.calls[0][0].where).toMatchObject({
      OR: [{ note: null }, { NOT: { note: { startsWith: 'auto_hold' } } }],
    });
  });
});

describe('MO5: automatic restores never undo a human decision', () => {
  it('a: dismissing reports does not re-show a picture the image check hid', async () => {
    const prisma = txPrisma();
    prisma.mediaModerationCheck.count.mockResolvedValue(1);
    const { svc, moderation } = adminModeration(prisma, hiddenPost);
    await svc.act(ADMIN, 'post', POST, 'dismiss', 'fine');
    expect(moderation.setContentStatus).not.toHaveBeenCalled();
    expect(
      prisma.mediaModerationCheck.count.mock.calls[0][0].where,
    ).toMatchObject({
      owner_user_id: AUTHOR,
      decision: null,
      hidden_targets: { array_contains: [{ type: 'post', id: POST }] },
    });
  });

  it('b: approving the picture keeps a post a moderator removed afterwards', async () => {
    const check = {
      id: 'c1',
      decision: null,
      status: 'hidden',
      purpose: 'post_media',
      file_id: 'f1',
      video_asset_id: null,
      created_at: new Date(Date.now() - 60_000),
      hidden_targets: [{ type: 'post', id: POST }],
    };
    const prisma = {
      mediaModerationCheck: {
        findUnique: jest.fn().mockResolvedValue(check),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      sticker: { updateMany: jest.fn() },
      user: { updateMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const moderation = {
      humanHiddenSince: jest.fn().mockResolvedValue(true),
      resolve: jest.fn(),
      setContentStatus: jest.fn(),
    };
    const svc = make<MediaModerationService>(
      MediaModerationService,
      prisma,
      {},
      {},
      {},
      moderation,
      {},
      {},
      {},
      {},
      {},
      { setContext: jest.fn() },
    );
    await svc.decide('ad1', 'c1', 'approve');
    expect(moderation.humanHiddenSince).toHaveBeenCalledWith(
      'post',
      POST,
      check.created_at,
    );
    expect(moderation.resolve).not.toHaveBeenCalled();
    expect(moderation.setContentStatus).not.toHaveBeenCalled();
  });

  it('c: an accepted automatic-decision appeal keeps what a moderator removed later', async () => {
    const autoAt = new Date(Date.now() - 3_600_000);
    const row = {
      id: 'aa1',
      kind: 'content_hide',
      user_id: AUTHOR,
      target_type: 'post',
      target_id: POST,
      created_at: autoAt,
    };
    const prisma = txPrisma({
      moderationAutoAction: { update: jest.fn() },
    });
    const moderation = {
      humanHiddenSince: jest.fn().mockResolvedValue(true),
      resolve: jest.fn(),
      setContentStatus: jest.fn(),
    };
    const strikes = { revokeForTarget: jest.fn(), revokeByAction: jest.fn() };
    const svc = make<AutoAppealsService>(
      AutoAppealsService,
      prisma,
      {},
      moderation,
      strikes,
      { onReportsDecided: jest.fn() },
      {},
      { record: jest.fn() },
      { emit: jest.fn() },
    );
    await (
      svc as unknown as {
        reverse: (a: unknown, r: unknown, n: string) => Promise<void>;
      }
    ).reverse(ADMIN, row, 'ok');
    expect(moderation.humanHiddenSince).toHaveBeenCalledWith(
      'post',
      POST,
      autoAt,
    );
    expect(moderation.setContentStatus).not.toHaveBeenCalled();
    expect(strikes.revokeForTarget).not.toHaveBeenCalled();
    expect(prisma.moderationAutoAction.update).toHaveBeenCalled();
  });
});

describe('MO6: a country-scoped moderator keeps the scope on the card', () => {
  it('an object with no report from their countries is 404', async () => {
    const prisma = txPrisma();
    prisma.$queryRaw.mockResolvedValue([{ n: 0 }]);
    const { svc, moderation } = adminModeration(prisma, hiddenPost);
    await expect(svc.card('post', POST, ['CA'])).rejects.toMatchObject({
      status: 404,
    });
    expect(moderation.resolve).not.toHaveBeenCalled();
    await expect(
      svc.act(ADMIN, 'post', POST, 'remove', 'x', ['CA']),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('MM1: a media decision is claimed atomically', () => {
  it('a second moderator who lost the race applies nothing', async () => {
    const prisma = {
      mediaModerationCheck: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'c1',
          decision: null,
          status: 'hidden',
          hidden_targets: [{ type: 'post', id: POST }],
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const moderation = {
      humanHiddenSince: jest.fn(),
      resolve: jest.fn(),
      setContentStatus: jest.fn(),
    };
    const release = { release: jest.fn() };
    const svc = make<MediaModerationService>(
      MediaModerationService,
      prisma,
      {},
      {},
      {},
      moderation,
      release,
      {},
      {},
      {},
      {},
      { setContext: jest.fn() },
    );
    await expect(svc.decide('ad2', 'c1', 'remove')).rejects.toMatchObject({
      status: 409,
    });
    expect(release.release).not.toHaveBeenCalled();
    expect(moderation.resolve).not.toHaveBeenCalled();
    expect(prisma.mediaModerationCheck.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1', decision: null } }),
    );
  });
});

describe('CF1: the fraud desk undoes only fraud blocks, and blocks clients', () => {
  function fraudDesk(user: Record<string, unknown>, profile: unknown) {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      clientFraudProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
    };
    const users = { restore: jest.fn(), suspend: jest.fn() };
    const fraud = {
      setByStaff: jest.fn(),
      linkedAccounts: jest.fn().mockResolvedValue([]),
      onBanned: jest.fn(),
    };
    const svc = make<AdminClientFraudService>(
      AdminClientFraudService,
      prisma,
      fraud,
      users,
      { record: jest.fn() },
      {},
    );
    jest
      .spyOn(svc as unknown as { card: () => Promise<unknown> }, 'card')
      .mockResolvedValue({});
    return { svc, users };
  }

  it('«Снять» does not lift a suspension a moderator gave', async () => {
    const { svc, users } = fraudDesk(
      {
        id: AUTHOR,
        status: 'suspended',
        suspended_reason: 'harassment',
        admin_profile: null,
      },
      { status: 'review' },
    );
    await svc.clear(ADMIN, AUTHOR, null);
    expect(users.restore).not.toHaveBeenCalled();
  });

  it('«Снять» lifts a block by the fraud score', async () => {
    const { svc, users } = fraudDesk(
      {
        id: AUTHOR,
        status: 'suspended',
        suspended_reason: 'fraud_score',
        admin_profile: null,
      },
      { status: 'banned' },
    );
    await svc.clear(ADMIN, AUTHOR, null);
    expect(users.restore).toHaveBeenCalled();
  });

  it('a verifier cannot suspend an attorney through the fraud ban', async () => {
    const { svc, users } = fraudDesk(
      {
        status: 'active',
        role: 'attorney',
        admin_profile: null,
      },
      null,
    );
    const out = await svc.ban(
      { ...(ADMIN as object), adminRole: 'verifier' } as never,
      AUTHOR,
      { note: 'x', includeLinked: false },
    );
    expect(users.suspend).not.toHaveBeenCalled();
    expect(out.banned).toBe(0);
  });
});

describe('MO7: one automatic step per account, even with reports at once', () => {
  it('the «already at this step» read and the new row are one transaction', async () => {
    const order: string[] = [];
    const tx = {
      moderationAutoAction: {
        findMany: jest.fn(() => {
          order.push('tx.findMany');
          return Promise.resolve([]);
        }),
        create: jest.fn(() => {
          order.push('tx.create');
          return Promise.resolve({ id: 'aa1' });
        }),
      },
    };
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'active', role: 'client' }),
      },
      moderationAutoAction: {
        findMany: jest.fn(() => {
          order.push('outside.findMany');
          return Promise.resolve([]);
        }),
        create: jest.fn(() => {
          order.push('outside.create');
          return Promise.resolve({ id: 'aa1' });
        }),
      },
      $transaction: jest.fn((fn: (t: unknown) => unknown) => {
        order.push('begin');
        return fn(tx);
      }),
    };
    const settings = {
      string: jest.fn((k: string) =>
        Promise.resolve(k.endsWith('account_mode') ? 'shadow' : 'higher_bar'),
      ),
      number: jest.fn().mockResolvedValue(1),
    };
    const svc = make<AutoModerationService>(
      AutoModerationService,
      prisma,
      settings,
      {},
      {},
      {},
    );
    jest
      .spyOn(svc, 'thresholds')
      .mockResolvedValue({ limitAt: 1, tempAt: 0, suspendAt: 0 });
    jest
      .spyOn(
        svc as unknown as { accountScore: () => Promise<unknown> },
        'accountScore',
      )
      .mockResolvedValue({ total: 5 });
    await svc.evaluateAccount(AUTHOR);
    expect(order).toEqual(['begin', 'tx.findMany', 'tx.create']);
  });
});

describe('MO8: «my moderation notices» reads in batches', () => {
  it('the newest decision per object is one query, not one per notice', async () => {
    const at = new Date();
    const actions = [1, 2, 3].map((i) => ({
      id: `act${i}`,
      action: 'hide',
      target_type: 'post',
      target_id: `p${i}`,
      reason: 'x',
      created_at: at,
      appeal: null,
    }));
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue(actions.map((a) => ({ id: a.id }))),
      moderationAction: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(actions)
          .mockResolvedValueOnce(
            actions.map((a) => ({
              id: a.id,
              target_type: a.target_type,
              target_id: a.target_id,
            })),
          ),
        findFirst: jest.fn(),
      },
      dmcaNotice: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
      },
    };
    const moderation = {
      resolve: jest.fn((t: string, id: string) =>
        Promise.resolve({ type: t, id, status: 'hidden', text: 'x' }),
      ),
    };
    const svc = make<ModerationAppealsService>(
      ModerationAppealsService,
      prisma,
      moderation,
    );
    const out = await svc.notices(AUTHOR);
    expect(out.map((n) => n.canAppeal)).toEqual([true, true, true]);
    expect(prisma.moderationAction.findFirst).not.toHaveBeenCalled();
    expect(prisma.dmcaNotice.count).not.toHaveBeenCalled();
  });
});
