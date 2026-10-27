import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { StaffRetaliationService } from './staff-retaliation.service';

const DAY = 86_400_000;
const NOW = new Date('2026-10-27T12:00:00Z');

const settings = (stored: Record<string, unknown> = {}) =>
  new StaffSettingsService({
    all: () => Promise.resolve({ 'staff.appeals_enabled': true, ...stored }),
  } as unknown as AppSettingsService);

function mockDb() {
  const m = (impl?: unknown) => jest.fn().mockResolvedValue(impl);
  const db = {
    adminProfile: {
      findMany: m([
        { user_id: 'h1', admin_role: 'support', workspace: 'mass' },
        { user_id: 'w1', admin_role: 'support', workspace: 'mass' },
      ]),
      count: m(10),
    },
    adminAppeal: { findFirst: m(null), findMany: m([]) },
    staffRetaliationFlag: {
      findFirst: m(null),
      findMany: m([]),
      create: jest.fn((a: unknown) => ({ op: 'flag', a })),
      updateMany: m({ count: 0 }),
    },
    staffMemberState: {
      upsert: jest.fn((a: unknown) => ({ op: 'state', a })),
      updateMany: m({ count: 1 }),
    },
    staffAction: {
      findFirst: m(null),
      findMany: m([]),
      create: jest.fn((a: unknown) => ({ op: 'action', a })),
    },
    staffRatingSnapshot: { findFirst: m(null) },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
  return db;
}

function make(stored: Record<string, unknown> = {}) {
  const db = mockDb();
  const svc = new StaffRetaliationService(
    db as unknown as PrismaService,
    settings(stored),
  );
  return { db, svc };
}

const appeal = (daysAgo: number) => ({
  id: 'a1',
  created_at: new Date(Date.now() - daysAgo * DAY),
  head_admin_id: 'h1',
});

/** A warning exists for the person; no signal has been written yet. */
const warned = (db: ReturnType<typeof mockDb>) =>
  db.staffAction.findFirst.mockImplementation((a: unknown) =>
    Promise.resolve(
      (a as { where: { kind: string } }).where.kind === 'warn'
        ? { id: 'warn1' }
        : null,
    ),
  );

const signalsWritten = (db: ReturnType<typeof mockDb>) =>
  db.staffAction.create.mock.calls
    .map((c) => (c[0] as { data: { kind: string; reason_code: string } }).data)
    .filter((d) => d.kind === 'signal')
    .map((d) => d.reason_code);

describe('StaffRetaliationService.check: the retaliation guard', () => {
  it('the switch off: nothing is read, nothing is written', async () => {
    const { db, svc } = make({ 'staff.appeals_enabled': false });
    await expect(svc.check('w1', 'h1', 'offboard')).resolves.toEqual({
      flagged: false,
    });
    expect(db.adminProfile.findMany).not.toHaveBeenCalled();
  });

  it('firing the author 10 days after the appeal: flag + 14-day hold + journal, not blocked', async () => {
    const { db, svc } = make();
    db.adminAppeal.findFirst.mockResolvedValue(appeal(10));
    const r = await svc.check('w1', 'h1', 'offboard', 'act1');
    expect(r).toEqual({ flagged: true });
    const flag = (
      db.staffRetaliationFlag.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(flag).toMatchObject({
      appeal_id: 'a1',
      subject_admin_id: 'w1',
      action_id: 'act1',
    });
    const hold = (flag.hold_until as Date).getTime() - Date.now();
    expect(hold).toBeGreaterThan(13.99 * DAY);
    expect(hold).toBeLessThan(14.01 * DAY);
    // window = appeal + 90 days
    const win = (flag.window_until as Date).getTime() - Date.now();
    expect(win).toBeGreaterThan(79.9 * DAY);
    expect(win).toBeLessThan(80.1 * DAY);
    expect(db.staffMemberState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ state: 'hold_owner' }),
      }),
    );
    expect(db.staffAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        admin_id: 'w1',
        actor_id: 'h1',
        kind: 'hold_owner',
      }),
    });
  });

  it('the appeal query asks only for the window (90 days from settings)', async () => {
    const { db, svc } = make({ 'staff.retaliation.window_days': 30 });
    await svc.check('w1', 'h1', 'pull');
    const where = (
      db.adminAppeal.findFirst.mock.calls[0][0] as {
        where: { author_id: string; created_at: { gt: Date } };
      }
    ).where;
    expect(where.author_id).toBe('w1');
    const back = Date.now() - where.created_at.gt.getTime();
    expect(back).toBeGreaterThan(29.9 * DAY);
    expect(back).toBeLessThan(30.1 * DAY);
  });

  it('an appeal older than the window (the query finds none): no flag', async () => {
    const { db, svc } = make();
    await expect(svc.check('w1', 'h1', 'offboard')).resolves.toEqual({
      flagged: false,
    });
    expect(db.staffRetaliationFlag.create).not.toHaveBeenCalled();
    expect(db.staffMemberState.upsert).not.toHaveBeenCalled();
  });

  it('an appeal filed exactly at the window edge is outside', async () => {
    const { db, svc } = make();
    db.adminAppeal.findFirst.mockResolvedValue(appeal(90));
    await expect(svc.check('w1', 'h1', 'offboard')).resolves.toEqual({
      flagged: false,
    });
  });

  it('a second action while a hold runs does not stack flags, still reports flagged', async () => {
    const { db, svc } = make();
    db.adminAppeal.findFirst.mockResolvedValue(appeal(5));
    db.staffRetaliationFlag.findFirst.mockResolvedValue({ id: 'f0' });
    await expect(svc.check('w1', 'h1', 'replace')).resolves.toEqual({
      flagged: true,
    });
    expect(db.staffRetaliationFlag.create).not.toHaveBeenCalled();
  });

  it('a rights cut is guarded too (but is no removal: no removal signals)', async () => {
    const { db, svc } = make();
    db.adminAppeal.findFirst.mockResolvedValue(appeal(5));
    await expect(svc.check('w1', 'h1', 'rights_cut')).resolves.toEqual({
      flagged: true,
    });
    expect(signalsWritten(db)).toEqual([]);
  });

  it('the owner acting is not guarded', async () => {
    const { db, svc } = make();
    db.adminProfile.findMany.mockResolvedValue([
      { user_id: 'owner', admin_role: 'super_admin', workspace: 'owner' },
      { user_id: 'w1', admin_role: 'support', workspace: 'mass' },
    ]);
    db.adminAppeal.findFirst.mockResolvedValue(appeal(5));
    await expect(svc.check('w1', 'owner', 'offboard')).resolves.toEqual({
      flagged: false,
    });
    expect(db.adminAppeal.findFirst).not.toHaveBeenCalled();
  });

  it('a database error never blocks the action', async () => {
    const { db, svc } = make();
    db.adminProfile.findMany.mockRejectedValue(new Error('db down'));
    await expect(svc.check('w1', 'h1', 'offboard')).resolves.toEqual({
      flagged: false,
    });
  });
});

