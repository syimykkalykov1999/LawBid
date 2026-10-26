import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { SupportDeskService } from '../src/modules/support/support-desk.service';
import { RewardsService } from '../src/modules/rewards/rewards.service';
import { periodOf } from '../src/modules/rewards/rewards.rules';
import { adminSession, type AdminSession } from './support/admin-login';

/**
 * Owner 2026-10-05:
 *  - support 24/7: tickets go to the agent on shift, an answer is due by
 *    the SLA, after hours the user gets an automatic answer, a late
 *    answer is flagged and goes one priority up, ready answers are
 *    counted, «Следующий» never hands one ticket to two agents, the
 *    stats count each employee's work;
 *  - «Лучший сотрудник»: off by default (nothing for anyone), the owner
 *    switches it on, the leaderboard counts finished work, a prize with a
 *    bonus lands in Зарплаты and is canceled when taken back;
 *  - «Рабочее место»: each admin sees only their own queues.
 */
jest.setTimeout(120_000);

describe('Support 24/7, rewards, workspace (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let desk: SupportDeskService;
  let base = '';
  let owner: AdminSession;
  let agent: AdminSession;
  let agent2: AdminSession;
  let verifier: AdminSession;
  let original: Record<string, unknown>;

  const api = () => request(base);
  const list = <T>(v: unknown): T[] => (v ?? []) as T[];
  const support = { dashboard: 'view', support: 'manage', users: 'view' };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    desk = app.get(SupportDeskService);
    owner = await adminSession(base, prisma, 'super_admin');
    agent = await adminSession(base, prisma, 'support', undefined, support);
    agent2 = await adminSession(base, prisma, 'support', undefined, support);
    verifier = await adminSession(base, prisma, 'verifier');
    // Only this suite's agents are on shift.
    await prisma.supportAgent.updateMany({ data: { on_shift: false } });
    const s = await api()
      .get('/api/v1/admin/support/settings')
      .set(owner.auth)
      .expect(200);
    original = s.body.data as Record<string, unknown>;
  });

  afterAll(async () => {
    await api()
      .put('/api/v1/admin/support/settings')
      .set(owner.auth)
      .send(original);
    await api()
      .put('/api/v1/admin/rewards/settings')
      .set(owner.auth)
      .send({ enabled: false, autoAward: true });
    await prisma.supportAgent.updateMany({ data: { on_shift: false } });
    await app.close();
  });

  async function client() {
    const u = await prisma.user.create({
      data: {
        role: 'client',
        email: `cl_${randomUUID().slice(0, 8)}@lawbid-e2e.test`,
        ui_language: 'ru',
      },
    });
    const token = tokens.signAccessToken({
      sub: u.id,
      role: 'client',
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  it('support 24/7: shift, SLA, after-hours answer, ready answers, stats', async () => {
    // Closed right now: the only working day is tomorrow (Chicago time).
    const today = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'short',
    }).format(new Date());
    const iso =
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(today) + 1;
    const tomorrow = (iso % 7) + 1;
    const settings = await api()
      .put('/api/v1/admin/support/settings')
      .set(agent.auth)
      .send({
        alwaysOpen: false,
        openDays: [tomorrow],
        openFromHour: 9,
        openToHour: 18,
        timeZone: 'America/Chicago',
        autoAssign: true,
        autoReply: true,
        slaFirstResponseMinutes: 60,
        autoCloseResolvedDays: 7,
      })
      .expect(200);
    expect(settings.body.data).toMatchObject({
      alwaysOpen: false,
      openDays: [tomorrow],
    });
    // A bad time zone is ignored, not saved.
    await api()
      .put('/api/v1/admin/support/settings')
      .set(agent.auth)
      .send({ timeZone: 'Mars/Olympus' })
      .expect(200)
      .expect((r) => expect(r.body.data.timeZone).toBe('America/Chicago'));
    // A verifier can't reach support at all (the section is hidden).
    await api()
      .get('/api/v1/admin/support/settings')
      .set(verifier.auth)
      .expect(404);

    // The agent goes on shift.
    const shift = await api()
      .put('/api/v1/admin/support/agents/me')
      .set(agent.auth)
      .send({ onShift: true, maxOpen: 5 })
      .expect(200);
    expect(shift.body.data).toMatchObject({
      adminId: agent.userId,
      onShift: true,
      maxOpen: 5,
    });

    const cli = await client();
    const info = await api()
      .get('/api/v1/support/info')
      .set(cli.auth)
      .expect(200);
    expect(info.body.data).toMatchObject({
      open: false,
      alwaysOpen: false,
      expectedReplyMinutes: 60,
    });
    expect(info.body.data.opensAt).toEqual(expect.any(String));

    const created = await api()
      .post('/api/v1/support/tickets')
      .set(cli.auth)
      .send({ subject: 'Cannot log in', category: 'account', body: 'Help' })
      .expect(201);
    const t = created.body.data;
    // The after-hours answer comes at once, from the team.
    expect(t.messages).toHaveLength(2);
    expect(t.messages[1]).toMatchObject({
      author: 'support',
      authorName: 'LawBid Support',
    });
    expect(t.messages[1].body).toContain('нерабочее время');
    const row = await prisma.supportTicket.findUniqueOrThrow({
      where: { id: t.id },
    });
    expect(row.assignee_id).toBe(agent.userId);
    expect(row.sla_due_at).not.toBeNull();

    // A ready answer used in a reply is counted; the first answer is kept.
    const macro = await api()
      .post('/api/v1/admin/support/macros')
      .set(agent.auth)
      .send({
        title: 'Reset password',
        body: 'Здравствуйте, {name}! Нажмите «Забыли пароль».',
        category: 'account',
      })
      .expect(201);
    await api()
      .post(`/api/v1/admin/support/tickets/${t.id}/messages`)
      .set(agent.auth)
      .send({
        body: 'Здравствуйте! Нажмите «Забыли пароль».',
        macroId: macro.body.data.id,
      })
      .expect(201);
    const answered = await prisma.supportTicket.findUniqueOrThrow({
      where: { id: t.id },
    });
    expect(answered.sla_due_at).toBeNull();
    expect(answered.first_response_by).toBe(agent.userId);
    const macros = await api()
      .get('/api/v1/admin/support/macros')
      .set(agent.auth)
      .expect(200);
    expect(
      list<{ id: string; uses: number }>(macros.body.data).find(
        (m) => m.id === macro.body.data.id,
      )?.uses,
    ).toBe(1);
    const detail = await api()
      .get(`/api/v1/admin/support/tickets/${t.id}`)
      .set(agent.auth)
      .expect(200);
    expect(
      list<{ auto?: boolean; authorName: string }>(
        detail.body.data.messages,
      ).some((m) => m.auto && m.authorName === 'Автоответ'),
    ).toBe(true);

    // The user writes again: an answer is due again.
    await api()
      .post(`/api/v1/support/tickets/${t.id}/messages`)
      .set(cli.auth)
      .send({ body: 'Did not help' })
      .expect(201);
    const due = await prisma.supportTicket.findUniqueOrThrow({
      where: { id: t.id },
    });
    expect(due.sla_due_at).not.toBeNull();

    // Late: flagged, one priority up, listed under «Просрочено».
    await prisma.supportTicket.update({
      where: { id: t.id },
      data: { sla_due_at: new Date(Date.now() - 60_000) },
    });
    const swept = await desk.sweep();
    expect(swept.breached).toBeGreaterThanOrEqual(1);
    const late = await prisma.supportTicket.findUniqueOrThrow({
      where: { id: t.id },
    });
    expect(late.sla_breached_at).not.toBeNull();
    expect(late.priority).toBe('high');
    const breached = await api()
      .get('/api/v1/admin/support/tickets?sla=breached')
      .set(agent.auth)
      .expect(200);
    expect(list<{ id: string }>(breached.body.data).map((r) => r.id)).toContain(
      t.id,
    );
    const stats = await api()
      .get('/api/v1/admin/support/stats')
      .set(agent.auth)
      .expect(200);
    expect(stats.body.data.slaBreached).toBeGreaterThanOrEqual(1);

    // Resolved by the agent: counted for them.
    await api()
      .patch(`/api/v1/admin/support/tickets/${t.id}`)
      .set(agent.auth)
      .send({ status: 'resolved' })
      .expect(200);
    const staff = await api()
      .get('/api/v1/admin/support/staff-stats')
      .set(agent.auth)
      .expect(200);
    const me = list<{ adminId: string }>(staff.body.data).find(
      (s) => s.adminId === agent.userId,
    );
    expect(me).toMatchObject({
      replies: 1,
      firstResponses: 1,
      resolved: 1,
      slaBreaches: 1,
      onShift: true,
    });

    // «Следующий»: an unassigned ticket goes to exactly one agent.
    await prisma.supportAgent.updateMany({ data: { on_shift: false } });
    const free = await api()
      .post('/api/v1/support/tickets')
      .set(cli.auth)
      .send({ subject: 'Billing', category: 'billing', body: 'Charged twice' })
      .expect(201);
    const freeRow = await prisma.supportTicket.findUniqueOrThrow({
      where: { id: free.body.data.id },
    });
    expect(freeRow.assignee_id).toBeNull();
    // Older unassigned tickets of other suites may come first; take until
    // this one is handed out, never to both.
    const takers = new Set<string>();
    for (let i = 0; i < 50 && takers.size === 0; i++) {
      const [a, b] = await Promise.all([
        api().post('/api/v1/admin/support/tickets/next').set(agent.auth),
        api().post('/api/v1/admin/support/tickets/next').set(agent2.auth),
      ]);
      if (a.body.data.ticket?.id === free.body.data.id) takers.add('a');
      if (b.body.data.ticket?.id === free.body.data.id) takers.add('b');
      if (!a.body.data.ticket && !b.body.data.ticket) break;
      // Close what was handed out so «Следующий» moves on.
      for (const r of [a, b]) {
        const id = r.body.data.ticket?.id;
        if (id && id !== free.body.data.id) {
          await prisma.supportTicket.update({
            where: { id },
            data: { status: 'closed' },
          });
        }
      }
    }
    expect(takers.size).toBe(1);

    // Resolved tickets close by themselves after N days.
    const old = await api()
      .post('/api/v1/support/tickets')
      .set(cli.auth)
      .send({ subject: 'Old', category: 'other', body: 'Solved long ago' })
      .expect(201);
    await prisma.supportTicket.update({
      where: { id: old.body.data.id },
      data: {
        status: 'resolved',
        resolved_at: new Date(Date.now() - 30 * 86_400_000),
      },
    });
    await desk.sweep();
    const closed = await prisma.supportTicket.findUniqueOrThrow({
      where: { id: old.body.data.id },
    });
    expect(closed.status).toBe('closed');
  });

  it('«Лучший сотрудник»: off by default, owner switch, bonus in payroll', async () => {
    await api()
      .put('/api/v1/admin/rewards/settings')
      .set(owner.auth)
      .send({ enabled: false })
      .expect(200);
    // Off: nothing anywhere.
    await api()
      .get('/api/v1/admin/rewards/leaderboard')
      .set(owner.auth)
      .expect(404);
    const offMine = await api()
      .get('/api/v1/admin/workspace/rewards')
      .set(agent.auth)
      .expect(200);
    expect(offMine.body.data).toEqual({
      enabled: false,
      period: null,
      ranks: [],
      awards: [],
    });
    // Staff never reach the owner's page.
    await api()
      .get('/api/v1/admin/rewards/settings')
      .set(agent.auth)
      .expect(404);

    const on = await api()
      .put('/api/v1/admin/rewards/settings')
      .set(owner.auth)
      .send({
        enabled: true,
        autoAward: false,
        period: 'month',
        departments: [
          { key: 'support', prize: 'Выходной день', bonusCents: 5000 },
        ],
      })
      .expect(200);
    expect(
      list<{ key: string }>(on.body.data.departments).find(
        (d) => d.key === 'support',
      ),
    ).toMatchObject({
      prize: 'Выходной день',
      bonusCents: 5000,
      enabled: true,
    });

    const period = periodOf('month', new Date());
    const board = await api()
      .get(`/api/v1/admin/rewards/leaderboard?period=${period}`)
      .set(owner.auth)
      .expect(200);
    const sup = list<{ key: string; rows: unknown }>(
      board.body.data.departments,
    ).find((d) => d.key === 'support');
    const mine = list<{ adminId: string; score: number }>(sup?.rows).find(
      (r) => r.adminId === agent.userId,
    );
    expect(mine?.score).toBeGreaterThanOrEqual(1);

    const mineOn = await api()
      .get('/api/v1/admin/workspace/rewards')
      .set(agent.auth)
      .expect(200);
    expect(mineOn.body.data.enabled).toBe(true);
    expect(
      list<{ department: string; rank: number }>(mineOn.body.data.ranks).find(
        (r) => r.department === 'support',
      )?.rank,
    ).toEqual(expect.any(Number));

    // A verifier is not in support: refused.
    await api()
      .post('/api/v1/admin/rewards/awards')
      .set(owner.auth)
      .send({ period, department: 'support', adminId: verifier.userId })
      .expect(400);
    const award = await api()
      .post('/api/v1/admin/rewards/awards')
      .set(owner.auth)
      .send({ period, department: 'support', adminId: agent.userId })
      .expect(201);
    expect(award.body.data).toMatchObject({
      prize: 'Выходной день',
      bonusCents: 5000,
      onPayroll: true,
    });
    const accrual = await prisma.payrollAccrual.findUniqueOrThrow({
      where: { event_ref: `reward:${award.body.data.id}` },
    });
    expect(accrual).toMatchObject({
      amount_cents: 5000,
      kind: 'bonus',
      source: 'rewards',
      status: 'pending',
    });
    // Twice in one period: refused.
    await api()
      .post('/api/v1/admin/rewards/awards')
      .set(owner.auth)
      .send({ period, department: 'support', adminId: agent.userId })
      .expect(400);
    // Taken back: the unpaid bonus is canceled.
    await api()
      .delete(`/api/v1/admin/rewards/awards/${award.body.data.id}`)
      .set(owner.auth)
      .expect(204);
    const canceled = await prisma.payrollAccrual.findUniqueOrThrow({
      where: { id: accrual.id },
    });
    expect(canceled.status).toBe('canceled');

    // Automatic once the period is over: its leader gets the prize once.
    const rewards = app.get(RewardsService);
    await api()
      .put('/api/v1/admin/rewards/settings')
      .set(owner.auth)
      .send({ autoAward: true })
      .expect(200);
    const nextMonth = new Date();
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 2);
    expect(await rewards.autoAward(nextMonth)).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.staffReward.count({
        where: { period, department: 'support', auto: true },
      }),
    ).toBeGreaterThanOrEqual(1);
    expect(await rewards.autoAward(nextMonth)).toBe(0);
  });

  it('«Рабочее место»: only my own queues', async () => {
    const ws = await api()
      .get('/api/v1/admin/workspace')
      .set(agent.auth)
      .expect(200);
    const keys = list<{ key: string }>(ws.body.data.queues).map((q) => q.key);
    expect(keys).toContain('support');
    expect(keys).not.toContain('verification');
    expect(keys).not.toContain('money');
    expect(ws.body.data.shift).toMatchObject({ adminId: agent.userId });
    const v = await api()
      .get('/api/v1/admin/workspace')
      .set(verifier.auth)
      .expect(200);
    expect(list<{ key: string }>(v.body.data.queues).map((q) => q.key)).toEqual(
      ['verification'],
    );
    expect(v.body.data.shift).toBeNull();
    const o = await api()
      .get('/api/v1/admin/workspace')
      .set(owner.auth)
      .expect(200);
    expect(list<{ key: string }>(o.body.data.queues).map((q) => q.key)).toEqual(
      expect.arrayContaining([
        'verification',
        'support',
        'moderation',
        'payroll',
        'money',
      ]),
    );
  });
});
