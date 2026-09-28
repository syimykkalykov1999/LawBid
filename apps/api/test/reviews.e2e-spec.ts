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
import { ReviewModerationService } from '../src/modules/reviews/review-moderation.service';
import { ReviewReminderJob } from '../src/jobs/handlers/review-reminder.job';
import { RatingReconcileJob } from '../src/jobs/handlers/rating-reconcile.job';

/**
 * docs/03_VERIFICATION_PROFILES.md stage 3.7 acceptance, against real
 * CockroachDB/Redis:
 *  - no review without an accepted bid and a closed case;
 *  - a second review for the same case is rejected;
 *  - the rating is recalculated on create, edit and hide;
 *  - repeating the create with the same Idempotency-Key makes no duplicate.
 * Plus the §7.4 list/summary shape, reports, and the §7.3/§7.5 jobs.
 * Cases and bids are file 04's write paths, so fixtures are inserted
 * directly.
 */
jest.setTimeout(60_000);

const DAY = 24 * 60 * 60 * 1000;

/** Review ids of a list response body, in order. */
function idsOf(body: { data: { id: string }[] }): string[] {
  return body.data.map((r) => r.id);
}

describe('Reviews (e2e, docs/03 §7)', () => {
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
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York', is_active: true },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'e2e_reviews_leaf' },
      create: {
        code: 'e2e_reviews_leaf',
        name_en: 'E2E reviews',
        i18n_key: 'practice.e2e_reviews_leaf',
        sort: 1,
      },
      update: {},
    });
    practiceAreaId = area.id;
    // §9 defaults, explicitly (another suite may have changed them).
    for (const [key, value] of [
      ['review.edit_window_days', 14],
      ['review.reminder_after_days', 7],
    ] as const) {
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }
    await app.get<Redis>(REDIS_CLIENT).del('config:app_config');
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  async function user(
    role: 'client' | 'attorney' | 'admin',
    first = 'Anna',
    last = 'Kowalski',
  ): Promise<{ id: string; auth: Record<string, string> }> {
    const u = await prisma.user.create({
      data: { role, first_name: first, last_name: last },
    });
    if (role === 'attorney') {
      const username = `att_${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username,
          username_lower: username,
          languages: ['en'],
          verification_status: 'verified',
        },
      });
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

  /** A case of [clientId]; with [attorneyId] an accepted bid is linked. */
  async function kase(
    clientId: string,
    opts: {
      status?: 'open' | 'in_progress' | 'closed';
      attorneyId?: string;
      closedDaysAgo?: number;
    } = {},
  ): Promise<string> {
    const status = opts.status ?? 'closed';
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: 'Tenant dispute',
        description: 'Landlord kept the deposit.',
        practice_area_id: practiceAreaId,
        primary_state_code: 'NY',
        budget_mode: 'clarify_later',
        status,
        closed_at:
          status === 'closed'
            ? new Date(Date.now() - (opts.closedDaysAgo ?? 0) * DAY)
            : null,
      },
    });
    if (opts.attorneyId) {
      const bid = await prisma.bid.create({
        data: {
          case_id: c.id,
          attorney_id: opts.attorneyId,
          status: 'accepted',
          fee_type: 'fixed',
          amount_cents: 50_000,
          message: 'I can help.',
          start_availability: 'immediately',
          turn: 'client',
          decided_at: new Date(),
        },
      });
      await prisma.case.update({
        where: { id: c.id },
        data: { accepted_bid_id: bid.id },
      });
    }
    return c.id;
  }

  function postReview(
    auth: Record<string, string>,
    caseId: string,
    body: Record<string, unknown>,
    key: string | null = randomUUID(),
  ) {
    const req = api().post(`/api/v1/cases/${caseId}/review`).set(auth);
    if (key !== null) req.set('Idempotency-Key', key);
    return req.send(body);
  }

  async function rating(attorneyId: string) {
    const p = await prisma.attorneyProfile.findUniqueOrThrow({
      where: { user_id: attorneyId },
      select: { rating_avg: true, rating_count: true },
    });
    return { avg: p.rating_avg.toFixed(2), count: p.rating_count };
  }

  it('refuses a review without a closed case and an accepted bid', async () => {
    const client = await user('client');
    const attorney = await user('attorney');
    const inProgress = await kase(client.id, {
      status: 'in_progress',
      attorneyId: attorney.id,
    });
    const closedNoBid = await kase(client.id);
    const foreign = await kase((await user('client')).id, {
      attorneyId: attorney.id,
    });

    const r1 = await postReview(client.auth, inProgress, { rating: 5 });
    expect(r1.status).toBe(409);
    expect(r1.body.error.code).toBe('REVIEW_CASE_NOT_CLOSED');

    const r2 = await postReview(client.auth, closedNoBid, { rating: 5 });
    expect(r2.status).toBe(409);
    expect(r2.body.error.code).toBe('REVIEW_NO_ACCEPTED_BID');

    const r3 = await postReview(client.auth, foreign, { rating: 5 });
    expect(r3.status).toBe(404);
    expect(r3.body.error.code).toBe('NOT_FOUND');

    const r4 = await postReview(attorney.auth, foreign, { rating: 5 });
    expect(r4.status).toBe(403);

    const r5 = await postReview(client.auth, closedNoBid, { rating: 5 }, null);
    expect(r5.status).toBe(400);
    expect(r5.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    const r6 = await postReview(client.auth, inProgress, { rating: 6 });
    expect(r6.status).toBe(400);
    expect(r6.body.error.code).toBe('VALIDATION_ERROR');

    expect(
      await prisma.review.count({
        where: { case_id: { in: [inProgress, closedNoBid, foreign] } },
      }),
    ).toBe(0);
    expect(await rating(attorney.id)).toEqual({ avg: '0.00', count: 0 });
  });

  it('creates once: same Idempotency-Key replays, a second review is rejected, rating + notification written', async () => {
    const client = await user('client', 'Anna', 'Kowalski');
    const attorney = await user('attorney');
    const caseId = await kase(client.id, { attorneyId: attorney.id });
    const key = randomUUID();

    const first = await postReview(
      client.auth,
      caseId,
      { rating: 4, body: '  Clear and fast.  ' },
      key,
    );
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({
      caseId,
      attorneyId: attorney.id,
      rating: 4,
      body: 'Clear and fast.',
      authorDisplayName: 'Anna K.',
      status: 'published',
      editedAt: null,
    });

    const replay = await postReview(
      client.auth,
      caseId,
      { rating: 4, body: '  Clear and fast.  ' },
      key,
    );
    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(first.body.data.id);

    const second = await postReview(client.auth, caseId, { rating: 1 });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('REVIEW_ALREADY_EXISTS');

    expect(await prisma.review.count({ where: { case_id: caseId } })).toBe(1);
    expect(await rating(attorney.id)).toEqual({ avg: '4.00', count: 1 });
    const notes = await prisma.notification.findMany({
      where: { user_id: attorney.id },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      type: 'review_received',
      category: 'cases',
      payload: expect.objectContaining({ reviewId: first.body.data.id }),
    });
  });

  it('recalculates the rating on create, edit and hide; edit only within the window', async () => {
    const attorney = await user('attorney');
    const clientA = await user('client', 'Bob', 'Lee');
    const clientB = await user('client', 'Cara', 'Diaz');
    const caseA = await kase(clientA.id, { attorneyId: attorney.id });
    const caseB = await kase(clientB.id, { attorneyId: attorney.id });

    const a = await postReview(clientA.auth, caseA, { rating: 5 });
    expect(a.status).toBe(201);
    expect(await rating(attorney.id)).toEqual({ avg: '5.00', count: 1 });
    const b = await postReview(clientB.auth, caseB, { rating: 2 });
    expect(b.status).toBe(201);
    expect(await rating(attorney.id)).toEqual({ avg: '3.50', count: 2 });

    // Edit: rating 5 -> 3, edited_at set.
    const edit = await api()
      .patch(`/api/v1/reviews/${a.body.data.id}`)
      .set(clientA.auth)
      .send({ rating: 3, body: 'Updated after the hearing.' });
    expect(edit.status).toBe(200);
    expect(edit.body.data.editedAt).toEqual(expect.any(String));
    expect(await rating(attorney.id)).toEqual({ avg: '2.50', count: 2 });

    // Only the author edits.
    const foreign = await api()
      .patch(`/api/v1/reviews/${a.body.data.id}`)
      .set(clientB.auth)
      .send({ rating: 1 });
    expect(foreign.status).toBe(404);

    // Past review.edit_window_days: immutable.
    await prisma.review.update({
      where: { id: b.body.data.id },
      data: { created_at: new Date(Date.now() - 15 * DAY) },
    });
    const late = await api()
      .patch(`/api/v1/reviews/${b.body.data.id}`)
      .set(clientB.auth)
      .send({ rating: 5 });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('REVIEW_EDIT_WINDOW_EXPIRED');
    expect(await rating(attorney.id)).toEqual({ avg: '2.50', count: 2 });

    // Hide (moderator, file 06 path): recalculated, audited, not listed.
    const admin = await user('admin', 'Mod', 'Erator');
    await app.get(ReviewModerationService).setStatus({
      adminId: admin.id,
      reviewId: b.body.data.id as string,
      status: 'hidden',
      reason: 'test',
    });
    expect(await rating(attorney.id)).toEqual({ avg: '3.00', count: 1 });
    expect(
      await prisma.auditLog.count({
        where: { target_id: b.body.data.id, action: 'review.hide' },
      }),
    ).toBe(1);
    const hiddenEdit = await api()
      .patch(`/api/v1/reviews/${b.body.data.id}`)
      .set(clientB.auth)
      .send({ rating: 5 });
    expect(hiddenEdit.status).toBe(409);

    const list = await api()
      .get(`/api/v1/attorneys/${attorney.id}/reviews`)
      .set(clientB.auth);
    expect(list.status).toBe(200);
    expect(idsOf(list.body)).toEqual([a.body.data.id]);

    // Restore brings it back into the average.
    await app.get(ReviewModerationService).setStatus({
      adminId: admin.id,
      reviewId: b.body.data.id as string,
      status: 'published',
    });
    expect(await rating(attorney.id)).toEqual({ avg: '2.50', count: 2 });
  });

  it("GET /cases/:caseId/review: the case's client reads own review with editable/deadline; others 404", async () => {
    const client = await user('client');
    const other = await user('client');
    const attorney = await user('attorney');
    const caseId = await kase(client.id, { attorneyId: attorney.id });

    const none = await api()
      .get(`/api/v1/cases/${caseId}/review`)
      .set(client.auth);
    expect(none.status).toBe(404);
    expect(none.body.error.code).toBe('NOT_FOUND');

    const created = await postReview(client.auth, caseId, {
      rating: 4,
      body: 'Solid work.',
    });
    expect(created.status).toBe(201);

    const own = await api()
      .get(`/api/v1/cases/${caseId}/review`)
      .set(client.auth);
    expect(own.status).toBe(200);
    expect(own.body.data).toMatchObject({
      id: created.body.data.id,
      caseId,
      attorneyId: attorney.id,
      rating: 4,
      body: 'Solid work.',
      status: 'published',
      editable: true,
      editableUntil: created.body.data.editableUntil,
    });

    for (const stranger of [other, attorney]) {
      const res = await api()
        .get(`/api/v1/cases/${caseId}/review`)
        .set(stranger.auth);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    const bad = await api()
      .get('/api/v1/cases/not-a-uuid/review')
      .set(client.auth);
    expect(bad.status).toBe(400);

    // Past the window: still readable, no longer editable.
    await prisma.review.update({
      where: { id: created.body.data.id },
      data: { created_at: new Date(Date.now() - 15 * DAY) },
    });
    const late = await api()
      .get(`/api/v1/cases/${caseId}/review`)
      .set(client.auth);
    expect(late.status).toBe(200);
    expect(late.body.data.editable).toBe(false);
  });

  it('lists published reviews newest first with cursor pagination, public shape only, and a summary', async () => {
    const attorney = await user('attorney');
    const viewer = await user('client');
    const ids: string[] = [];
    for (const [first, last, stars] of [
      ['Anna', 'Kowalski', 5],
      ['Ben', 'ng', 4],
      ['Chloé', null, 5],
    ] as const) {
      const c = await user('client', first, last ?? undefined);
      if (last === null) {
        await prisma.user.update({
          where: { id: c.id },
          data: { last_name: null },
        });
      }
      const caseId = await kase(c.id, { attorneyId: attorney.id });
      const res = await postReview(c.auth, caseId, { rating: stars });
      expect(res.status).toBe(201);
      ids.push(res.body.data.id as string);
    }

    const page1 = await api()
      .get(`/api/v1/attorneys/${attorney.id}/reviews?limit=2`)
      .set(viewer.auth);
    expect(page1.status).toBe(200);
    expect(idsOf(page1.body)).toEqual([ids[2], ids[1]]);
    expect(page1.body.data[0].authorDisplayName).toBe('Chloé');
    expect(page1.body.data[1].authorDisplayName).toBe('Ben N.');
    for (const r of page1.body.data as Record<string, unknown>[]) {
      expect(Object.keys(r).sort()).toEqual(
        [
          'authorDisplayName',
          'body',
          'createdAt',
          'editedAt',
          'id',
          'rating',
        ].sort(),
      );
    }
    const cursor = page1.body.meta.nextCursor as string;
    expect(cursor).toEqual(expect.any(String));

    const page2 = await api()
      .get(`/api/v1/attorneys/${attorney.id}/reviews`)
      .query({ limit: 2, cursor })
      .set(viewer.auth);
    expect(idsOf(page2.body)).toEqual([ids[0]]);
    expect(page2.body.data[0].authorDisplayName).toBe('Anna K.');
    expect(page2.body.meta.nextCursor).toBeNull();

    const bad = await api()
      .get(`/api/v1/attorneys/${attorney.id}/reviews?cursor=garbage`)
      .set(viewer.auth);
    expect(bad.status).toBe(400);

    const summary = await api()
      .get(`/api/v1/attorneys/${attorney.id}/reviews/summary`)
      .set(viewer.auth);
    expect(summary.status).toBe(200);
    expect(summary.body.data).toEqual({
      ratingAvg: 4.7,
      ratingCount: 3,
      distribution: [
        { stars: 5, count: 2 },
        { stars: 4, count: 1 },
        { stars: 3, count: 0 },
        { stars: 2, count: 0 },
        { stars: 1, count: 0 },
      ],
    });

    const missing = await api()
      .get(`/api/v1/attorneys/${randomUUID()}/reviews/summary`)
      .set(viewer.auth);
    expect(missing.status).toBe(404);
  });

  it('lets only the reviewed attorney report a review, once while open', async () => {
    const attorney = await user('attorney');
    const client = await user('client');
    const caseId = await kase(client.id, { attorneyId: attorney.id });
    const review = await postReview(client.auth, caseId, {
      rating: 1,
      body: 'Bad.',
    });

    const rep = await api()
      .post(`/api/v1/reviews/${review.body.data.id}/report`)
      .set(attorney.auth)
      .send({ reason: 'abuse', note: 'Never worked with this person.' });
    expect(rep.status).toBe(201);
    expect(rep.body.data).toMatchObject({
      reviewId: review.body.data.id,
      reason: 'abuse',
      status: 'open',
    });
    const again = await api()
      .post(`/api/v1/reviews/${review.body.data.id}/report`)
      .set(attorney.auth)
      .send({ reason: 'spam' });
    expect(again.body.data.id).toBe(rep.body.data.id);
    expect(
      await prisma.report.count({
        where: { target_type: 'review', target_id: review.body.data.id },
      }),
    ).toBe(1);

    const byClient = await api()
      .post(`/api/v1/reviews/${review.body.data.id}/report`)
      .set(client.auth)
      .send({ reason: 'spam' });
    expect(byClient.status).toBe(403);

    const badReason = await api()
      .post(`/api/v1/reviews/${review.body.data.id}/report`)
      .set(attorney.auth)
      .send({ reason: 'dislike' });
    expect(badReason.status).toBe(400);
  });

  it('review.reminder job: one review_requested reminder after review.reminder_after_days', async () => {
    const attorney = await user('attorney');
    const due = await user('client');
    const reviewed = await user('client');
    const fresh = await user('client');
    const dueCase = await kase(due.id, {
      attorneyId: attorney.id,
      closedDaysAgo: 8,
    });
    const reviewedCase = await kase(reviewed.id, {
      attorneyId: attorney.id,
      closedDaysAgo: 8,
    });
    await prisma.review.create({
      data: {
        case_id: reviewedCase,
        client_id: reviewed.id,
        attorney_id: attorney.id,
        rating: 5,
      },
    });
    await kase(fresh.id, { attorneyId: attorney.id, closedDaysAgo: 2 });

    const job = app.get(ReviewReminderJob);
    await job.run();
    await job.run();

    const reminders = await prisma.notification.findMany({
      where: {
        type: 'review_requested',
        user_id: { in: [due.id, reviewed.id, fresh.id] },
      },
    });
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      user_id: due.id,
      category: 'cases',
      payload: { caseId: dueCase, attorneyId: attorney.id, reminder: true },
    });
  });

  it('rating reconciliation job fixes drifted counters', async () => {
    const attorney = await user('attorney');
    const client = await user('client');
    const caseId = await kase(client.id, { attorneyId: attorney.id });
    expect((await postReview(client.auth, caseId, { rating: 3 })).status).toBe(
      201,
    );
    await prisma.attorneyProfile.update({
      where: { user_id: attorney.id },
      data: { rating_avg: 1, rating_count: 9 },
    });

    const result = await app.get(RatingReconcileJob).run();
    expect(result.fixed).toBeGreaterThanOrEqual(1);
    expect(await rating(attorney.id)).toEqual({ avg: '3.00', count: 1 });
    // Consistent now: a second pass changes nothing.
    expect((await app.get(RatingReconcileJob).run()).fixed).toBe(0);
  });
});