describe('StaffRetaliationService.check: automatic guards (signals, never a block)', () => {
  it('everything calm but the missing warning: only «removal without warning»', async () => {
    const { db, svc } = make();
    const r = await svc.check('w1', 'h1', 'offboard');
    expect(r.flagged).toBe(false);
    expect(signalsWritten(db)).toEqual(['removal_without_warning']);
  });

  it('a warning in the last 60 days: no signal', async () => {
    const { db, svc } = make();
    warned(db);
    await svc.check('w1', 'h1', 'offboard');
    expect(signalsWritten(db)).not.toContain('removal_without_warning');
  });

  it('more than 15 % of a team of 10 removed in 30 days (this removal is the 2nd): turnover signal on the head', async () => {
    const { db, svc } = make();
    warned(db);
    db.staffAction.findMany.mockResolvedValue([{ admin_id: 'x1' }]);
    await svc.check('w1', 'h1', 'pull');
    const rows = db.staffAction.create.mock.calls.map(
      (c) => (c[0] as { data: Record<string, unknown> }).data,
    );
    const t = rows.find((d) => d.reason_code === 'team_turnover_high');
    expect(t).toMatchObject({
      admin_id: 'h1',
      kind: 'signal',
      source: 'system',
    });
    expect(t?.rating_snapshot).toEqual({ removed: 2, team: 10, days: 30 });
  });

  it('one removal in a team of 4 (under the 5-person minimum): no turnover signal', async () => {
    const { db, svc } = make();
    db.adminProfile.count.mockResolvedValue(4);
    await svc.check('w1', 'h1', 'pull');
    expect(signalsWritten(db)).not.toContain('team_turnover_high');
  });

  it('the thresholds come from the settings', async () => {
    const { db, svc } = make({
      'staff.head.turnover_pct': 5,
      'staff.head.turnover_min_people': 2,
    });
    db.adminProfile.count.mockResolvedValue(10);
    await svc.check('w1', 'h1', 'pull'); // 1 of 10 = 10 % > 5 %
    expect(signalsWritten(db)).toContain('team_turnover_high');
  });

  it('removing a worker rated 85+: signal about the removed person', async () => {
    const { db, svc } = make();
    db.staffRatingSnapshot.findFirst.mockResolvedValue({
      rating: 91,
      rank_pct: 3,
    });
    await svc.check('w1', 'h1', 'replace');
    expect(signalsWritten(db)).toContain('top_rated_removed');
  });

  it('removing from the best 20 % even under 85: signal', async () => {
    const { db, svc } = make();
    db.staffRatingSnapshot.findFirst.mockResolvedValue({
      rating: 70,
      rank_pct: 15,
    });
    await svc.check('w1', 'h1', 'replace');
    expect(signalsWritten(db)).toContain('top_rated_removed');
  });

  it('no rating snapshot yet: the rating check is skipped', async () => {
    const { db, svc } = make();
    await svc.check('w1', 'h1', 'replace');
    expect(signalsWritten(db)).not.toContain('top_rated_removed');
  });

  it('two complaints from different people against the head: signal on the head', async () => {
    const { db, svc } = make();
    db.adminAppeal.findMany.mockResolvedValue([
      { author_id: 'a' },
      { author_id: 'b' },
    ]);
    await svc.check('w1', 'h1', 'pull');
    expect(signalsWritten(db)).toContain('head_multi_appeals');
  });

  it('the same signal is not written twice (idempotent per event)', async () => {
    const { db, svc } = make();
    db.staffAction.findFirst.mockResolvedValue({ id: 'already' });
    await svc.check('w1', 'h1', 'offboard');
    expect(db.staffAction.create).not.toHaveBeenCalled();
  });
});

