/**
 * Проверка 17.11, пачка 9 (оплата, отзывы и доверие, фирмы).
 * Живые HTTP-запросы к API внутри набора, настоящие Postgres и Redis Мака;
 * у каждой проверки два (и больше) настоящих пользователя.
 * Запуск: docs/dev/verify/v9-run.sh v9-batch9-probe — строки "V9 <номер> {...}".
 */
import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { FeatureFlagsService } from '../src/modules/feature-flags/feature-flags.public';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

jest.setTimeout(300_000);
type Auth = Record<string, string>;
const log = (id: string, o: unknown) =>
  process.stdout.write(`V9 ${id} ${JSON.stringify(o)}\n`);

describe('verify batch 9 probe 17.11', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let redis: Redis;
  let base = '';
  let areaId = '';
  const api = () => request(base);
  const touched = new Set<string>();
  let firmsBefore: { enabled: boolean } | null = null;

  async function setSetting(key: string, value: unknown) {
    touched.add(key);
    if (value === null) {
      await prisma.appConfig.deleteMany({ where: { key } });
    } else {
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value: value as never },
        update: { value: value as never },
      });
    }
    await redis.del('config:app_config');
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    redis = app.get<Redis>(REDIS_CLIENT);
    await prisma.state.upsert({
      where: { code: 'IL' },
      create: { code: 'IL', name: 'IL', is_active: true },
      update: {},
    });
    const pa = await prisma.practiceArea.upsert({
      where: { code: 'v9_batch9_area' },
      create: {
        code: 'v9_batch9_area',
        name_en: 'V9 batch 9',
        i18n_key: 'practice.v9_batch9',
        sort: 1,
      },
      update: {},
    });
    areaId = pa.id;
    firmsBefore = await prisma.featureFlag.findUnique({
      where: { key: 'firm_profiles' },
      select: { enabled: true },
    });
    await prisma.featureFlag.upsert({
      where: { key: 'firm_profiles' },
      create: { key: 'firm_profiles', enabled: true, description: 'v9' },
      update: { enabled: true },
    });
    await app.get(FeatureFlagsService).invalidate();
  });

  afterAll(async () => {
    for (const key of touched) {
      await prisma.appConfig.deleteMany({ where: { key } });
    }
    await redis.del('config:app_config');
    await prisma.featureFlag.update({
      where: { key: 'firm_profiles' },
      data: { enabled: firmsBefore?.enabled ?? false },
    });
    await app.get(FeatureFlagsService).invalidate();
    await app.close();
  });

  const bearer = (id: string, role: string): Auth => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role: role as 'client',
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });

  async function lawyer(seats = 0) {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'V9', last_name: 'Lawyer' },
    });
    const username = `v9l${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: u.id,
        state_code: 'IL',
        bar_number: `V${randomUUID().slice(0, 8)}`,
        license_status: 'verified',
      },
    });
    await prisma.subscription.create({
      data: {
        user_id: u.id,
        status: 'active',
        price_cents: 39900,
        plan: 'monthly',
        assistant_seats: seats,
      },
    });
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: u.id, practice_area_id: areaId },
    });
    return { id: u.id, username, auth: bearer(u.id, 'attorney') };
  }

  async function client() {
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: 'Ann',
        last_name: 'Client',
        phone_e164: `+1312${2 + Math.floor(Math.random() * 8)}${String(
          Math.floor(Math.random() * 1e6),
        ).padStart(6, '0')}`,
        phone_verified_at: new Date(),
      },
    });
    const handle = `v9c${u.id.slice(0, 8)}`;
    await prisma.clientProfile.create({
      data: {
        user_id: u.id,
        state_code: 'IL',
        preferred_languages: ['en'],
        username: handle,
        username_lower: handle,
      },
    });
    return { id: u.id, auth: bearer(u.id, 'client') };
  }

  /** A closed case of [clientId] with [attorneyId]'s bid accepted. */
  async function closedCase(clientId: string, attorneyId: string) {
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: 'Deposit kept by the landlord',
        description: 'The landlord kept the whole deposit after move-out.',
        practice_area_id: areaId,
        primary_state_code: 'IL',
        budget_mode: 'clarify_later',
        status: 'closed',
        closed_at: new Date(),
      },
    });
    const bid = await prisma.bid.create({
      data: {
        case_id: c.id,
        attorney_id: attorneyId,
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
    return c.id;
  }

  async function admin() {
    return prisma.user.create({
      data: { role: 'admin', first_name: 'Mod', last_name: 'Erator' },
    });
  }

  /** What a moderator's action leaves: the status and its audit row. */
  async function moderate(
    type: 'review' | 'client_review',
    id: string,
    status: 'hidden' | 'removed',
  ) {
    const a = await admin();
    if (type === 'review') {
      await prisma.review.update({ where: { id }, data: { status } });
    } else {
      await prisma.clientReview.update({ where: { id }, data: { status } });
    }
    await prisma.auditLog.create({
      data: {
        admin_id: a.id,
        action: `${type}.${status === 'hidden' ? 'hide' : 'remove'}`,
        target_type: type,
        target_id: id,
        before: { status: 'published' },
        after: { status },
      },
    });
  }

  const postReview = (who: Auth, caseId: string, body: object) =>
    api()
      .post(`/api/v1/cases/${caseId}/review`)
      .set(who)
      .set('Idempotency-Key', randomUUID())
      .send(body);

  // ---------------------------------------------------------------- reviews

  it('R1 PATCH /reviews/:id runs the admin moderation rules (blocked text refused)', async () => {
    const att = await lawyer();
    const cl = await client();
    const caseId = await closedCase(cl.id, att.id);
    const term = `zqblk${randomUUID().slice(0, 6)}`;
    await setSetting('moderation.blocked_terms', [term]);
    const r = await postReview(cl.auth, caseId, { rating: 5, body: 'Great help.' });
    const patched = await api()
      .patch(`/api/v1/reviews/${r.body.data.id}`)
      .set(cl.auth)
      .send({ body: `Edited into ${term} text.` });
    const stored = await prisma.review.findUniqueOrThrow({
      where: { id: r.body.data.id as string },
      select: { body: true },
    });
    log('R1', { create: r.status, patch: patched.status, code: patched.body.error?.code, body: stored.body });
    expect(r.status).toBe(201);
    expect(patched.status).toBe(422);
    expect(stored.body).toBe('Great help.');
  });

  it('R2 a review a moderator hid, deleted and written again, goes back hidden', async () => {
    const att = await lawyer();
    const cl = await client();
    const caseId = await closedCase(cl.id, att.id);
    const r = await postReview(cl.auth, caseId, { rating: 1, body: 'Bad.' });
    const id = r.body.data.id as string;
    await moderate('review', id, 'hidden');
    await api().delete(`/api/v1/reviews/${id}`).set(cl.auth).expect(204);
    const again = await postReview(cl.auth, caseId, { rating: 1, body: 'Bad again.' });
    const row = await prisma.review.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    log('R2', { again: again.status, status: row.status });
    expect(row.status).toBe('hidden');
  });

  it('R4 an edit (PUT …/reviews/mine) into held text is hidden; an unchanged text is not', async () => {
    const att = await lawyer();
    const cl = await client();
    await closedCase(cl.id, att.id);
    const term = `zqhld${randomUUID().slice(0, 6)}`;
    await setSetting('moderation.hold_terms', [term]);
    const put = (body: string, rating = 5) =>
      api()
        .put(`/api/v1/attorneys/${att.id}/reviews/mine`)
        .set(cl.auth)
        .send({ rating, body });
    const first = await put('Clean and kind words here.');
    const same = await put('Clean and kind words here.', 4);
    const afterSame = await prisma.review.findUniqueOrThrow({
      where: { id: first.body.data.id as string },
      select: { status: true },
    });
    const held = await put(`Now with ${term} inside.`);
    const row = await prisma.review.findUniqueOrThrow({
      where: { id: first.body.data.id as string },
      select: { status: true },
    });
    log('R4', { first: first.status, same: same.status, afterSame: afterSame.status, held: held.status, status: row.status });
    expect(afterSame.status).toBe('published');
    expect(row.status).toBe('hidden');
  });

  it('R5 a client the attorney blocked cannot post the case review', async () => {
    const att = await lawyer();
    const cl = await client();
    const caseId = await closedCase(cl.id, att.id);
    await prisma.userBlock.create({
      data: { blocker_id: att.id, blocked_id: cl.id },
    });
    const r = await postReview(cl.auth, caseId, { rating: 1, body: 'x' });
    log('R5', { status: r.status, code: r.body.error?.code });
    expect(r.status).toBe(403);
  });

  it('R6 one counted review per client and attorney: a second closed case does not add another', async () => {
    const att = await lawyer();
    const cl = await client();
    const a = await closedCase(cl.id, att.id);
    const b = await closedCase(cl.id, att.id);
    const first = await postReview(cl.auth, a, { rating: 5, body: 'One.' });
    const second = await postReview(cl.auth, b, { rating: 5, body: 'Two.' });
    const p = await prisma.attorneyProfile.findUniqueOrThrow({
      where: { user_id: att.id },
      select: { rating_count: true },
    });
    log('R6', { first: first.status, second: second.status, count: p.rating_count });
    expect(second.status).toBe(409);
    expect(p.rating_count).toBe(1);
  });

  it('R3 PUT /clients/:id/reviews/mine does not bring back a review moderation removed', async () => {
    const att = await lawyer();
    const cl = await client();
    const first = await api()
      .put(`/api/v1/clients/${cl.id}/reviews/mine`)
      .set(att.auth)
      .send({ rating: 1, body: 'Rude client.' });
    await moderate('client_review', first.body.data.id as string, 'removed');
    const again = await api()
      .put(`/api/v1/clients/${cl.id}/reviews/mine`)
      .set(att.auth)
      .send({ rating: 1, body: 'Rude client again.' });
    const live = await prisma.clientReview.count({
      where: { client_id: cl.id, status: 'published' },
    });
    log('R3', { first: first.status, again: again.status, live });
    expect(again.status).toBe(409);
    expect(live).toBe(0);
  });

  it('R14 two parallel «helpful» taps on a client review: no 500, one vote', async () => {
    const att = await lawyer();
    const cl = await client();
    const viewer = await client();
    const rv = await api()
      .put(`/api/v1/clients/${cl.id}/reviews/mine`)
      .set(att.auth)
      .send({ rating: 5, body: 'Great client.' });
    const id = rv.body.data.id as string;
    const tap = () =>
      api()
        .post(`/api/v1/client-reviews/${id}/helpful`)
        .set(viewer.auth)
        .send({ helpful: true });
    const codes = (await Promise.all([tap(), tap(), tap(), tap()])).map((r) => r.status);
    const row = await prisma.clientReview.findUniqueOrThrow({
      where: { id },
      select: { helpful_count: true },
    });
    log('R14', { codes, helpful: row.helpful_count });
    expect(codes.every((c) => c === 200)).toBe(true);
    expect(row.helpful_count).toBe(1);
  });

  // ------------------------------------------------------------------ firms

  async function firmOf(owner: { auth: Auth }, ...members: { username: string; auth: Auth }[]) {
    await api()
      .post('/api/v1/firms')
      .set(owner.auth)
      .send({ name: `V9 ${randomUUID().slice(0, 6)}` })
      .expect(201);
    for (const m of members) {
      await api()
        .post('/api/v1/firms/me/members')
        .set(owner.auth)
        .send({ username: m.username })
        .expect(200);
      await api().post('/api/v1/firms/me/accept').set(m.auth).expect(200);
    }
  }

  it('F1 a lawyer the client blocked cannot join a colleague’s bid on that client’s case', async () => {
    const lead = await lawyer();
    const mate = await lawyer();
    await firmOf(lead, mate);
    const cl = await client();
    const c = await prisma.case.create({
      data: {
        client_id: cl.id,
        title: 'Deposit kept by the landlord',
        description: 'The landlord kept the whole deposit after move-out.',
        practice_area_id: areaId,
        primary_state_code: 'IL',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'IL', is_primary: true },
    });
    const bid = await api()
      .post(`/api/v1/cases/${c.id}/bids`)
      .set(lead.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        feeType: 'fixed',
        amountCents: 45_000,
        message: 'We handle deposit disputes every week and can start today.',
        startAvailability: 'immediately',
      });
    await prisma.userBlock.create({
      data: { blocker_id: cl.id, blocked_id: mate.id },
    });
    const join = await api()
      .post(`/api/v1/bids/${bid.body.data.id}/join`)
      .set(mate.auth);
    const rows = await prisma.bidParticipant.count({
      where: { bid_id: bid.body.data.id as string, attorney_id: mate.id },
    });
    log('F1', { bid: bid.status, join: join.status, rows });
    expect(bid.status).toBe(201);
    expect(join.status).toBe(403);
    expect(rows).toBe(0);
  });

  it('F4 a lawyer who switched to a client account cannot accept a firm invitation', async () => {
    const owner = await lawyer();
    const x = await lawyer();
    await firmOf(owner);
    await api()
      .post('/api/v1/firms/me/members')
      .set(owner.auth)
      .send({ username: x.username })
      .expect(200);
    await prisma.user.update({ where: { id: x.id }, data: { role: 'client' } });
    const r = await api().post('/api/v1/firms/me/accept').set(x.auth);
    const member = await prisma.firmMember.count({ where: { attorney_id: x.id } });
    log('F4', { accept: r.status, member });
    expect(r.status).toBe(403);
    expect(member).toBe(0);
  });

  it('F5 parallel accepts never go past the firm size', async () => {
    const owner = await lawyer();
    const p = await lawyer();
    const q = await lawyer();
    await firmOf(owner);
    for (const m of [p, q]) {
      await api()
        .post('/api/v1/firms/me/members')
        .set(owner.auth)
        .send({ username: m.username })
        .expect(200);
    }
    // Lowered after the invitations: room for one more lawyer only.
    await setSetting('firms.max_members', 2);
    const codes = (
      await Promise.all(
        [p, q].map((m) => api().post('/api/v1/firms/me/accept').set(m.auth)),
      )
    ).map((r) => r.status);
    const firm = await prisma.firmMember.findFirstOrThrow({
      where: { attorney_id: owner.id },
      select: { firm_id: true },
    });
    const active = await prisma.firmMember.count({
      where: { firm_id: firm.firm_id, status: 'active' },
    });
    await setSetting('firms.max_members', null);
    log('F5', { codes: codes.sort(), active });
    expect(active).toBe(2);
    expect(codes.sort()).toEqual([200, 409]);
  });

  it('F2 parallel «Add assistant» on the last free seat: exactly one is added', async () => {
    const att = await lawyer(1);
    const codes = (
      await Promise.all(
        [1, 2, 3].map(() =>
          api().post('/api/v1/team').set(att.auth).send({ name: 'Sam' }),
        ),
      )
    ).map((r) => r.status);
    const seats = await prisma.assistantMembership.count({
      where: { attorney_id: att.id, status: { not: 'removed' } },
    });
    log('F2', { codes: codes.sort(), seats });
    expect(seats).toBe(1);
  });

  it('P5 a seat decrease waiting for the renewal already counts for «Add assistant»', async () => {
    const att = await lawyer(3);
    await api().post('/api/v1/team').set(att.auth).send({ name: 'One' }).expect(201);
    await prisma.assistantSeatChange.create({
      data: {
        user_id: att.id,
        from_seats: 3,
        to_seats: 1,
        status: 'scheduled',
        effective_at: new Date(Date.now() + 20 * 86_400_000),
      },
    });
    const second = await api().post('/api/v1/team').set(att.auth).send({ name: 'Two' });
    const seats = await prisma.assistantMembership.count({
      where: { attorney_id: att.id, status: { not: 'removed' } },
    });
    log('P5', { second: second.status, code: second.body.error?.code, seats });
    expect(second.status).toBe(409);
    expect(seats).toBe(1);
  });
});
