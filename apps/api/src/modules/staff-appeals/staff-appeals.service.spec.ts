import { NotFoundException } from '@nestjs/common';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { PendingAdminActions } from './staff-admin-actions.port';
import { StaffAppealsService } from './staff-appeals.service';

const NOW = new Date('2026-10-27T12:00:00Z');
const owner = {
  id: 'owner',
  adminRole: 'super_admin',
  sessionId: 's',
  justification: null,
  ip: null,
} as AdminActor;
const worker = {
  id: 'w1',
  adminRole: 'support',
  sessionId: 's',
  justification: null,
  ip: null,
  workspace: 'mass',
  workspaceHead: false,
} as AdminActor;
const head = { ...worker, id: 'h1', workspaceHead: true } as AdminActor;
const deputy = { ...worker, id: 'd1', manageAdmins: true } as AdminActor;

const settings = (stored: Record<string, unknown> = {}) =>
  new StaffSettingsService({
    all: () => Promise.resolve({ 'staff.appeals_enabled': true, ...stored }),
  } as unknown as AppSettingsService);

type Fn = jest.Mock;
function mockDb() {
  const m = (impl?: unknown) => jest.fn().mockResolvedValue(impl);
  const db = {
    adminProfile: {
      findFirst: m({ user_id: 'h1' }),
      findUnique: m({ is_workspace_head: false }),
      findMany: m([]),
      count: m(0),
    },
    adminAppeal: {
      findFirst: m(null),
      findMany: m([]),
      findUnique: m(null),
      create: jest.fn(),
      update: m({}),
      updateMany: m({ count: 1 }),
      count: m(0),
    },
    staffRetaliationFlag: {
      findMany: m([]),
      findFirst: m(null),
      findUnique: m(null),
      updateMany: m({ count: 1 }),
    },
    staffMemberState: { updateMany: m({ count: 1 }) },
    staffAction: {
      findMany: m([]),
      findFirst: m(null),
      create: m({}),
    },
    user: { findMany: m([]), findUnique: m(null) },
    auditLog: { count: m(0) },
    $executeRaw: m(1),
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    typeof fn === 'function' ? fn(db) : Promise.all(fn as unknown[]),
  );
  return db;
}
const queries = (db: ReturnType<typeof mockDb>): number => {
  let n = 0;
  for (const [k, v] of Object.entries(db)) {
    if (typeof v === 'object') {
      for (const f of Object.values(v as Record<string, Fn>)) {
        n += f.mock.calls.length;
      }
    } else if (k === '$executeRaw') n += (v as Fn).mock.calls.length;
  }
  return n;
};

function make(stored: Record<string, unknown> = {}) {
  const db = mockDb();
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const svc = new StaffAppealsService(
    db as unknown as PrismaService,
    settings(stored),
    audit as unknown as AuditLogService,
    new PendingAdminActions(),
  );
  return { db, audit, svc };
}

const appealRow = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  author_id: 'w1',
  author_alias: 12,
  anonymous: true,
  head_admin_id: 'h1',
  kind: 'pressure',
  text: 'He shouts at everyone every day.',
  status: 'new',
  owner_note: null,
  owner_decision: 'none',
  reveal_log: [],
  ack_at: null,
  decided_at: null,
  created_at: NOW,
  ...over,
});

describe('StaffAppealsService: owner only, 404 for everyone else', () => {
  const calls: Array<
    [string, (s: StaffAppealsService, a: AdminActor) => Promise<unknown>]
  > = [
    ['list', (s, a) => s.list(a, {})],
    ['get', (s, a) => s.get(a, 'a1')],
    ['decide', (s, a) => s.decide(a, 'a1', { decision: 'nothing' })],
    ['reveal', (s, a) => s.reveal(a, 'a1')],
    ['flags', (s, a) => s.flags(a, {})],
    ['reverse', (s, a) => s.reverse(a, 'f1', undefined)],
    ['uphold', (s, a) => s.uphold(a, 'f1', undefined)],
    ['signals', (s, a) => s.signals(a)],
  ];

  describe.each(calls)('%s', (_n, run) => {
    it.each([
      ['the head', head],
      ['a worker', worker],
      ['the trusted deputy', deputy],
    ])('%s gets 404 and nothing is read', async (_who, actor) => {
      const { db, svc } = make();
      await expect(run(svc, actor)).rejects.toBeInstanceOf(NotFoundException);
      expect(queries(db)).toBe(0);
    });

    it('the switch off: 404 even for the owner', async () => {
      const { db, svc } = make({ 'staff.appeals_enabled': false });
      await expect(run(svc, owner)).rejects.toBeInstanceOf(NotFoundException);
      expect(queries(db)).toBe(0);
    });
  });

  it('the service has no delete: appeals are a legal record', () => {
    const names = Object.getOwnPropertyNames(StaffAppealsService.prototype);
    expect(names.filter((n) => /delete|remove|destroy/i.test(n))).toEqual([]);
  });
});

