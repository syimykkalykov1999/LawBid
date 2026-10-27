import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { AppSettingsService } from '../src/common/app-settings/app-settings.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { STAFF_RECORDER } from '../src/modules/staff-core/staff-recorder.port';
import { SupportService } from '../src/modules/support/support.service';
import { adminSession, type AdminSession } from './support/admin-login';

/**
 * Staff package T4 (queues on the routing engine): a decision made on a card
 * closes the worker's lease by itself and is recorded; a client writing to a
 * resolved ticket sends it to ANOTHER agent; a golden task is handed out
 * like any item and checked on close; the desk's presence signal; and with
 * everything off the queues behave as before and no lease row appears.
 */
jest.setTimeout(180_000);

describe('Staff desk routing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base = '';
  let sup1: AdminSession;
  let sup2: AdminSession;
  let mod1: AdminSession;
  let mod2: AdminSession;
  let client: string;
  let stored: Record<string, unknown> = {};
  let recorded: Array<Record<string, unknown>> = [];
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
  const ago = (min: number) => new Date(Date.now() - min * 60_000);

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
    const real = app.get(AppSettingsService);
    jest.spyOn(real, 'all').mockImplementation(() => Promise.resolve(stored));
    const realBool = real.boolean.bind(real);
    jest
      .spyOn(real, 'boolean')
      .mockImplementation((k) =>
        String(k).startsWith('staff.')
          ? Promise.resolve(stored[k] === true)
          : realBool(k),
      );
    // Whatever the rating recorder is, we only look at what the queues report.
    const recorder = app.get<{
      record: (e: Record<string, unknown>) => unknown;
    }>(STAFF_RECORDER);
    jest.spyOn(recorder, 'record').mockImplementation((e) => {
      recorded.push(e);
      return Promise.resolve();
    });

    const sup = { dashboard: 'view', support: 'manage', users: 'view' };
    sup1 = await adminSession(base, prisma, 'support', undefined, sup);
    sup2 = await adminSession(base, prisma, 'support', undefined, sup);
    mod1 = await adminSession(base, prisma, 'moderator');
    mod2 = await adminSession(base, prisma, 'moderator');
    client = (
      await prisma.user.create({
        data: {
          role: 'client',
          email: `cl_${randomUUID().slice(0, 8)}@lawbid-e2e.test`,
        },
      })
    ).id;
    await prisma.supportTicket.updateMany({
      where: { status: 'open' },
      data: { status: 'closed' },
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

  afterEach(async () => {
    recorded = [];
    await prisma.supportTicket.updateMany({
      where: { status: { in: ['open', 'waiting_user', 'resolved'] } },
      data: { status: 'closed' },
    });
    await prisma.moderationAppeal.updateMany({
      where: { status: 'pending' },
      data: { status: 'rejected' },
    });
    await prisma.clientReviewAppeal.updateMany({
      where: { status: 'pending' },
      data: { status: 'rejected' },
    });
    await prisma.staffReviewSample.deleteMany({
      where: { decided_by: { in: [sup1.userId, sup2.userId] } },
    });
    await prisma.workLease.deleteMany({});
    const redis = app.get<Redis>(REDIS_CLIENT);
    for (const a of [sup1, sup2, mod1, mod2]) {
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
    await app.close();
  });

  const ticket = (minutesAgo: number, status = 'open') =>
    prisma.supportTicket.create({
      data: {
        user_id: client,
        subject: 'Desk routing e2e',
        status,
        last_message_at: ago(minutesAgo),
        sla_due_at: ago(minutesAgo - 10),
      },
    });

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

  // --- close with the decision ----------------------------------------------------

  it('support: resolving the ticket (the decision) ends the lease by itself and is recorded; the wrap-up starts', async () => {
    on('staff.lease_support_enabled');
    stored['staff.lease.wrapup_support_sec'] = 30;
    const t = await ticket(40);
    expect(
      body(await next(sup1, 'support_ticket').expect(200)).lease.itemId,
    ).toBe(t.id);
    await api()
      .patch(`/api/v1/admin/support/tickets/${t.id}`)
      .set(sup1.auth)
      .send({ status: 'resolved' })
      .expect(200);
    const row = await prisma.workLease.findFirst({ where: { item_id: t.id } });
    expect(row?.admin_id).toBeNull();
    expect(
      await prisma.workLeaseEvent.count({
        where: { item_id: t.id, admin_id: sup1.userId, event: 'done' },
      }),
    ).toBe(1);
    expect(recorded).toEqual([
      expect.objectContaining({
        adminId: sup1.userId,
        itemKind: 'support_ticket',
        itemId: t.id,
        outcome: 'resolve',
      }),
    ]);
    // the desk's own «done» afterwards is harmless and does not record twice
    await api()
      .post(`/api/v1/admin/desk/lease/support_ticket/${t.id}/done`)
      .set(sup1.auth)
      .send({})
      .expect(200);
    expect(recorded).toHaveLength(1);
    const pause = body(await next(sup1, 'support_ticket').expect(200));
    expect(pause.status).toBe('wrap_up');
  });

  it('moderation appeal: the decision closes the lease and is recorded; the one who took the disputed decision never gets it', async () => {
    on('staff.lease_appeal_enabled');
    const a = await modAppeal(mod1.userId, 30);
    expect(body(await next(mod1, 'mod_appeal').expect(200)).status).toBe(
      'empty',
    );
    expect(body(await next(mod2, 'mod_appeal').expect(200)).lease.itemId).toBe(
      a.id,
    );
    await api()
      .post(`/api/v1/admin/moderation/appeals/${a.id}/decision`)
      .set(mod2.auth)
      .send({ accept: false, note: 'decision stands' })
      .expect(201);
    expect(
      (await prisma.workLease.findFirst({ where: { item_id: a.id } }))
        ?.admin_id,
    ).toBeNull();
    expect(recorded).toEqual([
      expect.objectContaining({
        adminId: mod2.userId,
        itemKind: 'mod_appeal',
        itemId: a.id,
        outcome: 'keep',
      }),
    ]);
  });

  // --- «не решено» -------------------------------------------------------------------

  it('the client writes to a resolved ticket: it goes back first in line, to ANOTHER agent', async () => {
    on('staff.lease_support_enabled');
    const t = await ticket(50);
    await next(sup1, 'support_ticket').expect(200);
    await api()
      .patch(`/api/v1/admin/support/tickets/${t.id}`)
      .set(sup1.auth)
      .send({ status: 'resolved' })
      .expect(200);
    await app.get(SupportService).reply(client, t.id, 'it is still broken');
    const after = await prisma.supportTicket.findUnique({
      where: { id: t.id },
    });
    expect(after?.status).toBe('open');
    expect(after?.assignee_id).toBeNull();
    const row = await prisma.workLease.findFirst({ where: { item_id: t.id } });
    expect(row?.priority).toBeGreaterThan(0);
    expect(row?.excluded_admin_ids).toContain(sup1.userId);
    // not to the one who closed it …
    expect(body(await next(sup1, 'support_ticket').expect(200)).status).toBe(
      'empty',
    );
    // … to the other agent, and before older tickets
    const older = await ticket(500);
    const got = body(await next(sup2, 'support_ticket').expect(200));
    expect(got.lease.itemId).toBe(t.id);
    expect(older.id).not.toBe(t.id);
  });

  // --- golden tasks ---------------------------------------------------------------

  it('golden: handed out first, like any item; checked on close; never to another person', async () => {
    on(
      'staff.lease_support_enabled',
      'staff.rating_enabled',
      'staff.golden_enabled',
    );
    const real = await ticket(10);
    const decided = await ticket(2000, 'closed');
    await prisma.staffReviewSample.create({
      data: {
        decision_kind: 'golden_support_ticket',
        item_id: decided.id,
        decided_by: sup1.userId,
        is_golden: true,
        stage: 'golden',
        golden_answer: { outcome: 'resolve' },
      },
    });
    // another agent gets the real ticket, not the golden one
    const other = body(await next(sup2, 'support_ticket').expect(200));
    expect(other.lease.itemId).toBe(real.id);
    await api()
      .post(`/api/v1/admin/desk/lease/support_ticket/${real.id}/release`)
      .set(sup2.auth)
      .expect(200);
    // the same answer shape for the person it was issued to
    const g = body(await next(sup1, 'support_ticket').expect(200));
    expect(g.status).toBe('leased');
    expect(g.lease.itemId).toBe(decided.id);
    expect(Object.keys(g.lease).sort()).toEqual(
      ['attempt', 'itemId', 'kind', 'leasedUntil', 'takenAt'].sort(),
    );
    await api()
      .post(`/api/v1/admin/desk/lease/support_ticket/${decided.id}/done`)
      .set(sup1.auth)
      .send({ outcome: 'resolve' })
      .expect(200);
    const sample = await prisma.staffReviewSample.findFirst({
      where: { item_id: decided.id },
    });
    expect(sample?.status).toBe('done');
    expect(sample?.verdict).toBe('same');
    expect(
      await prisma.staffQualitySignal.count({
        where: {
          admin_id: sup1.userId,
          kind: 'golden_pass',
          item_id: decided.id,
        },
      }),
    ).toBe(1);
    // and then the real ticket
    expect(
      body(await next(sup1, 'support_ticket').expect(200)).lease.itemId,
    ).toBe(real.id);
  });

  it('golden with a wrong answer is a fail signal; with the switch off nothing is handed out', async () => {
    on(
      'staff.lease_support_enabled',
      'staff.rating_enabled',
      'staff.golden_enabled',
    );
    const decided = await ticket(2000, 'closed');
    await prisma.staffReviewSample.create({
      data: {
        decision_kind: 'golden_support_ticket',
        item_id: decided.id,
        decided_by: sup1.userId,
        is_golden: true,
        golden_answer: { outcome: 'resolve' },
      },
    });
    stored['staff.golden_enabled'] = false;
    expect(body(await next(sup1, 'support_ticket').expect(200)).status).toBe(
      'empty',
    );
    stored['staff.golden_enabled'] = true;
    expect(
      body(await next(sup1, 'support_ticket').expect(200)).lease.itemId,
    ).toBe(decided.id);
    await api()
      .post(`/api/v1/admin/desk/lease/support_ticket/${decided.id}/done`)
      .set(sup1.auth)
      .send({ outcome: 'close' })
      .expect(200);
    expect(
      await prisma.staffQualitySignal.count({
        where: {
          admin_id: sup1.userId,
          kind: 'golden_fail',
          item_id: decided.id,
        },
      }),
    ).toBe(1);
  });

  // --- the desk's presence signal --------------------------------------------------

  it('heartbeat: refused while presence is off; on, it sets «на связи» without touching the database', async () => {
    stored = {};
    await api()
      .post('/api/v1/admin/desk/heartbeat')
      .set(sup1.auth)
      .send({ active: true })
      .expect(403);
    on('staff.presence_enabled');
    const before = await prisma.workLeaseEvent.count();
    const r = await api()
      .post('/api/v1/admin/desk/heartbeat')
      .set(sup1.auth)
      .send({ active: true })
      .expect(200);
    expect(body(r).status).toBe('online');
    const me = await api()
      .get('/api/v1/admin/desk/lease/me')
      .set(sup1.auth)
      .expect(200);
    expect(body(me).status).toBe('online');
    expect(await prisma.workLeaseEvent.count()).toBe(before);
    await api()
      .post('/api/v1/admin/desk/heartbeat')
      .set(sup1.auth)
      .send({ active: 'yes' })
      .expect(400);
  });

  // --- everything off -------------------------------------------------------------

  it('OFF: resolving and a client reply behave as before; no lease row, no event, nothing recorded as a lease', async () => {
    stored = {};
    const t = await ticket(30);
    await api()
      .patch(`/api/v1/admin/support/tickets/${t.id}`)
      .set(sup1.auth)
      .send({ status: 'resolved' })
      .expect(200);
    await app.get(SupportService).reply(client, t.id, 'one more thing');
    const after = await prisma.supportTicket.findUnique({
      where: { id: t.id },
    });
    expect(after?.status).toBe('open');
    expect(await prisma.workLease.count()).toBe(0);
    expect(await prisma.workLeaseEvent.count()).toBe(0);
    // the decision itself is still reported to the rating recorder (it has its own switch)
    expect(recorded.map((e) => e.outcome)).toEqual(['resolve']);
    const a = await modAppeal(mod1.userId, 10);
    await api()
      .post(`/api/v1/admin/moderation/appeals/${a.id}/decision`)
      .set(mod2.auth)
      .send({ accept: false, note: 'stands' })
      .expect(201);
    expect(await prisma.workLease.count()).toBe(0);
  });
});
