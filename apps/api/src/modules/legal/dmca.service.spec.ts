import type { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { AdminUsersService } from '../admin-users/admin-users.service';
import type { AdminModerationService } from '../moderation/admin-moderation.service';
import type { ModerationService } from '../moderation/moderation.service';
import type { ReportsService } from '../reports/reports.module';
import { DmcaService, REPEAT_INFRINGER_REASON } from './dmca.service';
import type { CreateDmcaNoticeDto } from './legal.dto';
import type { LegalService } from './legal.service';
import { DEFAULT_LEGAL_SETTINGS } from './legal.settings';

const ADMIN: AdminActor = {
  id: 'adm',
  adminRole: 'super_admin',
  sessionId: 's',
  justification: null,
  ip: '203.0.113.1',
};
const NOTICE_ID = '11111111-1111-4111-8111-111111111111';
const POST_ID = '22222222-2222-4222-8222-222222222222';

function setup(
  opts: {
    notice?: Record<string, unknown> | null;
    target?: Record<string, unknown> | null;
    strikesAfter?: number;
    authorStatus?: string;
    strikesToSuspend?: number;
  } = {},
) {
  const notice =
    opts.notice === null
      ? null
      : {
          id: NOTICE_ID,
          report_id: null,
          target_type: 'post',
          target_id: POST_ID,
          infringing_url: null,
          complainant_name: 'Jane',
          complainant_email: 'jane@example.com',
          complainant_address: '1 Main St',
          complainant_phone: null,
          work_description: 'My photo, posted without permission.',
          good_faith: true,
          accuracy_sworn: true,
          signature: 'Jane Doe',
          status: 'new',
          submitted_by_user_id: 'jane',
          author_user_id: null,
          counter: null,
          decided_by: null,
          decided_at: null,
          decision_note: null,
          created_at: new Date('2026-10-05T10:00:00Z'),
          updated_at: new Date('2026-10-05T10:00:00Z'),
          ...opts.notice,
        };
  const target =
    opts.target === null
      ? null
      : {
          type: 'post',
          id: POST_ID,
          authorId: 'author',
          status: 'published',
          text: 'photo',
          context: {},
          createdAt: new Date(),
          ...opts.target,
        };
  const prisma = {
    dmcaNotice: {
      findUnique: jest.fn().mockResolvedValue(notice),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: NOTICE_ID, status: 'new', ...data }),
        ),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...notice, ...data }),
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    report: {
      findFirst: jest.fn().mockResolvedValue({ id: 'rep1' }),
    },
    user: {
      update: jest.fn().mockResolvedValue({
        copyright_strikes: opts.strikesAfter ?? 1,
        status: opts.authorStatus ?? 'active',
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ copyright_strikes: 1 }),
    },
  };
  const reports = { create: jest.fn().mockResolvedValue(undefined) };
  const limits = { consume: jest.fn().mockResolvedValue(undefined) };
  const moderation = { resolve: jest.fn().mockResolvedValue(target) };
  const adminModeration = {
    act: jest.fn().mockResolvedValue({}),
    card: jest.fn().mockResolvedValue(null),
  };
  const users = { suspend: jest.fn().mockResolvedValue({}) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const legal = {
    settings: jest.fn().mockResolvedValue({
      ...DEFAULT_LEGAL_SETTINGS,
      dmcaStrikesToSuspend:
        opts.strikesToSuspend ?? DEFAULT_LEGAL_SETTINGS.dmcaStrikesToSuspend,
    }),
  };
  const svc = new DmcaService(
    prisma as unknown as PrismaService,
    reports as unknown as ReportsService,
    limits as unknown as UsageLimitsService,
    moderation as unknown as ModerationService,
    adminModeration as unknown as AdminModerationService,
    users as unknown as AdminUsersService,
    audit as unknown as AuditLogService,
    legal as unknown as LegalService,
  );
  return {
    svc,
    prisma,
    reports,
    limits,
    moderation,
    adminModeration,
    users,
    audit,
  };
}

