import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { CaseDeadlineReminderJob } from '../src/jobs/handlers/case-deadline-reminder.job';
import { SubscriptionAlertsService } from '../src/modules/notifications/subscription-alerts.service';

/**
 * Owner 2026-10-05: case urgency as a level or a concrete date. Against
 * real PostgreSQL/Redis:
 *  - a date alone means `by_date`; the level follows from the days left;
 *    a level clears the date; bad dates are refused;
 *  - the attorney feed filters "at least urgent" and "with a date";
 *  - after hiring, the attorney moves the date and the client is told;
 *  - the daily reminder job tells both sides once; the day after a
 *    passed date a client without an attorney is asked to update it;
 *  - an urgent case alerts as `new_urgent_case`, and attorneys on
 *    "urgent only" get no alert for a calm one.
 */
jest.setTimeout(60_000);

describe('Case urgency: levels and dates (e2e, owner 2026-10-05)', () => {
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
    const leaf = 'e2e_urg_leaf';
    const area = await prisma.practiceArea.upsert({
      where: { code: leaf },
      create: {
        code: leaf,
        name_en: 'E2E urgency',
        i18n_key: `practice.${leaf}`,
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
      // docs/06 §1.2: bids require an active subscription (stage 6.7).
      await prisma.subscription.create({
        data: { user_id: u.id, status: 'active', price_cents: 39900 },
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
    opts: { areaId?: string; state?: string; deadline?: string } = {},
  ): Promise<string> {
    const state = opts.state ?? 'NJ';
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: 'Speeding ticket in Trenton',
        description: 'Got a ticket on the turnpike last week driving home.',
        practice_area_id: opts.areaId ?? practiceAreaId,
        primary_state_code: state,
        budget_mode: 'clarify_later',
        status: 'open',
        ...(opts.deadline
          ? {
              urgency: 'by_date',
              deadline_at: new Date(`${opts.deadline}T00:00:00Z`),
            }
          : {}),
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: state, is_primary: true },
    });
    return c.id;
  }

  const DAY = 24 * 3600 * 1000;
  const dayFromNow = (n: number) =>
    new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

  type Obj = Record<string, unknown>;

  it('a date alone means by_date, a level clears it, bad dates are refused', async () => {
    const client = await user('client');
    const caseId = await kase(client.id);

    const dated = await api()
      .patch(`/api/v1/cases/${caseId}`)
      .set(client.auth)
      .send({ deadlineAt: dayFromNow(2), deadlineKind: 'court_hearing' });
    expect(dated.status).toBe(200);
    expect(dated.body.data).toMatchObject({
      urgency: 'by_date',
      urgencyLevel: 'urgent',
      deadlineAt: dayFromNow(2),
      deadlineKind: 'court_hearing',
    });

    const level = await api()
      .patch(`/api/v1/cases/${caseId}/urgency`)
      .set(client.auth)
      .send({ urgency: 'very_urgent' });
    expect(level.status).toBe(200);
    expect(level.body.data).toMatchObject({
      urgency: 'very_urgent',
      urgencyLevel: 'very_urgent',
      deadlineAt: null,
      deadlineKind: null,
    });

    for (const body of [
      { deadlineAt: dayFromNow(-5) },
      { deadlineAt: dayFromNow(1000) },
      { urgency: 'by_date' },
    ]) {
      const bad = await api()
        .patch(`/api/v1/cases/${caseId}/urgency`)
        .set(client.auth)
        .send(body);
      expect(bad.status).toBe(400);
    }

    const journal = await prisma.caseJournal.findMany({
      where: { case_id: caseId, event_type: 'updated' },
    });
    expect(journal.length).toBeGreaterThanOrEqual(2);
  });

  it('the feed filters "at least urgent" and "with a date"', async () => {
    const client = await user('client');
    const attorney = await user('attorney');
    const soon = await kase(client.id, { deadline: dayFromNow(1) });
    const later = await kase(client.id, { deadline: dayFromNow(60) });
    const calm = await kase(client.id);
    await prisma.case.update({
      where: { id: calm },
      data: { urgency: 'flexible' },
    });

    const urgent = await api()
      .get('/api/v1/cases?minUrgency=urgent&limit=50')
      .set(attorney.auth);
    expect(urgent.status).toBe(200);
    const urgentIds = (urgent.body.data as Obj[]).map((c) => c.id);
    expect(urgentIds).toContain(soon);
    expect(urgentIds).not.toContain(later);
    expect(urgentIds).not.toContain(calm);
    const card = (urgent.body.data as Obj[]).find((c) => c.id === soon)!;
    expect(card).toMatchObject({
      urgency: 'by_date',
      urgencyLevel: 'very_urgent',
      deadlineAt: dayFromNow(1),
    });

    const dated = await api()
      .get('/api/v1/cases?hasDeadline=true&limit=50')
      .set(attorney.auth);
    const datedIds = (dated.body.data as Obj[]).map((c) => c.id);
    expect(datedIds).toEqual(expect.arrayContaining([soon, later]));
    expect(datedIds).not.toContain(calm);
  });

  async function hire(caseId: string, attorneyId: string): Promise<void> {
    const bid = await prisma.bid.create({
      data: {
        case_id: caseId,
        attorney_id: attorneyId,
        status: 'accepted',
        fee_type: 'fixed',
        amount_cents: 50_000,
        message: 'I can take this case.',
        start_availability: 'immediately',
        turn: 'client',
      },
    });
    await prisma.case.update({
      where: { id: caseId },
      data: { status: 'in_progress', accepted_bid_id: bid.id },
    });
  }

  it('after hiring the attorney moves the date; the client is told; others cannot', async () => {
    const client = await user('client');
    const attorney = await user('attorney');
    const stranger = await user('attorney');
    const caseId = await kase(client.id, { deadline: dayFromNow(20) });
    await hire(caseId, attorney.id);

    const moved = await api()
      .patch(`/api/v1/cases/${caseId}/urgency`)
      .set(attorney.auth)
      .send({ deadlineAt: dayFromNow(10), deadlineKind: 'filing_deadline' });
    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({
      deadlineAt: dayFromNow(10),
      deadlineKind: 'filing_deadline',
      status: 'in_progress',
    });
    const n = await prisma.notification.findFirstOrThrow({
      where: { user_id: client.id, type: 'case_deadline_changed' },
    });
    expect(n.payload).toMatchObject({ caseId, deadlineAt: dayFromNow(10) });

    // The full edit stays closed after hiring.
    const edit = await api()
      .patch(`/api/v1/cases/${caseId}`)
      .set(client.auth)
      .send({ urgency: 'urgent' });
    expect(edit.status).toBe(409);

    const nope = await api()
      .patch(`/api/v1/cases/${caseId}/urgency`)
      .set(stranger.auth)
      .send({ urgency: 'urgent' });
    expect(nope.status).toBe(404);
  });

  it('reminders go to both sides once; a passed date asks the client to update it', async () => {
    const client = await user('client');
    const attorney = await user('attorney');
    const inWork = await kase(client.id, { deadline: dayFromNow(3) });
    await hire(inWork, attorney.id);
    const lapsed = await kase(client.id);
    await prisma.case.update({
      where: { id: lapsed },
      data: {
        urgency: 'by_date',
        deadline_at: new Date(`${dayFromNow(-1)}T00:00:00Z`),
      },
    });

    const job = app.get(CaseDeadlineReminderJob);
    // Owner 2026-10-20: each person is reminded in their local morning
    // (09:00–21:00); users here have no zone, so noon UTC.
    const noon = new Date(`${dayFromNow(0)}T12:00:00Z`);
    const first = await job.run(noon);
    expect(first.ran).toBe(true);
    const soon = await prisma.notification.findMany({
      where: {
        type: 'case_deadline_soon',
        payload: { path: ['caseId'], equals: inWork },
      },
    });
    expect(soon.map((x) => x.user_id).sort()).toEqual(
      [client.id, attorney.id].sort(),
    );
    expect(soon[0].payload).toMatchObject({ days: 3 });
    const passed = await prisma.notification.findMany({
      where: {
        type: 'case_deadline_passed',
        payload: { path: ['caseId'], equals: lapsed },
      },
    });
    expect(passed.map((x) => x.user_id)).toEqual([client.id]);

    await job.run(noon);
    expect(
      await prisma.notification.count({
        where: {
          type: 'case_deadline_soon',
          payload: { path: ['caseId'], equals: inWork },
        },
      }),
    ).toBe(2);
  });

  it('an urgent case alerts as new_urgent_case; "urgent only" skips calm cases', async () => {
    const client = await user('client');
    const everyone = await user('attorney');
    const urgentOnly = await user('attorney');
    for (const a of [everyone, urgentOnly]) {
      await prisma.notificationSetting.create({
        data: { user_id: a.id, category: 'new_cases', push_enabled: true },
      });
    }
    const pref = await api()
      .put('/api/v1/notification-settings/new-cases')
      .set(urgentOnly.auth)
      .send({ useProfile: true, urgentOnly: true });
    expect(pref.status).toBe(200);
    expect(pref.body.data).toMatchObject({
      useProfile: true,
      urgentOnly: true,
    });

    const alerts = app.get(SubscriptionAlertsService);
    const calm = await kase(client.id);
    await alerts.attorneysForCase(calm);
    const urgent = await kase(client.id, { deadline: dayFromNow(1) });
    await alerts.attorneysForCase(urgent);

    const of = (userId: string) =>
      prisma.notification.findMany({
        where: {
          user_id: userId,
          type: { in: ['new_case', 'new_urgent_case'] },
        },
        select: { type: true, payload: true },
      });
    const all = await of(everyone.id);
    expect(all).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'new_case',
          payload: { caseId: calm },
        }),
        expect.objectContaining({
          type: 'new_urgent_case',
          payload: { caseId: urgent },
        }),
      ]),
    );
    const only = await of(urgentOnly.id);
    expect(only).toEqual([
      expect.objectContaining({
        type: 'new_urgent_case',
        payload: { caseId: urgent },
      }),
    ]);
  });
});
