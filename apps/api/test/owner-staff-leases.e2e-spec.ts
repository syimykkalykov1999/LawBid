import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { AppSettingsService } from '../src/common/app-settings/app-settings.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import type Redis from 'ioredis';
import { totpCode } from '../src/modules/admin-auth/totp.util';
import { LeaseService } from '../src/modules/work-lease/lease.service';
import { StaffPresenceService } from '../src/modules/work-lease/staff-presence.service';
import { adminSession, type AdminSession } from './support/admin-login';

/**
 * Staff package T3 (routing engine): «Следующий» for support, verification,
 * moderation and appeals — one item, one worker — the expiry / disconnect
 * sweep, «не решено» going to somebody else, the head's team view with
 * force release / reassign, and the `/staff` socket. Everything is off by
 * default and writes no lease row while off.
 */
jest.setTimeout(180_000);

describe('Staff work leases (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let leases: LeaseService;
  let presence: StaffPresenceService;
  let base = '';
  let owner: AdminSession;
  let sup1: AdminSession;
  let sup2: AdminSession;
  let sup3: AdminSession;
  let ver1: AdminSession;
  let ver2: AdminSession;
  let mod1: AdminSession;
  let mod2: AdminSession;
  let client: string;
  const sockets: Socket[] = [];
  let stored: Record<string, unknown> = {};
  const api = () => request(base);
  const next = (a: AdminSession, kind: string) =>
    api().post('/api/v1/admin/desk/lease/next').set(a.auth).send({ kind });
  const body = (r: { body: unknown }) =>
    (r.body as { data: Record<string, any> }).data;
  const on = (...keys: string[]) => {
    stored = {
      'staff.lease_enabled': true,
      'staff.lease.wrapup_support_sec': 0,
      ...Object.fromEntries(keys.map((k) => [k, true])),
    };
  };
  const leaseRows = (kind: string, id: string) =>
    prisma.workLease.findFirst({ where: { kind, item_id: id } });

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
    leases = app.get(LeaseService);
    presence = app.get(StaffPresenceService);
    // The staff switches come from this object (default: nothing stored = all off).
    const real = app.get(AppSettingsService);
    jest.spyOn(real, 'all').mockImplementation(() => Promise.resolve(stored));
    // …and the guard reads single switches (workspaces / head) through boolean().
    const realBool = real.boolean.bind(real);
    jest
      .spyOn(real, 'boolean')
      .mockImplementation((k) =>
        String(k).startsWith('staff.')
          ? Promise.resolve(stored[k] === true)
          : realBool(k),
      );

    owner = await adminSession(base, prisma, 'super_admin');
    const sup = { dashboard: 'view', support: 'manage', users: 'view' };
    sup1 = await adminSession(base, prisma, 'support', undefined, sup);
    sup2 = await adminSession(base, prisma, 'support', undefined, sup);
    sup3 = await adminSession(base, prisma, 'support', undefined, sup);
    ver1 = await adminSession(base, prisma, 'verifier');
    ver2 = await adminSession(base, prisma, 'verifier');
    mod1 = await adminSession(base, prisma, 'moderator');
    mod2 = await adminSession(base, prisma, 'moderator');
    const c = await prisma.user.create({
      data: {
        role: 'client',
        email: `cl_${randomUUID().slice(0, 8)}@lawbid-e2e.test`,
      },
    });
    client = c.id;
    // Other suites of this shard may have left open work: only ours counts.
    await prisma.supportTicket.updateMany({
      where: { status: 'open' },
      data: { status: 'closed' },
    });
    await prisma.verificationRequest.updateMany({
      where: { status: { in: ['submitted', 'in_review'] } },
      data: { status: 'needs_more_info' },
    });
    await prisma.report.updateMany({
      where: { status: 'open' },
      data: { status: 'dismissed' },
    });
    await prisma.moderationAppeal.updateMany({
      where: { status: 'pending' },
      data: { status: 'rejected' },
    });
    await prisma.clientReviewAppeal.updateMany({
      where: { status: 'pending' },
      data: { status: 'rejected' },
    });
  });

  /** Each scenario starts with empty hands, queues and counters. */
  afterEach(async () => {
    sockets.splice(0).forEach((x) => x.disconnect());
    await prisma.supportTicket.updateMany({
      where: { status: { in: ['open', 'waiting_user'] } },
      data: { status: 'closed' },
    });
    await prisma.verificationRequest.updateMany({
      where: { status: { in: ['submitted', 'in_review'] } },
      data: { status: 'needs_more_info' },
    });
    await prisma.report.updateMany({
      where: { status: 'open' },
      data: { status: 'dismissed' },
    });
    await prisma.moderationAppeal.updateMany({
      where: { status: 'pending' },
      data: { status: 'rejected' },
    });
    await prisma.clientReviewAppeal.updateMany({
      where: { status: 'pending' },
      data: { status: 'rejected' },
    });
    await prisma.workLease.deleteMany({});
    const redis = app.get<Redis>(REDIS_CLIENT);
    for (const a of [sup1, sup2, sup3, ver1, ver2, mod1, mod2]) {
      await redis.del(
        `staff:wrapup:${a.userId}`,
        `staff:skips:${a.userId}`,
        `staff:away:${a.userId}`,
        `staff:pres:${a.userId}`,
        `staff:act:${a.userId}`,
        `staff:seen:${a.userId}`,
      );
    }
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await prisma.adminProfile.updateMany({
      where: { is_workspace_head: true },
      data: { is_workspace_head: false },
    });
    await app.close();
  });

  // --- item makers (oldest first by the offset in minutes) ----------------------

  const ago = (min: number) => new Date(Date.now() - min * 60_000);

  async function ticket(minutesAgo: number) {
    return prisma.supportTicket.create({
      data: {
        user_id: client,
        subject: 'Lease e2e',
        status: 'open',
        last_message_at: ago(minutesAgo),
        sla_due_at: ago(minutesAgo - 10),
      },
    });
  }

  async function attorney() {
    const u = await prisma.user.create({
      data: {
        role: 'attorney',
        email: `at_${randomUUID().slice(0, 8)}@lawbid-e2e.test`,
      },
    });
    const name = `u${randomUUID().slice(0, 10)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: name,
        username_lower: name,
        languages: ['en'],
      },
    });
    return u.id;
  }

  async function verification(minutesAgo: number) {
    return prisma.verificationRequest.create({
      data: {
        attorney_id: await attorney(),
        status: 'submitted',
        submitted_at: ago(minutesAgo),
      },
    });
  }

  async function report(minutesAgo: number) {
    const target = randomUUID();
    await prisma.report.create({
      data: {
        reporter_id: client,
        target_type: 'post',
        target_id: target,
        reason: 'spam',
        created_at: ago(minutesAgo),
      },
    });
    return target;
  }

  async function modAppeal(decidedBy: string, minutesAgo: number) {
    const target = randomUUID();
    const action = await prisma.moderationAction.create({
      data: {
        admin_id: decidedBy,
        target_type: 'post',
        target_id: target,
        action: 'hide',
      },
    });
    return prisma.moderationAppeal.create({
      data: {
        appellant_id: client,
        action_id: action.id,
        target_type: 'post',
        target_id: target,
        message: 'please look again',
        created_at: ago(minutesAgo),
      },
    });
  }

  async function reviewAppeal(minutesAgo: number) {
    const at = await attorney();
    const review = await prisma.clientReview.create({
      data: { attorney_id: at, client_id: client, rating: 1 },
    });
    return prisma.clientReviewAppeal.create({
      data: {
        review_id: review.id,
        appellant_id: at,
        reason: 'unfair',
        auto_remove_at: new Date(Date.now() + 86_400_000),
        created_at: ago(minutesAgo),
      },
    });
  }

  // --- everything off ------------------------------------------------------------

  it('OFF (the default): «Следующий» is refused, the old support next works as before, no lease row is written', async () => {
    stored = {};
    const t = await ticket(30);
    const refused = await next(sup1, 'support_ticket').expect(403);
    expect((refused.body as { error: { code: string } }).error.code).toBe(
      'FEATURE_DISABLED',
    );
    // The old pull «Следующий»: my most overdue free ticket, taken by me.
    const old = await api()
      .post('/api/v1/admin/support/tickets/next')
      .set(sup1.auth)
      .expect(200);
    expect(body(old).ticket.id).toBe(t.id);
    const row = await prisma.supportTicket.findUnique({ where: { id: t.id } });
    expect(row?.assignee_id).toBe(sup1.userId);
    expect(await leaseRows('support_ticket', t.id)).toBeNull();
    expect(await prisma.workLease.count()).toBe(0);
    expect(await prisma.workLeaseEvent.count()).toBe(0);
    // sweep with everything off does nothing
    await expect(leases.sweep()).resolves.toEqual({ skipped: 'off' });
    // the master on, the queue's own switch off: still refused
    on();
    await next(sup1, 'support_ticket').expect(403);
    await prisma.supportTicket.update({
      where: { id: t.id },
      data: { status: 'closed' },
    });
  });

  // --- support ----------------------------------------------------------------

  it('support: two agents, oldest first, nobody gets the same ticket; the old route follows the leases', async () => {
    on('staff.lease_support_enabled');
    const t1 = await ticket(60);
    const t2 = await ticket(50);
    const r1 = body(await next(sup1, 'support_ticket').expect(200));
    expect(r1.status).toBe('leased');
    expect(r1.lease.itemId).toBe(t1.id);
    const r2 = body(await next(sup2, 'support_ticket').expect(200));
    expect(r2.lease.itemId).toBe(t2.id);
    // the queue's own bookkeeping follows
    expect(
      (await prisma.supportTicket.findUnique({ where: { id: t1.id } }))
        ?.assignee_id,
    ).toBe(sup1.userId);
    // nothing is left for a third agent
    expect(body(await next(sup3, 'support_ticket').expect(200)).status).toBe(
      'empty',
    );
    // the old endpoint, lease on: the same engine, the same answer shape
    const t3 = await ticket(40);
    const old = await api()
      .post('/api/v1/admin/support/tickets/next')
      .set(sup3.auth)
      .expect(200);
    expect(body(old).ticket.id).toBe(t3.id);
    expect((await leaseRows('support_ticket', t3.id))?.admin_id).toBe(
      sup3.userId,
    );
    // my leases
    const me = body(
      await api().get('/api/v1/admin/desk/lease/me').set(sup1.auth).expect(200),
    );
    expect(
      (me.leases as Array<{ itemId: string }>).map((l) => l.itemId),
    ).toEqual([t1.id]);
    expect(me.capacity).toEqual({ chat: 3, other: 1 });
    for (const t of [t1, t2, t3]) {
      await prisma.supportTicket.update({
        where: { id: t.id },
        data: { status: 'closed' },
      });
    }
    await prisma.workLease.deleteMany({});
  });

  it('claim race: two agents claim one ticket together, exactly one wins; two «Следующий» on one ticket, one wins', async () => {
    on('staff.lease_support_enabled');
    const t = await ticket(20);
    const [a, b] = await Promise.all([
      leases.claim('support_ticket', t.id, sup1.userId),
      leases.claim('support_ticket', t.id, sup2.userId),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await prisma.workLease.count({ where: { item_id: t.id } })).toBe(1);
    await leases.release('support_ticket', t.id, (a ?? b)?.adminId as string);

    const [x, y] = await Promise.all([
      next(sup1, 'support_ticket'),
      next(sup2, 'support_ticket'),
    ]);
    const statuses = [body(x).status, body(y).status].sort();
    expect(statuses).toEqual(['empty', 'leased']);
    await prisma.supportTicket.update({
      where: { id: t.id },
      data: { status: 'closed' },
    });
    await prisma.workLease.deleteMany({});
  });

  it('support capacity: three dialogs at once, the fourth waits; done gives a wrap-up pause', async () => {
    on('staff.lease_support_enabled');
    stored['staff.lease.wrapup_support_sec'] = 30;
    const ts = [await ticket(90), await ticket(80), await ticket(70)];
    const extra = await ticket(60);
    for (const t of ts) {
      const r = body(await next(sup1, 'support_ticket').expect(200));
      expect(r.status).toBe('leased');
      expect(r.lease.itemId).toBe(t.id);
    }
    const full = body(await next(sup1, 'support_ticket').expect(200));
    expect(full.status).toBe('busy');
    expect(full.held).toHaveLength(3);
    // a ticket waiting for the client no longer counts against the hands
    await prisma.supportTicket.update({
      where: { id: ts[0].id },
      data: { status: 'waiting_user' },
    });
    const wait = body(await next(sup1, 'support_ticket').expect(200));
    expect(wait.lease.itemId).toBe(extra.id);
    // closing one starts the 30 s wrap-up: «Следующий» is held back
    await api()
      .post(`/api/v1/admin/desk/lease/support_ticket/${ts[1].id}/done`)
      .set(sup1.auth)
      .expect(200);
    const pause = body(await next(sup1, 'support_ticket').expect(200));
    expect(pause.status).toBe('wrap_up');
    expect(pause.retryAfterSec).toBeGreaterThan(0);
    await prisma.supportTicket.updateMany({
      where: { id: { in: [...ts, extra].map((t) => t.id) } },
      data: { status: 'closed' },
    });
    await prisma.workLease.deleteMany({});
    stored['staff.lease.wrapup_support_sec'] = 0;
    await presence.setAway(sup1.userId, false);
  });

  it('time runs out: the sweep returns the ticket to the queue (event row, assignee cleared), the other agent gets it', async () => {
    on('staff.lease_support_enabled');
    const t = await ticket(30);
    expect(body(await next(sup2, 'support_ticket')).lease.itemId).toBe(t.id);
    await prisma.workLease.updateMany({
      where: { item_id: t.id },
      data: { leased_until: new Date(Date.now() - 60_000) },
    });
    const out = await leases.sweep();
    expect(out.released).toBe(1);
    const row = await leaseRows('support_ticket', t.id);
    expect(row?.admin_id).toBeNull();
    const ev = await prisma.workLeaseEvent.findFirst({
      where: { item_id: t.id, event: 'lost' },
    });
    expect(ev?.reason).toBe('expired');
    expect(ev?.admin_id).toBe(sup2.userId);
    expect(
      (await prisma.supportTicket.findUnique({ where: { id: t.id } }))
        ?.assignee_id,
    ).toBeNull();
    expect(body(await next(sup1, 'support_ticket')).lease.itemId).toBe(t.id);
    await prisma.supportTicket.update({
      where: { id: t.id },
      data: { status: 'closed' },
    });
    await prisma.workLease.deleteMany({});
  });

  it('closed tab: no signal for 60 s, the sweep returns the item to the queue; a signal within the grace keeps it', async () => {
    on('staff.lease_support_enabled', 'staff.presence_enabled');
    const t = await ticket(30);
    await presence.heartbeat(sup1.userId, true);
    await presence.heartbeat(sup2.userId, true);
    expect(body(await next(sup1, 'support_ticket')).lease.itemId).toBe(t.id);
    // 50 s later (inside the grace) the tab is still silent: held
    const quiet = await leases.sweep(Date.now() + 50_000);
    expect(quiet.released).toBe(0);
    // 61 s of silence: back to the queue
    const gone = await leases.sweep(Date.now() + 61_000);
    expect(gone.released).toBe(1);
    const ev = await prisma.workLeaseEvent.findFirst({
      where: { item_id: t.id, event: 'lost' },
    });
    expect(ev?.reason).toBe('disconnected');
    expect(body(await next(sup2, 'support_ticket')).lease.itemId).toBe(t.id);
    // an away agent gets nothing new
    await presence.setAway(sup3.userId, true);
    await presence.heartbeat(sup3.userId, true);
    expect(body(await next(sup3, 'support_ticket')).status).toBe('away');
    await presence.setAway(sup3.userId, false);
    await prisma.supportTicket.update({
      where: { id: t.id },
      data: { status: 'closed' },
    });
    await prisma.workLease.deleteMany({});
  });

  it('«не решено»: the ticket comes back first in line, to someone else, never the previous agent', async () => {
    on('staff.lease_support_enabled');
    const t = await ticket(30);
    expect(body(await next(sup1, 'support_ticket')).lease.itemId).toBe(t.id);
    await api()
      .post(`/api/v1/admin/desk/lease/support_ticket/${t.id}/done`)
      .set(sup1.auth)
      .expect(200);
    await prisma.supportTicket.update({
      where: { id: t.id },
      data: { status: 'resolved', assignee_id: sup1.userId },
    });
    // the client writes again: the queue reopens the ticket and tells the engine
    await prisma.supportTicket.update({
      where: { id: t.id },
      data: { status: 'open', assignee_id: null },
    });
    await leases.reopen('support_ticket', t.id);
    // the previous agent is left out…
    expect(body(await next(sup1, 'support_ticket')).status).toBe('empty');
    // …and somebody else gets it
    expect(body(await next(sup2, 'support_ticket')).lease.itemId).toBe(t.id);
    const row = await leaseRows('support_ticket', t.id);
    expect(row?.excluded_admin_ids).toContain(sup1.userId);
    expect(row?.priority).toBeGreaterThan(0);
    expect(
      await prisma.workLeaseEvent.count({
        where: { item_id: t.id, event: 'reopened' },
      }),
    ).toBe(1);
    // nobody else is left after 30 minutes: the previous agent may take it again
    await leases.release('support_ticket', t.id, sup2.userId);
    await prisma.workLease.updateMany({
      where: { item_id: t.id },
      data: { updated_at: new Date(Date.now() - 31 * 60_000) },
    });
    expect(body(await next(sup1, 'support_ticket')).lease.itemId).toBe(t.id);
    await prisma.supportTicket.update({
      where: { id: t.id },
      data: { status: 'closed' },
    });
    await prisma.workLease.deleteMany({});
  });

  it('skip: needs a reason from the list, at most 3 an hour; the item goes to someone else', async () => {
    on('staff.lease_support_enabled');
    stored['staff.lease.chat_capacity'] = 10;
    const ts = [
      await ticket(50),
      await ticket(40),
      await ticket(30),
      await ticket(20),
    ];
    await api()
      .post(`/api/v1/admin/desk/lease/support_ticket/${ts[0].id}/skip`)
      .set(sup3.auth)
      .send({ reason: 'because' })
      .expect(400);
    const got: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = body(await next(sup3, 'support_ticket').expect(200));
      got.push(r.lease.itemId);
    }
    expect(got).toEqual(ts.map((t) => t.id));
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await api()
        .post(`/api/v1/admin/desk/lease/support_ticket/${got[i]}/skip`)
        .set(sup3.auth)
        .send({ reason: 'not_my_topic' })
        .expect(200);
      results.push(body(r).limited === true);
    }
    expect(results).toEqual([false, false, false, true]);
    // the skipped ones never come back to the skipper (the 4th, refused, is still theirs)
    expect(body(await next(sup3, 'support_ticket')).status).toBe('empty');
    // …they go to the next agent, oldest first
    expect(body(await next(sup1, 'support_ticket')).lease.itemId).toBe(got[0]);
    await prisma.supportTicket.updateMany({
      where: { id: { in: ts.map((t) => t.id) } },
      data: { status: 'closed' },
    });
    await prisma.workLease.deleteMany({});
    await prisma.workLeaseEvent.deleteMany({});
    stored['staff.lease.chat_capacity'] = 3;
  });

  // --- verification -------------------------------------------------------------

  it('verification: two verifiers get different documents, oldest first; one in hands; skipped goes elsewhere', async () => {
    on('staff.lease_verification_enabled');
    const r1 = await verification(120);
    const r2 = await verification(60);
    const a = body(await next(ver1, 'verification').expect(200));
    expect(a.lease.itemId).toBe(r1.id);
    const b = body(await next(ver2, 'verification').expect(200));
    expect(b.lease.itemId).toBe(r2.id);
    // capacity 1: the verifier's hands are full
    const busy = body(await next(ver1, 'verification').expect(200));
    expect(busy.status).toBe('busy');
    expect(busy.held[0].itemId).toBe(r1.id);
    // a support agent has no right to this queue
    await next(sup1, 'verification').expect(404);
    // skipping: ver1 will not see r1 again, ver2 (after finishing) does
    await api()
      .post(`/api/v1/admin/desk/lease/verification/${r1.id}/skip`)
      .set(ver1.auth)
      .send({ reason: 'conflict_of_interest' })
      .expect(200);
    expect(body(await next(ver1, 'verification')).status).toBe('empty');
    await api()
      .post(`/api/v1/admin/desk/lease/verification/${r2.id}/done`)
      .set(ver2.auth)
      .expect(200);
    expect(body(await next(ver2, 'verification')).lease.itemId).toBe(r1.id);
    await prisma.verificationRequest.updateMany({
      where: { id: { in: [r1.id, r2.id] } },
      data: { status: 'approved' },
    });
    await prisma.workLease.deleteMany({});
  });

  // --- moderation ------------------------------------------------------------

  it('reports: two moderators get different reported objects, the oldest first', async () => {
    on('staff.lease_report_enabled');
    const tA = await report(90);
    const tB = await report(30);
    expect(body(await next(mod1, 'report').expect(200)).lease.itemId).toBe(tA);
    expect(body(await next(mod2, 'report').expect(200)).lease.itemId).toBe(tB);
    expect(body(await next(mod1, 'report')).status).toBe('busy');
    // the queue was already empty for a third: only after a release
    await api()
      .post(`/api/v1/admin/desk/lease/report/${tA}/release`)
      .set(mod1.auth)
      .expect(200);
    expect(body(await next(mod2, 'report')).status).toBe('busy');
    expect(body(await next(mod1, 'report')).lease.itemId).toBe(tA);
    await prisma.report.updateMany({
      where: { target_id: { in: [tA, tB] } },
      data: { status: 'dismissed' },
    });
    await prisma.workLease.deleteMany({});
  });

  // --- appeals ---------------------------------------------------------------

  it('appeals: the admin who took the disputed decision never gets the appeal; review appeals lease too', async () => {
    on('staff.lease_appeal_enabled');
    const ap = await modAppeal(mod1.userId, 40);
    // mod1 decided the disputed action: nothing for mod1
    expect(body(await next(mod1, 'mod_appeal').expect(200)).status).toBe(
      'empty',
    );
    const got = body(await next(mod2, 'mod_appeal').expect(200));
    expect(got.lease.itemId).toBe(ap.id);
    const ra = await reviewAppeal(30);
    expect(
      body(await next(mod1, 'review_appeal').expect(200)).lease.itemId,
    ).toBe(ra.id);
    expect(body(await next(mod2, 'review_appeal')).status).toBe('busy');
    await prisma.moderationAppeal.update({
      where: { id: ap.id },
      data: { status: 'rejected' },
    });
    await prisma.clientReviewAppeal.update({
      where: { id: ra.id },
      data: { status: 'rejected' },
    });
    await prisma.workLease.deleteMany({});
  });

  // --- the head ----------------------------------------------------------------

  it('head: sees «in work by X», releases and reassigns with a fresh 2FA code and an audit row; others cannot', async () => {
    on(
      'staff.lease_support_enabled',
      'staff.head_enabled',
      'staff.workspaces_enabled',
    );
    await prisma.adminProfile.update({
      where: { user_id: sup1.userId },
      data: { is_workspace_head: true },
    });
    const t = await ticket(30);
    expect(body(await next(sup2, 'support_ticket')).lease.itemId).toBe(t.id);

    // a plain agent cannot open the team view
    await api().get('/api/v1/admin/desk/lease/team').set(sup2.auth).expect(403);
    const team = body(
      await api()
        .get('/api/v1/admin/desk/lease/team')
        .set(sup1.auth)
        .expect(200),
    );
    const tile = (
      team.tiles as Array<{ adminId: string; items: Array<{ itemId: string }> }>
    ).find((x) => x.adminId === sup2.userId);
    expect(tile?.items.map((i) => i.itemId)).toEqual([t.id]);

    // without a fresh code: refused
    await api()
      .post(`/api/v1/admin/desk/lease/team/${sup2.userId}/release`)
      .set(sup1.auth)
      .send({})
      .expect(403);
    await api()
      .post('/api/v1/admin/auth/step-up')
      .set(sup1.auth)
      .send({ code: totpCode(sup1.totpSecret, Date.now() + 30_000) })
      .expect(200);

    // reassign to a third agent
    const moved = body(
      await api()
        .post(`/api/v1/admin/desk/lease/team/${sup2.userId}/reassign`)
        .set(sup1.auth)
        .send({
          kind: 'support_ticket',
          itemId: t.id,
          toAdminId: sup3.userId,
          reason: 'sup2 is overloaded',
        })
        .expect(200),
    );
    expect(moved.itemId).toBe(t.id);
    expect((await leaseRows('support_ticket', t.id))?.admin_id).toBe(
      sup3.userId,
    );
    expect(
      (await prisma.supportTicket.findUnique({ where: { id: t.id } }))
        ?.assignee_id,
    ).toBe(sup3.userId);

    // a verifier cannot receive a support ticket
    await api()
      .post(`/api/v1/admin/desk/lease/team/${sup3.userId}/reassign`)
      .set(sup1.auth)
      .send({
        kind: 'support_ticket',
        itemId: t.id,
        toAdminId: ver1.userId,
      })
      .expect(403);

    // force release: the item goes back to the queue
    const rel = body(
      await api()
        .post(`/api/v1/admin/desk/lease/team/${sup3.userId}/release`)
        .set(sup1.auth)
        .send({ kind: 'support_ticket', itemId: t.id })
        .expect(200),
    );
    expect(rel.released).toBe(1);
    expect((await leaseRows('support_ticket', t.id))?.admin_id).toBeNull();
    const audits = await prisma.auditLog.findMany({
      where: {
        admin_id: sup1.userId,
        action: { in: ['staff.lease_force_release', 'staff.lease_reassign'] },
      },
    });
    expect(audits.map((a) => a.action).sort()).toEqual([
      'staff.lease_force_release',
      'staff.lease_reassign',
    ]);
    // the head never reaches into another workspace: a finance person is out of reach
    const fin = await adminSession(base, prisma, 'finance');
    await prisma.adminProfile.update({
      where: { user_id: fin.userId },
      data: { workspace: 'finance' },
    });
    await api()
      .post(`/api/v1/admin/desk/lease/team/${fin.userId}/release`)
      .set(sup1.auth)
      .send({})
      .expect(403);
    // the owner may touch anyone (with their own fresh code)
    await api()
      .post('/api/v1/admin/auth/step-up')
      .set(owner.auth)
      .send({ code: totpCode(owner.totpSecret, Date.now() + 30_000) })
      .expect(200);
    await api()
      .post(`/api/v1/admin/desk/lease/team/${sup3.userId}/release`)
      .set(owner.auth)
      .send({})
      .expect(200);
    await prisma.supportTicket.update({
      where: { id: t.id },
      data: { status: 'closed' },
    });
    await prisma.workLease.deleteMany({});
    await prisma.adminProfile.update({
      where: { user_id: sup1.userId },
      data: { is_workspace_head: false },
    });
  });

  // --- the /staff socket ---------------------------------------------------------

  function connect(a: AdminSession): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const s = io(`${base}/staff`, {
        transports: ['websocket'],
        auth: { token: a.accessToken },
        forceNew: true,
        reconnection: false,
      });
      sockets.push(s);
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  }

  it('/staff socket: switches off -> NOT_ENABLED; on -> a heartbeat updates presence (no database row)', async () => {
    stored = {};
    const off = io(`${base}/staff`, {
      transports: ['websocket'],
      auth: { token: sup1.accessToken },
      forceNew: true,
      reconnection: false,
    });
    sockets.push(off);
    const err = await new Promise<{ code: string }>((resolve) =>
      off.on('staff:error', resolve),
    );
    expect(err.code).toBe('NOT_ENABLED');

    on('staff.presence_enabled');
    const s = await connect(sup1);
    const ack = await new Promise<{ ok: boolean; status: string }>((resolve) =>
      s.emit('presence:hb', { active: true }, resolve),
    );
    expect(ack).toEqual({ ok: true, status: 'online' });
    const r = await presence.read(sup1.userId);
    expect(r.signalling).toBe(true);
    expect(await presence.status(sup1.userId)).toBe('online');
    // a bad token is refused
    const bad = io(`${base}/staff`, {
      transports: ['websocket'],
      auth: { token: 'nope' },
      forceNew: true,
      reconnection: false,
    });
    sockets.push(bad);
    const e2 = await new Promise<{ code: string }>((resolve) =>
      bad.on('staff:error', resolve),
    );
    expect(e2.code).toBe('UNAUTHORIZED');
  });

  it('/staff socket: the holder receives lease:granted and lease:lost', async () => {
    on('staff.lease_support_enabled', 'staff.presence_enabled');
    const s = await connect(sup2);
    await new Promise((r) => s.emit('presence:hb', { active: true }, r));
    const t = await ticket(30);
    const granted = new Promise<{ itemId: string }>((resolve) =>
      s.on('lease:granted', resolve),
    );
    await new Promise((r) => setTimeout(r, 300));
    expect(body(await next(sup2, 'support_ticket')).lease.itemId).toBe(t.id);
    expect((await granted).itemId).toBe(t.id);
    const lost = new Promise<{ itemId: string; reason: string }>((resolve) =>
      s.on('lease:lost', resolve),
    );
    await leases.forceRelease('support_ticket', t.id, sup2.userId);
    const l = await lost;
    expect(l).toMatchObject({ itemId: t.id, reason: 'forced' });
    await prisma.supportTicket.update({
      where: { id: t.id },
      data: { status: 'closed' },
    });
    await prisma.workLease.deleteMany({});
  });
});