describe('StaffRetaliationService.expire: staff.retaliation-expire', () => {
  it('a hold that ran out: a removal takes effect, the owner is asked (signal about the head)', async () => {
    const { db, svc } = make();
    db.staffRetaliationFlag.findMany.mockResolvedValue([
      { id: 'f1', subject_admin_id: 'w1', action_id: 'act1', appeal_id: 'a1' },
    ]);
    db.staffAction.findMany.mockResolvedValue([
      { id: 'act1', kind: 'offboard' },
    ]);
    db.adminAppeal.findMany
      .mockResolvedValueOnce([{ id: 'a1', head_admin_id: 'h1' }])
      .mockResolvedValue([]);
    const r = await svc.expire(NOW);
    expect(r.holdsEnded).toBe(1);
    expect(db.staffMemberState.updateMany).toHaveBeenCalledWith({
      where: { admin_id: 'w1', state: 'hold_owner' },
      data: expect.objectContaining({ state: 'offboarded' }),
    });
    expect(db.staffAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        admin_id: 'h1',
        reason_code: 'retaliation_decide',
        reason_note: 'flag:f1',
      }),
    });
    expect(JSON.stringify(db.staffAction.create.mock.calls)).not.toContain(
      'w1',
    );
  });

  it('a hold on a rights cut returns the person to work', async () => {
    const { db, svc } = make();
    db.staffRetaliationFlag.findMany.mockResolvedValue([
      { id: 'f1', subject_admin_id: 'w1', action_id: 'act1', appeal_id: 'a1' },
    ]);
    db.staffAction.findMany.mockResolvedValue([{ id: 'act1', kind: 'warn' }]);
    db.adminAppeal.findMany.mockResolvedValue([
      { id: 'a1', head_admin_id: 'h1' },
    ]);
    await svc.expire(NOW);
    expect(db.staffMemberState.updateMany).toHaveBeenCalledWith({
      where: expect.anything(),
      data: expect.objectContaining({ state: 'active' }),
    });
  });

  it('only open flags with an ended hold are picked (the query)', async () => {
    const { db, svc } = make();
    await svc.expire(NOW);
    expect(db.staffRetaliationFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { state: 'open', hold_until: { lte: NOW } },
        take: 500,
      }),
    );
  });

  it('flags whose window is over (a day after the hold) are cleared', async () => {
    const { db, svc } = make();
    db.staffRetaliationFlag.updateMany.mockResolvedValue({ count: 2 });
    const r = await svc.expire(NOW);
    expect(r.flagsCleared).toBe(2);
    expect(db.staffRetaliationFlag.updateMany).toHaveBeenCalledWith({
      where: {
        state: 'open',
        window_until: { lte: NOW },
        hold_until: { lte: new Date(NOW.getTime() - DAY) },
      },
      data: { state: 'cleared', decided_at: NOW },
    });
  });

  it('an appeal unanswered for 7 days reminds the owner once', async () => {
    const { db, svc } = make();
    db.adminAppeal.findMany.mockResolvedValue([
      { id: 'a9', head_admin_id: 'h1', author_alias: 5 },
    ]);
    const r = await svc.expire(NOW);
    expect(r.reminders).toBe(1);
    const asked = (
      db.adminAppeal.findMany.mock.calls[0][0] as {
        where: { status: string; created_at: { lte: Date } };
      }
    ).where;
    expect(asked.status).toBe('new');
    expect(NOW.getTime() - asked.created_at.lte.getTime()).toBe(7 * DAY);
    db.staffAction.findFirst.mockResolvedValue({ id: 'already' });
    expect((await svc.expire(NOW)).reminders).toBe(0);
  });
});
