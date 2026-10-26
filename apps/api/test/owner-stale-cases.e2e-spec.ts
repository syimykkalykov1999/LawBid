import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { TokenService } from '../src/modules/auth/services/token.service';
import {
  CaseStaleAskJob,
  CaseStalePauseJob,
} from '../src/jobs/handlers/case-lifecycle.jobs';

/**
 * Owner 2026-10-17/18 (OQ-054): stale cases in the attorney feed. The
 * client's own actions keep a case alive (attorney bids never do); silent
 * past the urgency's timer → one «Вам ещё нужен адвокат?» (grouped per
 * client, never when bids came, only in the client's daytime); unanswered →
 * paused (hidden from the feed, silently); resume; «по дате»; answers; the
 * archive after 30 paused days. Every job takes `now` (injected clock).
 */
jest.setTimeout(180_000);

const DAY = 24 * 60 * 60 * 1000;

describe('Stale cases (e2e, OQ-054)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  let leafId = '';

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
    baseUrl = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
    const cat = await prisma.practiceArea.upsert({
      where: { code: 'e2e_stale_cat' },
      create: {
        code: 'e2e_stale_cat',
        name_en: 'Stale cat',
        i18n_key: 'practice.e2e_stale_cat',
        sort: 1,
      },
      update: {},
    });
    const leaf = await prisma.practiceArea.upsert({
      where: { code: 'e2e_stale_cat.leaf' },
      create: {
        code: 'e2e_stale_cat.leaf',
        parent_id: cat.id,
        name_en: 'Stale leaf',
        i18n_key: 'practice.e2e_stale_cat.leaf',
        sort: 1,
      },
      update: {},
    });
    leafId = leaf.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);
  const days = (n: number, from: Date = new Date()) =>
    new Date(from.getTime() + n * DAY);
  /** Today 16:00 UTC = noon US Eastern: inside every client's default
   * daytime. */
  const noon = () => {
    const d = new Date();
    d.setUTCHours(16, 0, 0, 0);
    return d;
  };

  function auth(id: string, role: 'client' | 'attorney') {
    const t = tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: role === 'attorney' ? 'active' : 'none',
    });
    return { Authorization: `Bearer ${t}` };
  }

  async function client() {
    const now = new Date();
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: 'Anna',
        last_name: 'Kowalski',
        phone_verified_at: now,
        email_verified_at: now,
      },
    });
    await prisma.onboardingState.create({
      data: { user_id: u.id, completed_at: now },
    });
    return { id: u.id, auth: auth(u.id, 'client') };
  }

  async function attorney() {
    const u = await prisma.user.create({ data: { role: 'attorney' } });
    const handle = `att${randomUUID().slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: handle,
        username_lower: handle,
        verification_status: 'verified',
      },
    });
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: u.id,
        state_code: 'NY',
        bar_number: `NY-${randomUUID()}`,
        license_status: 'verified',
      },
    });
    await prisma.attorneyPracticeArea.create({
      data: { attorney_id: u.id, practice_area_id: leafId },
    });
    await prisma.subscription.create({
      data: { user_id: u.id, status: 'active', price_cents: 39900 },
    });
    return { id: u.id, auth: auth(u.id, 'attorney') };
  }

  /** An open case of [clientId]; [silentDays] since the client's last
   * action, [ageDays] since it was created. */
  async function kase(
    clientId: string,
    opts: {
      urgency?: string | null;
      deadlineAt?: Date;
      silentDays?: number;
      ageDays?: number;
    } = {},
  ): Promise<string> {
    const silent = opts.silentDays ?? 0;
    const created = days(-(opts.ageDays ?? Math.max(silent, 0)));
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: 'Truck crash on the highway, need help',
        description: 'A truck hit my car on the highway last month, no payout.',
        practice_area_id: leafId,
        primary_state_code: 'NY',
        budget_mode: 'clarify_later',
        status: 'open',
        urgency: opts.urgency ?? null,
        deadline_at: opts.deadlineAt ?? null,
        deadline_kind: opts.deadlineAt ? 'court_hearing' : null,
        created_at: created,
        client_active_at: days(-silent),
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NY', is_primary: true },
    });
    return c.id;
  }

  const row = (id: string) => prisma.case.findUniqueOrThrow({ where: { id } });

  const bid = (att: { auth: Record<string, string> }, caseId: string) =>
    api()
      .post(`/api/v1/cases/${caseId}/bids`)
      .set(att.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        feeType: 'fixed',
        amountCents: 60_000,
        message: 'I handle these crash cases every week, happy to help you.',
        startAvailability: 'immediately',
      });

  const asks = (userId: string) =>
    prisma.notification.findMany({
      where: { user_id: userId, type: 'case_still_needed' },
    });

  const feedIds = async (att: { auth: Record<string, string> }) => {
    const res = await api().get('/api/v1/cases?limit=50').set(att.auth);
    expect(res.status).toBe(200);
    return (res.body.data as { id: string }[]).map((c) => c.id);
  };

  it('an attorney bid never keeps a case alive; the client opening it does', async () => {
    const cli = await client();
    const att = await attorney();
    const caseId = await kase(cli.id, { silentDays: 40 });
    const before = (await row(caseId)).client_active_at;

    const placed = await bid(att, caseId);
    expect(placed.status).toBe(201);
    // The bid bumps last_activity_at, never the client's activity.
    const after = await row(caseId);
    expect(after.client_active_at.getTime()).toBe(before.getTime());
    expect(after.last_activity_at.getTime()).toBeGreaterThan(before.getTime());
    // Attorney reads (detail, view) don't count either.
    await api().get(`/api/v1/cases/${caseId}`).set(att.auth).expect(200);
    await api().post(`/api/v1/cases/${caseId}/view`).set(att.auth).expect(204);
    expect((await row(caseId)).client_active_at.getTime()).toBe(
      before.getTime(),
    );

    // The client's own actions do: viewing the bids, then opening the case.
    await api().get(`/api/v1/cases/${caseId}/bids`).set(cli.auth).expect(200);
    const viewed = (await row(caseId)).client_active_at;
    expect(viewed.getTime()).toBeGreaterThan(before.getTime());
    await prisma.case.update({
      where: { id: caseId },
      data: { client_active_at: days(-40) },
    });
    await api()
      .get(`/api/v1/users/me/cases/${caseId}`)
      .set(cli.auth)
      .expect(200);
    expect((await row(caseId)).client_active_at.getTime()).toBeGreaterThan(
      days(-1).getTime(),
    );
    // Editing the case counts too.
    await prisma.case.update({
      where: { id: caseId },
      data: { client_active_at: days(-40) },
    });
    await api()
      .patch(`/api/v1/cases/${caseId}`)
      .set(cli.auth)
      .send({ city: 'Albany' })
      .expect(200);
    expect((await row(caseId)).client_active_at.getTime()).toBeGreaterThan(
      days(-1).getTime(),
    );
  });

  it('asks once, grouped per client, never when bids came, only in daytime', async () => {
    const cli = await client();
    const att = await attorney();
    const quiet = await kase(cli.id, { silentDays: 40 }); // flexible: due
    const urgent = await kase(cli.id, { urgency: 'urgent', silentDays: 5 });
    // < 4 d even on the "next day" run below at any time of the real day
    // (noon() can be up to ~40 h after the case was created).
    const young = await kase(cli.id, { urgency: 'urgent', silentDays: 2 });
    const withBid = await kase(cli.id, { silentDays: 40 });
    expect((await bid(att, withBid)).status).toBe(201); // a fresh bid

    const job = app.get(CaseStaleAskJob);
    const now = noon();

    // Night in New York: nothing goes out yet.
    const night = new Date(now);
    night.setUTCHours(3, 0, 0, 0);
    await job.run(night);
    expect(await asks(cli.id)).toHaveLength(0);

    await job.run(now);
    const sent = await asks(cli.id);
    expect(sent).toHaveLength(1); // ONE notification for the client
    const payload = sent[0].payload as { caseIds: string[]; count: number };
    expect(payload.count).toBe(2);
    expect([...payload.caseIds].sort()).toEqual([quiet, urgent].sort());
    expect((await row(quiet)).stale_prompt_sent_at).not.toBeNull();
    expect((await row(urgent)).stale_prompt_sent_at).not.toBeNull();
    // Not yet silent long enough / got a new bid: not asked.
    expect((await row(young)).stale_prompt_sent_at).toBeNull();
    expect((await row(withBid)).stale_prompt_sent_at).toBeNull();

    // Never repeated for the same silent period.
    await job.run(now);
    await job.run(days(1, now));
    expect(await asks(cli.id)).toHaveLength(1);
    // It never goes out as SMS: no SMS rows were queued for the client.
    const sms = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM information_schema.tables
      WHERE table_name = 'sms_messages'`;
    if (Number(sms[0].n) > 0) {
      const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM sms_messages WHERE user_id = '${cli.id}'`,
      );
      expect(Number(rows[0].n)).toBe(0);
    }
  });

  it("respects the client's own time zone", async () => {
    const tokyo = await client();
    await prisma.notificationQuietHours.create({
      data: {
        user_id: tokyo.id,
        start_time: new Date('1970-01-01T22:00:00Z'),
        end_time: new Date('1970-01-01T07:00:00Z'),
        timezone: 'Asia/Tokyo',
      },
    });
    const caseId = await kase(tokyo.id, { silentDays: 40 });
    const job = app.get(CaseStaleAskJob);
    // 16:00 UTC = 01:00 in Tokyo: not asked; 03:00 UTC = 12:00: asked.
    await job.run(noon());
    expect(await asks(tokyo.id)).toHaveLength(0);
    const tokyoNoon = new Date(noon());
    tokyoNoon.setUTCHours(3, 0, 0, 0);
    await job.run(tokyoNoon);
    expect(await asks(tokyo.id)).toHaveLength(1);
    expect((await row(caseId)).stale_prompt_sent_at).not.toBeNull();
  });

  it('pauses after the grace, silently; a paused case leaves the feed; resume brings it back', async () => {
    const cli = await client();
    const att = await attorney();
    const bidder = await attorney();
    const caseId = await kase(cli.id, { silentDays: 40, ageDays: 2 });
    expect(await feedIds(att)).toContain(caseId);

    const ask = app.get(CaseStaleAskJob);
    const pause = app.get(CaseStalePauseJob);
    const now = noon();
    await ask.run(now);
    expect(await asks(cli.id)).toHaveLength(1);
    const notifBefore = await prisma.notification.count({
      where: { user_id: cli.id },
    });

    // Flexible: 14 days to answer.
    await pause.run(days(13, now));
    expect((await row(caseId)).paused_at).toBeNull();
    await pause.run(days(14.1, now));
    const paused = await row(caseId);
    expect(paused.paused_at).not.toBeNull();
    expect(paused.status).toBe('open');
    // Silent: no new notification of any kind for the client.
    expect(
      await prisma.notification.count({ where: { user_id: cli.id } }),
    ).toBe(notifBefore);

    // Hidden from the feed and from the Search tab.
    expect(await feedIds(att)).not.toContain(caseId);
    const searchIds = async (who = att) => {
      const found = await api()
        .get('/api/v1/search/cases')
        .query({ q: 'truck' })
        .set(who.auth);
      expect(found.status).toBe(200);
      return (found.body.data as { id: string }[]).map((c) => c.id);
    };
    expect(await searchIds()).not.toContain(caseId);
    // A paused case is neither asked nor paused again.
    await ask.run(days(15, now));
    expect(await asks(cli.id)).toHaveLength(1);

    const resumed = await api()
      .post(`/api/v1/cases/${caseId}/resume`)
      .set(cli.auth);
    expect(resumed.status).toBe(200);
    expect(resumed.body.data.pausedAt).toBeNull();
    const back = await row(caseId);
    expect(back.paused_at).toBeNull();
    expect(back.stale_prompt_sent_at).toBeNull();
    expect(back.client_active_at.getTime()).toBeGreaterThan(days(-1).getTime());
    expect(await feedIds(att)).toContain(caseId);
    // (A second attorney: one attorney's ranked search ids are kept a few minutes.)
    expect(await searchIds(bidder)).toContain(caseId);
    // Only the owner may resume.
    await api()
      .post(`/api/v1/cases/${caseId}/resume`)
      .set(att.auth)
      .expect(403);
  });

  it('attorneys who already bid still see the case and their bid while it is paused', async () => {
    const cli = await client();
    const att = await attorney();
    const caseId = await kase(cli.id, { silentDays: 1 });
    const placed = await bid(att, caseId);
    expect(placed.status).toBe(201);
    await prisma.case.update({
      where: { id: caseId },
      data: { paused_at: new Date() },
    });
    expect(await feedIds(att)).not.toContain(caseId);
    const mine = await api().get('/api/v1/users/me/bids').set(att.auth);
    expect(mine.status).toBe(200);
    expect(JSON.stringify(mine.body)).toContain(placed.body.data.id);
    await api().get(`/api/v1/cases/${caseId}`).set(att.auth).expect(200);
  });

  it('«по дате»: asked once the date has passed, paused 3 days after it', async () => {
    const cli = await client();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const deadline = days(-2, today);
    const caseId = await kase(cli.id, {
      urgency: 'by_date',
      deadlineAt: deadline,
      silentDays: 10,
    });
    // A date in the future is never asked.
    const future = await kase(cli.id, {
      urgency: 'by_date',
      deadlineAt: days(5, today),
      silentDays: 60,
    });

    const ask = app.get(CaseStaleAskJob);
    const pause = app.get(CaseStalePauseJob);
    const now = noon();
    await ask.run(now);
    const sent = await asks(cli.id);
    expect(sent).toHaveLength(1);
    expect((sent[0].payload as { caseIds: string[] }).caseIds).toEqual([
      caseId,
    ]);
    expect((await row(future)).stale_prompt_sent_at).toBeNull();

    // Paused 3 days after the date (and a day after the question).
    await pause.run(days(0.5, now));
    expect((await row(caseId)).paused_at).toBeNull();
    await pause.run(days(1.1, now));
    expect((await row(caseId)).paused_at).not.toBeNull();
    expect((await row(future)).paused_at).toBeNull();
  });

  it('answers: still needed / wait for better reset everything; not needed closes the case', async () => {
    const cli = await client();
    const other = await client();
    const att = await attorney();
    const ask = app.get(CaseStaleAskJob);
    const now = noon();

    for (const answer of ['still_needed', 'wait_better'] as const) {
      const caseId = await kase(cli.id, { silentDays: 40 });
      await ask.run(now);
      expect((await row(caseId)).stale_prompt_sent_at).not.toBeNull();
      const res = await api()
        .post(`/api/v1/cases/${caseId}/still-needed`)
        .set(cli.auth)
        .send({ answer });
      expect(res.status).toBe(200);
      const after = await row(caseId);
      expect(after.stale_prompt_sent_at).toBeNull();
      expect(after.paused_at).toBeNull();
      expect(after.client_active_at.getTime()).toBeGreaterThan(
        days(-1).getTime(),
      );
      // A new silent period: not due again right away.
      await ask.run(days(1, now));
      expect((await row(caseId)).stale_prompt_sent_at).toBeNull();
    }

    // Not the owner's case: not found.
    const mine = await kase(cli.id, { silentDays: 40 });
    await api()
      .post(`/api/v1/cases/${mine}/still-needed`)
      .set(other.auth)
      .send({ answer: 'still_needed' })
      .expect(404);
    await api()
      .post(`/api/v1/cases/${mine}/still-needed`)
      .set(att.auth)
      .send({ answer: 'still_needed' })
      .expect(403);
    await api()
      .post(`/api/v1/cases/${mine}/still-needed`)
      .set(cli.auth)
      .send({ answer: 'nope' })
      .expect(400);

    // «Уже не нужен»: the client withdraws the case (bids rejected).
    const placed = await bid(att, mine);
    expect(placed.status).toBe(201);
    const gone = await api()
      .post(`/api/v1/cases/${mine}/still-needed`)
      .set(cli.auth)
      .send({ answer: 'not_needed' });
    expect(gone.status).toBe(200);
    expect((await row(mine)).status).toBe('closed');
    expect(
      (
        await prisma.bid.findUniqueOrThrow({
          where: { id: placed.body.data.id as string },
        })
      ).status,
    ).toBe('rejected_auto');
    expect(await feedIds(att)).not.toContain(mine);
  });

  it('«Сменить на «Не срочно»» is offered for urgent cases older than 7 days only', async () => {
    const cli = await client();
    const fresh = await kase(cli.id, {
      urgency: 'urgent',
      silentDays: 5,
      ageDays: 5,
    });
    const old = await kase(cli.id, {
      urgency: 'very_urgent',
      silentDays: 10,
      ageDays: 10,
    });
    const flex = await kase(cli.id, { silentDays: 10, ageDays: 10 });

    const detail = (id: string) =>
      api().get(`/api/v1/users/me/cases/${id}`).set(cli.auth);
    expect((await detail(fresh)).body.data.canMakeNotUrgent).toBe(false);
    expect((await detail(old)).body.data.canMakeNotUrgent).toBe(true);
    expect((await detail(flex)).body.data.canMakeNotUrgent).toBe(false);

    await api()
      .post(`/api/v1/cases/${fresh}/still-needed`)
      .set(cli.auth)
      .send({ answer: 'make_not_urgent' })
      .expect(409);
    const res = await api()
      .post(`/api/v1/cases/${old}/still-needed`)
      .set(cli.auth)
      .send({ answer: 'make_not_urgent' });
    expect(res.status).toBe(200);
    expect(res.body.data.urgency).toBe('flexible');
    const after = await row(old);
    expect(after.urgency).toBe('flexible');
    expect(after.stale_prompt_sent_at).toBeNull();
    expect((await detail(old)).body.data.canMakeNotUrgent).toBe(false);
  });

  it('the case shows the pending question and the pause to its owner', async () => {
    const cli = await client();
    const caseId = await kase(cli.id, { silentDays: 40 });
    const ask = app.get(CaseStaleAskJob);
    const pause = app.get(CaseStalePauseJob);
    const now = noon();
    const detail = () =>
      api().get(`/api/v1/users/me/cases/${caseId}`).set(cli.auth);
    expect((await detail()).body.data.stillNeededPending).toBe(false);
    // (Opening the case was the client's own action: silent again.)
    await prisma.case.update({
      where: { id: caseId },
      data: { client_active_at: days(-40) },
    });
    await ask.run(now);
    const asked = (await detail()).body.data;
    expect(asked.stillNeededPending).toBe(true);
    expect(asked.pausedAt).toBeNull();
    // (Opening the case just now counted as activity: silent again.)
    await prisma.case.update({
      where: { id: caseId },
      data: { client_active_at: days(-40) },
    });
    await pause.run(days(15, now));
    const paused = (await detail()).body.data;
    expect(paused.pausedAt).not.toBeNull();
    expect(paused.stillNeededPending).toBe(false);
    const list = await api().get('/api/v1/users/me/cases').set(cli.auth);
    const card = (
      list.body.data as { id: string; pausedAt: string | null }[]
    ).find((c) => c.id === caseId);
    expect(card?.pausedAt).not.toBeNull();
  });

  it('a case paused for 30 days is archived like the old auto-archive', async () => {
    const cli = await client();
    const att = await attorney();
    const caseId = await kase(cli.id, { silentDays: 40 });
    const placed = await bid(att, caseId);
    expect(placed.status).toBe(201);
    const pausedAt = days(-31);
    await prisma.case.update({
      where: { id: caseId },
      data: { paused_at: pausedAt, stale_prompt_sent_at: days(-45) },
    });
    await app.get(CaseStalePauseJob).run(new Date());
    const after = await row(caseId);
    expect(after.status).toBe('archived');
    expect(after.archived_at).not.toBeNull();
    expect(
      (
        await prisma.bid.findUniqueOrThrow({
          where: { id: placed.body.data.id as string },
        })
      ).status,
    ).toBe('rejected_auto');
    const archived = await prisma.notification.count({
      where: { user_id: cli.id, type: 'case_archived' },
    });
    expect(archived).toBe(1);
    // A restore starts a fresh, visible period.
    await api()
      .post(`/api/v1/cases/${caseId}/restore`)
      .set(cli.auth)
      .expect(200);
    const back = await row(caseId);
    expect(back.status).toBe('open');
    expect(back.paused_at).toBeNull();
  });

  it('the card line: online / last seen / answers within a day, hidden by the privacy switch', async () => {
    const cli = await client();
    const att = await attorney();
    const caseId = await kase(cli.id, { silentDays: 1 });
    await prisma.user.update({
      where: { id: cli.id },
      data: { last_active_at: days(-3) },
    });
    const item = async () => {
      const res = await api().get('/api/v1/cases?limit=50').set(att.auth);
      return (
        res.body.data as {
          id: string;
          clientActivity: {
            online: boolean;
            lastSeenDays: number | null;
            respondsWithinDay: boolean;
          } | null;
        }[]
      ).find((c) => c.id === caseId);
    };
    expect((await item())?.clientActivity).toEqual({
      online: false,
      lastSeenDays: 3,
      respondsWithinDay: false,
    });

    // Three bids the client declined within minutes → answers within a day.
    for (let i = 0; i < 3; i += 1) {
      const a = await attorney();
      const c = await kase(cli.id, { silentDays: 1 });
      const placed = await bid(a, c);
      expect(placed.status).toBe(201);
      await api()
        .post(`/api/v1/bids/${placed.body.data.id as string}/decline`)
        .set(cli.auth)
        .send({})
        .expect(201);
    }
    // The answer is cached for an hour: drop it to see the new samples.
    const redis = app.get<Redis>(REDIS_CLIENT);
    await redis.del(`case:resp24:${cli.id}`);
    expect((await item())?.clientActivity?.respondsWithinDay).toBe(true);

    // Reciprocal: a client who hides their status shows no line…
    await prisma.user.update({
      where: { id: cli.id },
      data: { show_activity_status: false },
    });
    expect((await item())?.clientActivity).toBeNull();
    // …and so does the card for an attorney who hides theirs.
    await prisma.user.update({
      where: { id: cli.id },
      data: { show_activity_status: true },
    });
    await prisma.user.update({
      where: { id: att.id },
      data: { show_activity_status: false },
    });
    expect((await item())?.clientActivity).toBeNull();
  });
});