describe('StaffAppealsService.file', () => {
  it('a worker files: stored with their id, the receipt carries the number', async () => {
    const { db, svc, audit } = make();
    db.adminAppeal.create.mockResolvedValue(
      appealRow({ anonymous: false, status: 'new' }),
    );
    const r = await svc.file(worker, { text: 'He shouts at everyone.' }, NOW);
    expect(db.adminAppeal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        author_id: 'w1',
        head_admin_id: 'h1',
        anonymous: false,
        kind: 'other',
      }),
    });
    expect(r).toMatchObject({ number: 12, status: 'received' });
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('an anonymous filing writes no audit row that could name the author', async () => {
    const { db, svc, audit } = make();
    db.adminAppeal.create.mockResolvedValue(appealRow());
    await svc.file(
      worker,
      { text: 'He shouts at everyone.', anonymous: true },
      NOW,
    );
    expect(audit.record).not.toHaveBeenCalled();
    expect(db.adminAppeal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ author_id: 'w1', anonymous: true }),
    });
  });

  it('the head, the owner, a workspace without a head: 404', async () => {
    const a = make();
    await expect(
      a.svc.file(head, { text: 'about myself!!' }, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      a.svc.file(owner, { text: 'about myself!!' }, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
    const b = make();
    b.db.adminProfile.findFirst.mockResolvedValue(null);
    await expect(
      b.svc.file(worker, { text: 'nobody to blame' }, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(a.db.adminAppeal.create).not.toHaveBeenCalled();
  });

  it('a head the guard did not flag (switches off) is still a head: 404', async () => {
    const { db, svc } = make();
    const unflagged = { ...worker, id: 'h1' };
    await expect(
      svc.file(unflagged, { text: 'about myself!!' }, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
    db.adminProfile.findUnique.mockResolvedValue({ is_workspace_head: true });
    await expect(svc.mine(unflagged)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.adminAppeal.create).not.toHaveBeenCalled();
  });

  it('three complaints a day at most', async () => {
    const { db, svc } = make();
    db.adminAppeal.count.mockResolvedValue(3);
    await expect(
      svc.file(worker, { text: 'again and again' }, NOW),
    ).rejects.toMatchObject({ status: 429 });
    expect(db.adminAppeal.create).not.toHaveBeenCalled();
  });

  it('two complaints from different people in 60 days: an owner signal about the head', async () => {
    const { db, svc } = make();
    db.adminAppeal.create.mockResolvedValue(appealRow());
    db.adminAppeal.findMany.mockResolvedValue([
      { author_id: 'w1' },
      { author_id: 'w2' },
    ]);
    await svc.file(worker, { text: 'He shouts at everyone.' }, NOW);
    expect(db.staffAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        admin_id: 'h1',
        kind: 'signal',
        reason_code: 'head_multi_appeals',
      }),
    });
  });

  it('one complaint is no signal', async () => {
    const { db, svc } = make();
    db.adminAppeal.create.mockResolvedValue(appealRow());
    db.adminAppeal.findMany.mockResolvedValue([{ author_id: 'w1' }]);
    await svc.file(worker, { text: 'He shouts at everyone.' }, NOW);
    expect(db.staffAction.create).not.toHaveBeenCalled();
  });
});

describe('StaffAppealsService owner inbox', () => {
  it('lists with anonymity applied and costs at most 3 queries', async () => {
    const { db, svc } = make();
    db.adminAppeal.findMany.mockResolvedValue([
      appealRow({ id: 'a1', author_id: 'w1', anonymous: true }),
      appealRow({
        id: 'a2',
        author_id: 'w2',
        anonymous: false,
        author_alias: 13,
      }),
      appealRow({
        id: 'a3',
        author_id: 'w3',
        anonymous: true,
        author_alias: 14,
      }),
    ]);
    db.user.findMany.mockResolvedValue([
      { id: 'h1', first_name: 'Head', last_name: 'One', email: null },
      { id: 'w2', first_name: 'Named', last_name: 'Worker', email: null },
    ]);
    db.staffRetaliationFlag.findMany.mockResolvedValue([{ appeal_id: 'a1' }]);
    const r = await svc.list(owner, { state: 'open', limit: 50 });
    expect(queries(db)).toBeLessThanOrEqual(3);
    expect(r.items.map((i) => i.author)).toEqual([
      { adminId: null, label: 'автор обжалования №12', anonymous: true },
      { adminId: 'w2', label: 'Named Worker', anonymous: false },
      { adminId: null, label: 'автор обжалования №14', anonymous: true },
    ]);
    expect(r.items.map((i) => i.redFlag)).toEqual([true, false, false]);
    // The anonymous authors' ids were not even asked from the user table.
    const asked = (
      db.user.findMany.mock.calls[0][0] as { where: { id: { in: string[] } } }
    ).where.id.in;
    expect(asked.sort()).toEqual(['h1', 'w2']);
    expect(JSON.stringify(r)).not.toContain('"w1"');
    expect(JSON.stringify(r)).not.toContain('"w3"');
  });

  it('pages: one extra row becomes the cursor', async () => {
    const { db, svc } = make();
    db.adminAppeal.findMany.mockResolvedValue([
      appealRow({ id: 'a1' }),
      appealRow({ id: 'a2' }),
    ]);
    const r = await svc.list(owner, { limit: 1 });
    expect(r.items).toHaveLength(1);
    expect(r.nextCursor).toEqual(expect.any(String));
  });

  it('an empty inbox is one query', async () => {
    const { db, svc } = make();
    await svc.list(owner, {});
    expect(queries(db)).toBe(1);
  });

  it('opening a new appeal marks it seen once and audits it', async () => {
    const { db, svc, audit } = make();
    db.adminAppeal.findUnique.mockResolvedValue(appealRow());
    const r = await svc.get(owner, 'a1');
    expect(r.status).toBe('seen');
    expect(r.author.adminId).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.appeals.seen', targetId: 'a1' }),
    );
    db.adminAppeal.updateMany.mockResolvedValue({ count: 0 });
    audit.record.mockClear();
    await svc.get(owner, 'a1');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('decide: records the decision, audits it, names the follow-up call (not run yet)', async () => {
    const { db, svc, audit } = make();
    db.adminAppeal.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'seen',
      head_admin_id: 'h1',
      author_id: 'w1',
    });
    const r = await svc.decide(
      owner,
      'a1',
      { decision: 'fire_head', note: ' bad ' },
      NOW,
    );
    expect(db.adminAppeal.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: expect.objectContaining({
        status: 'resolved',
        owner_decision: 'fire_head',
        owner_note: 'bad',
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.appeals.decide',
        after: { decision: 'fire_head' },
      }),
      db,
    );
    expect(r.followUp).toEqual({
      call: 'POST admin/admins/{id}/disable',
      target: 'head',
      applied: false,
    });
  });

  it('decide: «nothing» has no follow-up; a decided appeal cannot be decided twice', async () => {
    const { db, svc } = make();
    db.adminAppeal.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'seen',
      head_admin_id: 'h1',
      author_id: 'w1',
    });
    expect(
      (await svc.decide(owner, 'a1', { decision: 'nothing' }, NOW)).followUp,
    ).toBeNull();
    db.adminAppeal.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'resolved',
      head_admin_id: 'h1',
      author_id: 'w1',
    });
    await expect(
      svc.decide(owner, 'a1', { decision: 'nothing' }, NOW),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('decide: a failing follow-up port does not undo the recorded decision', async () => {
    const { db, audit } = make();
    db.adminAppeal.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'seen',
      head_admin_id: 'h1',
      author_id: 'w1',
    });
    const svc = new StaffAppealsService(
      db as unknown as PrismaService,
      settings(),
      audit as unknown as AuditLogService,
      { apply: () => Promise.reject(new Error('boom')) },
    );
    const r = await svc.decide(owner, 'a1', { decision: 'fire_worker' }, NOW);
    expect(r.followUp).toMatchObject({ target: 'author', applied: false });
  });
});