const VALID: CreateDmcaNoticeDto = {
  complainantName: 'Jane',
  complainantEmail: 'jane@example.com',
  complainantAddress: '1 Main St, Springfield',
  workDescription: 'My photo, posted without permission, see my portfolio.',
  goodFaith: true,
  accuracySworn: true,
  signature: 'Jane Doe',
};

/** Owner 2026-10-05 (legal): DMCA notices — filing and the decision flow. */
describe('DmcaService.create', () => {
  it('with a target: files a copyright report (its limit, dedup, auto-hide) and links it', async () => {
    const { svc, prisma, reports, limits } = setup();
    const res = await svc.create('jane', {
      ...VALID,
      targetType: 'post',
      targetId: POST_ID,
    });
    expect(res).toEqual({ id: NOTICE_ID, status: 'new' });
    expect(reports.create).toHaveBeenCalledWith('jane', {
      targetType: 'post',
      targetId: POST_ID,
      reason: 'copyright',
      note: VALID.workDescription,
    });
    expect(limits.consume).not.toHaveBeenCalled();
    expect(prisma.dmcaNotice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          report_id: 'rep1',
          target_type: 'post',
          target_id: POST_ID,
          submitted_by_user_id: 'jane',
          good_faith: true,
          accuracy_sworn: true,
        }),
      }),
    );
  });

  it('with a URL only: no report, the report limit is consumed', async () => {
    const { svc, reports, limits } = setup();
    await svc.create('jane', { ...VALID, infringingUrl: 'https://x.test/p/1' });
    expect(reports.create).not.toHaveBeenCalled();
    expect(limits.consume).toHaveBeenCalledWith('report', 'jane');
  });

  it('needs a target or a URL, and the target pair complete', async () => {
    const { svc } = setup();
    await expect(svc.create('jane', VALID)).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      svc.create('jane', { ...VALID, targetType: 'post' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('DmcaService.decide', () => {
  it('remove: takes the content down through moderation, one strike, no suspension under the threshold', async () => {
    const { svc, prisma, adminModeration, users, audit } = setup({
      strikesAfter: 1,
    });
    const res = await svc.decide(ADMIN, NOTICE_ID, {
      action: 'remove',
      note: 'Clear copy',
    });
    expect(adminModeration.act).toHaveBeenCalledWith(
      ADMIN,
      'post',
      POST_ID,
      'remove',
      `DMCA notice ${NOTICE_ID}`,
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'author' },
      data: { copyright_strikes: { increment: 1 } },
      select: { copyright_strikes: true, status: true },
    });
    expect(users.suspend).not.toHaveBeenCalled();
    expect(res.status).toBe('removed');
    expect(res.authorUserId).toBe('author');
    expect(res.decidedBy).toBe('adm');
    expect(res.decisionNote).toBe('Clear copy');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'legal.dmca.decide',
        targetId: NOTICE_ID,
        after: expect.objectContaining({ status: 'removed', strikes: 1 }),
      }),
    );
  });

  it('remove: the third strike suspends an active author (repeat infringer)', async () => {
    const { svc, users } = setup({ strikesAfter: 3 });
    await svc.decide(ADMIN, NOTICE_ID, { action: 'remove' });
    expect(users.suspend).toHaveBeenCalledWith(
      ADMIN,
      'author',
      REPEAT_INFRINGER_REASON,
    );
  });

  it('remove: no auto-suspension when the threshold is 0 or the author is not active', async () => {
    const zero = setup({ strikesAfter: 5, strikesToSuspend: 0 });
    await zero.svc.decide(ADMIN, NOTICE_ID, { action: 'remove' });
    expect(zero.users.suspend).not.toHaveBeenCalled();
    const already = setup({ strikesAfter: 3, authorStatus: 'suspended' });
    await already.svc.decide(ADMIN, NOTICE_ID, { action: 'remove' });
    expect(already.users.suspend).not.toHaveBeenCalled();
  });

  it('remove: content already removed gets no second moderation action but still counts', async () => {
    const { svc, adminModeration, prisma } = setup({
      target: { status: 'removed' },
    });
    await svc.decide(ADMIN, NOTICE_ID, { action: 'remove' });
    expect(adminModeration.act).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('remove: refused for a URL-only notice, a decided notice, a vanished target', async () => {
    await expect(
      setup({
        notice: {
          target_type: null,
          target_id: null,
          infringing_url: 'https://x',
        },
      }).svc.decide(ADMIN, NOTICE_ID, { action: 'remove' }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      setup({ notice: { status: 'rejected' } }).svc.decide(ADMIN, NOTICE_ID, {
        action: 'remove',
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      setup({ target: null }).svc.decide(ADMIN, NOTICE_ID, {
        action: 'remove',
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      setup({ notice: null }).svc.decide(ADMIN, NOTICE_ID, {
        action: 'reject',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('reject: closes a new notice without touching the content', async () => {
    const { svc, adminModeration, prisma } = setup();
    const res = await svc.decide(ADMIN, NOTICE_ID, { action: 'reject' });
    expect(res.status).toBe('rejected');
    expect(adminModeration.act).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('restore after a counter-notice: puts the content back and takes the strike back', async () => {
    const { svc, adminModeration, prisma } = setup({
      notice: { status: 'counter_received', author_user_id: 'author' },
      target: { status: 'removed' },
    });
    const res = await svc.decide(ADMIN, NOTICE_ID, { action: 'restore' });
    expect(adminModeration.act).toHaveBeenCalledWith(
      ADMIN,
      'post',
      POST_ID,
      'restore',
      `DMCA notice ${NOTICE_ID}`,
    );
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'author', copyright_strikes: { gt: 0 } },
      data: { copyright_strikes: { decrement: 1 } },
    });
    expect(res.status).toBe('restored');
    await expect(
      setup({ notice: { status: 'new' } }).svc.decide(ADMIN, NOTICE_ID, {
        action: 'restore',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('DmcaService.counter', () => {
  const COUNTER = {
    name: 'Author',
    address: '2 Side St',
    email: 'author@example.com',
    consentJurisdiction: true as const,
    sworn: true as const,
    signature: 'Author Name',
  };

  it('only the author, only while removed; stores the counter and moves the status', async () => {
    const { svc, prisma } = setup({
      notice: { status: 'removed', author_user_id: 'author' },
    });
    prisma.dmcaNotice.findUnique
      .mockResolvedValueOnce({
        id: NOTICE_ID,
        status: 'removed',
        author_user_id: 'author',
        counter: null,
        created_at: new Date(),
        decided_at: null,
      })
      .mockResolvedValueOnce({
        id: NOTICE_ID,
        status: 'counter_received',
        author_user_id: 'author',
        counter: {
          ...COUNTER,
          phone: null,
          submittedAt: '2026-10-06T00:00:00.000Z',
        },
        created_at: new Date(),
        decided_at: null,
      });
    const res = await svc.counter('author', NOTICE_ID, COUNTER);
    expect(prisma.dmcaNotice.updateMany).toHaveBeenCalledWith({
      where: { id: NOTICE_ID, status: 'removed' },
      data: {
        status: 'counter_received',
        counter: expect.objectContaining({ name: 'Author', sworn: true }),
      },
    });
    expect(res.status).toBe('counter_received');
    expect(res.counterSubmittedAt).toBe('2026-10-06T00:00:00.000Z');
    expect(res.canCounter).toBe(false);

    await expect(
      setup({
        notice: { status: 'removed', author_user_id: 'author' },
      }).svc.counter('someone-else', NOTICE_ID, COUNTER),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      setup({
        notice: { status: 'new', author_user_id: 'author' },
      }).svc.counter('author', NOTICE_ID, COUNTER),
    ).rejects.toMatchObject({ status: 409 });
  });
});
