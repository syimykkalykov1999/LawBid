import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { TokenService } from '../src/modules/auth/services/token.service';
import {
  CaseAutoArchiveJob,
  CaseAutoCloseJob,
  CaseCompletionReminderJob,
  CaseStalePromptJob,
} from '../src/jobs/handlers/case-lifecycle.jobs';

/**
 * docs/04_CASES_BIDS.md §16 stage 4.6 acceptance, with an injected clock
 * (each job takes `now`), against real CockroachDB/Redis:
 *  - 30 days without activity → one `case_stale_prompt`; 14 more days →
 *    `archived` (active bids rejected_auto, `case_archived`);
 *  - "Да, актуален" resets the timer (no archive after the next 14 days);
 *  - `pending_completion` is `closed` automatically after 7 days;
 *  - jobs never duplicate notifications (runs repeated), and a held Redis
 *    lock skips a run;
 *  - complete / confirm / dispute / admin decision (§10.1).
 */
jest.setTimeout(90_000);

const DAY = 24 * 60 * 60 * 1000;

describe('Case lifecycle and jobs (e2e, docs/04 §10, stage 4.6)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  let practiceAreaId = '';

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
    app.setGlobalPrefix('api/v1', {
      exclude: ['/health/live', '/health/ready', '/docs', '/docs-json'],
    });
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);

    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'e2e_lifecycle_leaf' },
      create: {
        code: 'e2e_lifecycle_leaf',
        name_en: 'E2E lifecycle',
        i18n_key: 'practice.e2e_lifecycle_leaf',
        sort: 1,
      },
      update: {},
    });
    practiceAreaId = area.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  async function user(
    role: 'client' | 'attorney',
    opts: { verified?: boolean; practiceAreaIds?: string[] } = {},
  ): Promise<{ id: string; auth: Record<string, string> }> {
    const u = await prisma.user.create({ data: { role } });
    if (role === 'attorney') {
      const username = `att_${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username,
          username_lower: username,
          languages: ['en'],
          verification_status:
            opts.verified === false ? 'unverified' : 'verified',
        },
      });
      await prisma.attorneyLicense.create({
        data: {
          attorney_id: u.id,
          state_code: 'NJ',
          bar_number: `NJ-${randomUUID()}`,
          license_status: 'verified',
        },
      });
      for (const id of opts.practiceAreaIds ?? [practiceAreaId]) {
        await prisma.attorneyPracticeArea.create({
          data: { attorney_id: u.id, practice_area_id: id },
        });
      }
    }
    const token = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  async function kase(
    clientId: string,
    opts: { areaId?: string } = {},
  ): Promise<string> {
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: 'Speeding ticket in Trenton',
        description: 'Got a ticket on the turnpike last week driving home.',
        practice_area_id: opts.areaId ?? practiceAreaId,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });
    return c.id;
  }

  function bidBody(overrides: Record<string, unknown> = {}) {
    return {
      feeType: 'fixed',
      amountCents: 60_000,
      message: 'I handle NJ speeding tickets every week, happy to help.',
      startAvailability: 'immediately',
      ...overrides,
    };
  }

  function postBid(
    auth: Record<string, string>,
    caseId: string,
    body: Record<string, unknown>,
    key: string | null = randomUUID(),
  ) {
    const req = api().post(`/api/v1/cases/${caseId}/bids`).set(auth);
    if (key !== null) req.set('Idempotency-Key', key);
    return req.send(body);
  }

  const days = (n: number, from = new Date()) =>
    new Date(from.getTime() + n * DAY);

  async function notifCount(userId: string, type: string, caseId: string) {
    return prisma.notification.count({
      where: {
        user_id: userId,
        type: type as never,
        payload: { path: ['caseId'], equals: caseId },
      },
    });
  }

  async function staleCase(ageDays: number) {
    const client = await user('client');
    const attorney = await user('attorney');
    const caseId = await kase(client.id);
    const res = await postBid(attorney.auth, caseId, bidBody());
    expect(res.status).toBe(201);
    await prisma.case.update({
      where: { id: caseId },
      data: { last_activity_at: days(-ageDays) },
    });
    return { client, attorney, caseId, bidId: res.body.data.id as string };
  }

  async function inProgressCase() {
    const client = await user('client');
    const attorney = await user('attorney');
    const caseId = await kase(client.id);
    const bid = await postBid(attorney.auth, caseId, bidBody());
    const acc = await api()
      .post(`/api/v1/bids/${bid.body.data.id}/accept`)
      .set(client.auth)
      .send({});
    expect(acc.status).toBe(200);
    return { client, attorney, caseId };
  }

  const post = (auth: Record<string, string>, path: string, body = {}) =>
    api().post(`/api/v1${path}`).set(auth).send(body);

  it('30 days idle → one stale prompt; +14 days → archived with bids rejected', async () => {
    const { client, attorney, caseId, bidId } = await staleCase(31);
    const stale = app.get(CaseStalePromptJob);
    const archive = app.get(CaseAutoArchiveJob);
    const now = new Date();

    expect((await stale.run(now)).ran).toBe(true);
    await stale.run(now);
    expect(await notifCount(client.id, 'case_stale_prompt', caseId)).toBe(1);

    // Not yet 14 days after the prompt: stays open.
    await archive.run(days(13, now));
    expect(
      (await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).status,
    ).toBe('open');

    await archive.run(days(15, now));
    await archive.run(days(15, now));
    const after = await prisma.case.findUniqueOrThrow({
      where: { id: caseId },
    });
    expect(after.status).toBe('archived');
    expect(after.archived_at).not.toBeNull();
    expect(
      (await prisma.bid.findUniqueOrThrow({ where: { id: bidId } })).status,
    ).toBe('rejected_auto');
    expect(await notifCount(client.id, 'case_archived', caseId)).toBe(1);
    expect(await notifCount(attorney.id, 'bid_rejected', caseId)).toBe(1);
  });

  it('"Да, актуален" resets the timer: no archive 14 days after the prompt', async () => {
    const { client, caseId } = await staleCase(31);
    const now = new Date();
    await app.get(CaseStalePromptJob).run(now);
    expect(await notifCount(client.id, 'case_stale_prompt', caseId)).toBe(1);

    const keep = await post(client.auth, `/cases/${caseId}/keep-alive`);
    expect(keep.status).toBe(200);
    const kept = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kept.stale_prompt_sent_at).toBeNull();

    await app.get(CaseAutoArchiveJob).run(days(15, now));
    expect(
      (await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).status,
    ).toBe('open');
  });

  it('"Выполнено" → reminder at ≤24 h once → auto-closed after 7 days', async () => {
    const { client, attorney, caseId } = await inProgressCase();
    const done = await post(client.auth, `/cases/${caseId}/complete`);
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('pending_completion');
    expect(await notifCount(attorney.id, 'completion_requested', caseId)).toBe(
      1,
    );
    const now = new Date();

    const reminder = app.get(CaseCompletionReminderJob);
    await reminder.run(days(5, now)); // 2 days left: too early
    expect(await notifCount(attorney.id, 'completion_reminder', caseId)).toBe(
      0,
    );
    await reminder.run(days(6.5, now));
    await reminder.run(days(6.6, now));
    expect(await notifCount(attorney.id, 'completion_reminder', caseId)).toBe(
      1,
    );

    const close = app.get(CaseAutoCloseJob);
    await close.run(days(6.9, now));
    expect(
      (await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).status,
    ).toBe('pending_completion');
    await close.run(days(7.1, now));
    await close.run(days(7.2, now));
    const closed = await prisma.case.findUniqueOrThrow({
      where: { id: caseId },
    });
    expect(closed.status).toBe('closed');
    expect(closed.closed_at).not.toBeNull();
    expect(await notifCount(client.id, 'case_closed', caseId)).toBe(1);
    expect(await notifCount(attorney.id, 'case_closed', caseId)).toBe(1);
    expect(await notifCount(client.id, 'review_requested', caseId)).toBe(1);
    const events = await prisma.caseJournal.findMany({
      where: { case_id: caseId, event_type: 'auto_closed' },
    });
    expect(events).toHaveLength(1);
  });

  it('attorney confirms; only the accepted attorney may; wrong state is 409', async () => {
    const { client, attorney, caseId } = await inProgressCase();
    expect(
      (await post(attorney.auth, `/cases/${caseId}/confirm-completion`)).body
        .error.code,
    ).toBe('CASE_INVALID_STATE');
    await post(client.auth, `/cases/${caseId}/complete`);
    const stranger = await user('attorney');
    expect(
      (await post(stranger.auth, `/cases/${caseId}/confirm-completion`)).status,
    ).toBe(404);
    const ok = await post(attorney.auth, `/cases/${caseId}/confirm-completion`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('closed');
  });

  it('dispute needs a reason; admin sends the case back to work', async () => {
    const { client, attorney, caseId } = await inProgressCase();
    await post(client.auth, `/cases/${caseId}/complete`);
    expect(
      (await post(attorney.auth, `/cases/${caseId}/dispute`, { reason: ' ' }))
        .status,
    ).toBe(400);
    const d = await post(attorney.auth, `/cases/${caseId}/dispute`, {
      reason: 'Work is not finished: hearing is next week.',
    });
    expect(d.status).toBe(200);
    expect(d.body.data.status).toBe('disputed');
    const dispute = await prisma.caseDispute.findFirstOrThrow({
      where: { case_id: caseId },
    });

    const admin = await prisma.user.create({ data: { role: 'admin' } });
    await prisma.adminProfile.create({
      data: { user_id: admin.id, admin_role: 'support' },
    });
    const adminAuth = {
      Authorization: `Bearer ${tokens.signAccessToken({
        sub: admin.id,
        role: 'admin',
        sid: randomUUID(),
        verified: false,
        subscriptionStatus: 'none',
      })}`,
    };
    // A client can't use the admin route.
    expect(
      (
        await post(client.auth, `/admin/case-disputes/${dispute.id}/resolve`, {
          decision: 'closed',
          note: 'x',
        })
      ).status,
    ).toBe(403);
    const r = await post(
      adminAuth,
      `/admin/case-disputes/${dispute.id}/resolve`,
      {
        decision: 'in_progress',
        note: 'Hearing pending; back to work.',
      },
    );
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('in_progress');
    const again = await post(
      adminAuth,
      `/admin/case-disputes/${dispute.id}/resolve`,
      { decision: 'closed', note: 'again' },
    );
    expect(again.status).toBe(409);
    expect(
      await prisma.auditLog.count({
        where: { target_type: 'case_dispute', target_id: dispute.id },
      }),
    ).toBe(1);
  });

  it('a held Redis lock skips the run', async () => {
    const redis = app.get<Redis>(REDIS_CLIENT);
    await redis.set('lock:job:cases.auto-close', 'someone', 'PX', 5_000);
    const res = await app.get(CaseAutoCloseJob).run(new Date());
    expect(res).toEqual({ processed: 0, ran: false });
    await redis.del('lock:job:cases.auto-close');
  });
});