describe('StaffAppealsService.reveal', () => {
  const anon = { id: 'a1', anonymous: true, author_id: 'w1' };

  it('reveals with its own audit row and a reveal-log entry, in one transaction', async () => {
    const { db, svc, audit } = make();
    db.adminAppeal.findUnique.mockResolvedValue(anon);
    db.user.findUnique.mockResolvedValue({
      id: 'w1',
      first_name: 'Анна',
      last_name: 'Петрова',
      email: 'a@x.test',
    });
    const r = await svc.reveal(owner, 'a1', NOW);
    expect(r).toMatchObject({
      adminId: 'w1',
      name: 'Анна Петрова',
      revealsLeftToday: 19,
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.appeals.reveal',
        targetId: 'a1',
      }),
      db,
    );
    expect(JSON.stringify(audit.record.mock.calls[0][0])).not.toContain('w1');
    expect(db.adminAppeal.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { reveal_log: [{ at: NOW.toISOString(), by: 'owner' }] },
    });
  });

  it('the daily cap (settings, 20) stops the 21st reveal; nothing is written', async () => {
    const { db, svc, audit } = make();
    db.adminAppeal.findUnique.mockResolvedValue(anon);
    db.auditLog.count.mockResolvedValue(20);
    await expect(svc.reveal(owner, 'a1', NOW)).rejects.toMatchObject({
      status: 429,
    });
    expect(audit.record).not.toHaveBeenCalled();
    expect(db.adminAppeal.update).not.toHaveBeenCalled();
    expect(
      (
        db.auditLog.count.mock.calls[0][0] as {
          where: { created_at: { gte: Date } };
        }
      ).where.created_at.gte.toISOString(),
    ).toBe('2026-10-27T00:00:00.000Z');
  });

  it('the cap follows the setting', async () => {
    const { db, svc } = make({ 'staff.reveal_per_day': 5 });
    db.adminAppeal.findUnique.mockResolvedValue(anon);
    db.auditLog.count.mockResolvedValue(5);
    await expect(svc.reveal(owner, 'a1', NOW)).rejects.toMatchObject({
      status: 429,
    });
  });

  it('a non-anonymous author needs no reveal', async () => {
    const { db, svc } = make();
    db.adminAppeal.findUnique.mockResolvedValue({ ...anon, anonymous: false });
    await expect(svc.reveal(owner, 'a1', NOW)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('an audit failure fails the reveal (nothing is returned)', async () => {
    const { db, svc, audit } = make();
    db.adminAppeal.findUnique.mockResolvedValue(anon);
    audit.record.mockRejectedValue(new Error('audit down'));
    await expect(svc.reveal(owner, 'a1', NOW)).rejects.toThrow('audit down');
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('StaffAppealsService retaliation flags', () => {
  const flag = {
    id: 'f1',
    state: 'open',
    subject_admin_id: 'w1',
  };

  it('reverse: the flag is cleared, the person works again, journal + audit', async () => {
    const { db, svc, audit } = make();
    db.staffRetaliationFlag.findUnique.mockResolvedValue(flag);
    const r = await svc.reverse(owner, 'f1', 'unfair', NOW);
    expect(r).toEqual({ id: 'f1', state: 'cleared', reinstated: true });
    expect(db.staffMemberState.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ admin_id: 'w1' }),
      data: expect.objectContaining({ state: 'active' }),
    });
    expect(db.staffAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        admin_id: 'w1',
        actor_id: 'owner',
        source: 'owner',
        kind: 'reinstate',
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.appeals.retaliation_reverse' }),
      db,
    );
  });

  it('uphold: the removal stands', async () => {
    const { db, svc } = make();
    db.staffRetaliationFlag.findUnique.mockResolvedValue(flag);
    const r = await svc.uphold(owner, 'f1', undefined, NOW);
    expect(r).toEqual({ id: 'f1', state: 'upheld', reinstated: false });
    expect(db.staffMemberState.updateMany).toHaveBeenCalledWith({
      where: expect.anything(),
      data: expect.objectContaining({ state: 'offboarded' }),
    });
  });

  it('a closed flag cannot be closed again', async () => {
    const { db, svc } = make();
    db.staffRetaliationFlag.findUnique.mockResolvedValue({
      ...flag,
      state: 'cleared',
    });
    await expect(
      svc.reverse(owner, 'f1', undefined, NOW),
    ).rejects.toMatchObject({ status: 400 });
    db.staffRetaliationFlag.findUnique.mockResolvedValue(flag);
    db.staffRetaliationFlag.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      svc.reverse(owner, 'f1', undefined, NOW),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('the list masks an anonymous subject and costs at most 3 queries', async () => {
    const { db, svc } = make();
    db.staffRetaliationFlag.findMany.mockResolvedValue([
      {
        id: 'f1',
        appeal_id: 'a1',
        subject_admin_id: 'w1',
        state: 'open',
        window_until: new Date('2027-01-01T00:00:00Z'),
        hold_until: new Date('2026-11-05T00:00:00Z'),
        created_at: NOW,
        decided_at: null,
      },
    ]);
    db.adminAppeal.findMany.mockResolvedValue([
      { id: 'a1', author_id: 'w1', author_alias: 12, anonymous: true },
    ]);
    const r = await svc.flags(owner, { state: 'open' });
    expect(queries(db)).toBeLessThanOrEqual(3);
    expect(r.items[0]).toMatchObject({
      appealNumber: 12,
      subject: { adminId: null, label: 'автор обжалования №12' },
      state: 'open',
    });
    expect(JSON.stringify(r)).not.toContain('"w1"');
  });
});

describe('StaffAppealsService.signals', () => {
  it('names the head and the removed person, but an anonymous author stays «№N»', async () => {
    const { db, svc } = make();
    db.staffAction.findMany.mockResolvedValue([
      {
        id: 's1',
        admin_id: 'w1',
        actor_id: 'h1',
        reason_code: 'removal_without_warning',
        rating_snapshot: { lookbackDays: 60 },
        created_at: NOW,
      },
      {
        id: 's2',
        admin_id: 'h1',
        actor_id: null,
        reason_code: 'head_multi_appeals',
        rating_snapshot: null,
        created_at: NOW,
      },
    ]);
    db.user.findMany.mockResolvedValue([
      { id: 'h1', first_name: 'Head', last_name: null, email: null },
      { id: 'w1', first_name: 'Anna', last_name: null, email: null },
    ]);
    db.adminAppeal.findMany.mockResolvedValue([
      { author_id: 'w1', author_alias: 12 },
    ]);
    const r = await svc.signals(owner);
    expect(r.items[0].subject).toEqual({
      adminId: null,
      name: 'автор обжалования №12',
    });
    expect(r.items[0].actor?.name).toBe('Head');
    expect(r.items[1].subject.name).toBe('Head');
    expect(JSON.stringify(r)).not.toContain('Anna');
  });
});

describe('StaffAppealsService.mine', () => {
  it('shows the author only their own, with the status line and no verdict', async () => {
    const { db, svc } = make();
    db.adminAppeal.findMany.mockResolvedValue([
      appealRow({ status: 'resolved', owner_decision: 'fire_head' }),
    ]);
    const r = await svc.mine(worker);
    expect(db.adminAppeal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { author_id: 'w1' } }),
    );
    expect(r[0].status).toBe('decided');
    expect(JSON.stringify(r)).not.toContain('fire_head');
    expect(JSON.stringify(r)).not.toContain('h1');
  });

  it('the owner and the head have none: 404', async () => {
    const { svc } = make();
    await expect(svc.mine(owner)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.mine(head)).rejects.toBeInstanceOf(NotFoundException);
  });
});
