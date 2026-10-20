import { readFileSync } from 'fs';
import { join } from 'path';
import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ConsultationRemindersJob } from '../src/modules/consultations/consultation-reminders.job';
import { adminSession } from './support/admin-login';
import { LegalQaService } from '../src/modules/legal-qa/legal-qa.service';

/**
 * Owner 2026-10-20: booking a consultation, «Вопрос юристу» and the
 * deadline calculator.
 */
jest.setTimeout(120_000);

describe('Booking, Q&A, deadlines (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';

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
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York', is_active: true },
      update: {},
    });
    // The e2e database is truncated between suites; the rules and holidays
    // the calculator starts with come from this (idempotent) migration.
    const seed = readFileSync(
      join(
        __dirname,
        '../prisma/migrations/20261020190200_deadline_seed/migration.sql',
      ),
      'utf8',
    );
    for (const line of seed.split('\n')) {
      if (line.startsWith('INSERT INTO')) await prisma.$executeRawUnsafe(line);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);

  const leafArea = () =>
    prisma.practiceArea.upsert({
      where: { code: 'e2e_booking_qa_leaf' },
      create: {
        code: 'e2e_booking_qa_leaf',
        name_en: 'E2E booking',
        i18n_key: 'practice.e2e_booking_qa_leaf',
        sort: 1,
      },
      update: { is_active: true },
    });
  const bearer = (id: string, role: string | null) => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });
  const phone = () =>
    `+1312${2 + Math.floor(Math.random() * 8)}${String(
      Math.floor(Math.random() * 1e6),
    ).padStart(6, '0')}`;

  async function attorney(
    opts: { verified?: boolean; subscribed?: boolean } = {},
  ) {
    const verified = opts.verified ?? true;
    const a = await prisma.user.create({
      data: {
        role: 'attorney',
        first_name: 'Ada',
        last_name: 'Counsel',
        phone_e164: phone(),
        phone_verified_at: new Date(),
        timezone: 'America/New_York',
      },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: a.id,
        username: `bk_${a.id.slice(0, 8)}`,
        username_lower: `bk_${a.id.slice(0, 8)}`,
        languages: ['en'],
        verification_status: verified ? 'verified' : 'unverified',
      },
    });
    if (opts.subscribed ?? true) {
      await prisma.subscription.create({
        data: {
          user_id: a.id,
          status: 'active',
          price_cents: 39900,
          plan: 'monthly',
        },
      });
    }
    return { id: a.id, auth: bearer(a.id, 'attorney') };
  }

  async function client() {
    const u = await prisma.user.create({
      data: {
        role: 'client',
        first_name: 'Cy',
        last_name: 'Client',
        phone_e164: phone(),
        phone_verified_at: new Date(),
      },
    });
    return { id: u.id, auth: bearer(u.id, 'client') };
  }

  const allWeek = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    startMinute: 9 * 60,
    endMinute: 17 * 60,
  }));
  const settings = (over: Record<string, unknown> = {}) => ({
    enabled: true,
    slotMinutes: 30,
    bufferMinutes: 0,
    minNoticeHours: 0,
    horizonDays: 30,
    autoConfirm: false,
    timezone: 'America/New_York',
    windows: allWeek,
    timeOff: [],
    ...over,
  });

  describe('consultations', () => {
    it('slots → request → confirm → planner entries → cancel', async () => {
      const att = await attorney();
      const cl = await client();

      const put = await api()
        .put('/api/v1/consultations/settings')
        .set(att.auth)
        .send(settings())
        .expect(200);
      expect(put.body.data).toMatchObject({ enabled: true, bookable: true });

      const slots = await api()
        .get('/api/v1/consultations/slots')
        .query({ attorneyId: att.id, days: 3 })
        .set(cl.auth)
        .expect(200);
      expect(slots.body.data.slots.length).toBeGreaterThan(0);
      expect(slots.body.data.localSlots).toHaveLength(
        slots.body.data.slots.length,
      );
      expect(slots.body.data.localSlots[0]).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
      );
      const start = slots.body.data.slots[1] as string;

      const booked = await api()
        .post('/api/v1/consultations')
        .set(cl.auth)
        .set('Idempotency-Key', randomUUID())
        .send({ attorneyId: att.id, startsAt: start, note: 'Lease question' })
        .expect(201);
      const id = booked.body.data.id as string;
      expect(booked.body.data).toMatchObject({
        status: 'pending',
        viewerRole: 'client',
        canCall: false,
      });

      // The slot is gone for the next client.
      const other = await client();
      const taken = await api()
        .post('/api/v1/consultations')
        .set(other.auth)
        .send({ attorneyId: att.id, startsAt: start })
        .expect(409);
      expect(taken.body.error.code).toBe('CONSULTATION_SLOT_TAKEN');
      const again = await api()
        .get('/api/v1/consultations/slots')
        .query({ attorneyId: att.id, days: 3 })
        .set(cl.auth)
        .expect(200);
      expect(again.body.data.slots).not.toContain(start);

      // The client cannot confirm their own request.
      await api()
        .post(`/api/v1/consultations/${id}/confirm`)
        .set(cl.auth)
        .expect(403);

      const pending = await api()
        .get('/api/v1/consultations')
        .query({ view: 'pending' })
        .set(att.auth)
        .expect(200);
      expect(
        (pending.body.data as { id: string }[]).map((c) => c.id),
      ).toContain(id);

      const ok = await api()
        .post(`/api/v1/consultations/${id}/confirm`)
        .set(att.auth)
        .expect(201);
      expect(ok.body.data.status).toBe('confirmed');

      // Both Planners hold the entry; its time is not editable there.
      const tasks = await prisma.attorneyTask.findMany({
        where: { consultation_id: id },
      });
      expect(tasks.map((t) => t.attorney_id).sort()).toEqual(
        [att.id, cl.id].sort(),
      );
      expect(tasks.every((t) => t.status === 'open')).toBe(true);
      const clientTask = tasks.find((t) => t.attorney_id === att.id)!;
      const edit = await api()
        .patch(`/api/v1/tasks/${clientTask.id}`)
        .set(att.auth)
        .send({ dueAt: new Date(Date.now() + 5 * 86_400_000).toISOString() });
      expect(edit.status).toBe(409);

      // A system line with the booking sits in the pair's chat.
      const conv = await prisma.consultation.findUniqueOrThrow({
        where: { id },
      });
      const line = await prisma.message.findFirst({
        where: { conversation_id: conv.conversation_id!, type: 'system' },
      });
      expect(line?.body_display).toContain(`consult:${id}`);

      const cancelled = await api()
        .post(`/api/v1/consultations/${id}/cancel`)
        .set(cl.auth)
        .send({ reason: 'Changed my mind' })
        .expect(201);
      expect(cancelled.body.data).toMatchObject({
        status: 'cancelled',
        cancelledBy: 'client',
      });
      const after = await prisma.attorneyTask.findMany({
        where: { consultation_id: id },
      });
      expect(after.every((t) => t.status === 'cancelled')).toBe(true);
      // The slot is free again.
      const free = await api()
        .get('/api/v1/consultations/slots')
        .query({ attorneyId: att.id, days: 3 })
        .set(other.auth)
        .expect(200);
      expect(free.body.data.slots).toContain(start);
    });

    it('auto-confirm books at once; reschedule keeps it confirmed for the attorney', async () => {
      const att = await attorney();
      const cl = await client();
      await api()
        .put('/api/v1/consultations/settings')
        .set(att.auth)
        .send(settings({ autoConfirm: true }))
        .expect(200);
      const slots = await api()
        .get('/api/v1/consultations/slots')
        .query({ attorneyId: att.id, days: 5 })
        .set(cl.auth)
        .expect(200);
      const [a, b] = slots.body.data.slots as string[];
      const c = await api()
        .post('/api/v1/consultations')
        .set(cl.auth)
        .send({ attorneyId: att.id, startsAt: a })
        .expect(201);
      expect(c.body.data.status).toBe('confirmed');
      const moved = await api()
        .post(`/api/v1/consultations/${c.body.data.id}/reschedule`)
        .set(att.auth)
        .send({ startsAt: b })
        .expect(201);
      expect(moved.body.data).toMatchObject({
        startsAt: b,
        status: 'confirmed',
      });
    });

    it('is not bookable without a subscription, verification or hours', async () => {
      const unsub = await attorney({ subscribed: false });
      const cl = await client();
      const res = await api()
        .put('/api/v1/consultations/settings')
        .set(unsub.auth)
        .send(settings())
        .expect(200);
      expect(res.body.data).toMatchObject({
        bookable: false,
        notBookableReason: 'no_subscription',
      });
      const slots = await api()
        .get('/api/v1/consultations/slots')
        .query({ attorneyId: unsub.id })
        .set(cl.auth)
        .expect(409);
      expect(slots.body.error.code).toBe('CONSULTATION_NOT_AVAILABLE');

      const raw = await attorney({ verified: false });
      await api()
        .put('/api/v1/consultations/settings')
        .set(raw.auth)
        .send(settings())
        .expect(403);
    });

    it('the sweep expires an unanswered request and reminds on time', async () => {
      const att = await attorney();
      const cl = await client();
      const job = app.get(ConsultationRemindersJob);
      const now = new Date();
      const mk = (offsetMs: number, status: 'pending' | 'confirmed') =>
        prisma.consultation.create({
          data: {
            attorney_id: att.id,
            client_id: cl.id,
            starts_at: new Date(now.getTime() + offsetMs),
            ends_at: new Date(now.getTime() + offsetMs + 30 * 60_000),
            status,
          },
        });
      // Other cases of this suite leave bookings behind; the sweep is global.
      await prisma.consultation.deleteMany({});
      const stale = await mk(-60_000, 'pending');
      const soon = await mk(40 * 60_000, 'confirmed');
      const tomorrow = await mk(20 * 3_600_000, 'confirmed');
      const r = await job.run(now);
      expect(r).toMatchObject({ expired: 1, hour: 1, day: 1 });
      expect(
        (
          await prisma.consultation.findUniqueOrThrow({
            where: { id: stale.id },
          })
        ).status,
      ).toBe('declined');
      const s = await prisma.consultation.findUniqueOrThrow({
        where: { id: soon.id },
      });
      expect(s.reminded_hour_at).not.toBeNull();
      expect(
        (
          await prisma.consultation.findUniqueOrThrow({
            where: { id: tomorrow.id },
          })
        ).reminded_day_at,
      ).not.toBeNull();
      // A second run sends nothing twice.
      expect(await job.run(now)).toMatchObject({ expired: 0, hour: 0, day: 0 });
      const pushed = await prisma.notification.count({
        where: { type: 'consultation_update', user_id: cl.id },
      });
      expect(pushed).toBeGreaterThanOrEqual(3);
    });
  });

  describe('ask a lawyer', () => {
    it('ask → answer → like → best, anonymity, verified-only, report', async () => {
      const cl = await client();
      const att = await attorney();
      const raw = await attorney({ verified: false });
      const area = await leafArea();

      const q = await api()
        .post('/api/v1/questions')
        .set(cl.auth)
        .set('Idempotency-Key', randomUUID())
        .send({
          title: 'Can my landlord keep the deposit?',
          body: 'He says call him at 312 555 0100 about the damage claim.',
          practiceAreaId: area.id,
          stateCode: 'NY',
          anonymous: true,
        })
        .expect(201);
      const id = q.body.data.id as string;
      expect(q.body.data).toMatchObject({ isAnonymous: true, isMine: true });
      expect(q.body.data.body).not.toContain('555 0100');

      // Others see «anonymous»: no author at all.
      const seen = await api()
        .get(`/api/v1/questions/${id}`)
        .set(att.auth)
        .expect(200);
      expect(seen.body.data.author).toBeNull();
      expect(seen.body.data.canAnswer).toBe(true);

      // An attorney who is not verified cannot answer; a client cannot either.
      await api()
        .put(`/api/v1/questions/${id}/answer`)
        .set(raw.auth)
        .send({ body: 'Probably not, check your lease.' })
        .expect(403);
      await api()
        .put(`/api/v1/questions/${id}/answer`)
        .set((await client()).auth)
        .send({ body: 'Probably not, check your lease.' })
        .expect(403);

      const ans = await api()
        .put(`/api/v1/questions/${id}/answer`)
        .set(att.auth)
        .send({ body: 'In NY the deposit must be returned within 14 days.' })
        .expect(200);
      const answerId = ans.body.data.id as string;
      // Editing keeps one answer.
      await api()
        .put(`/api/v1/questions/${id}/answer`)
        .set(att.auth)
        .send({ body: 'In New York the deposit must be returned in 14 days.' })
        .expect(200);
      const detail = await api()
        .get(`/api/v1/questions/${id}`)
        .set(cl.auth)
        .expect(200);
      expect(detail.body.data.answerCount).toBe(1);
      expect(detail.body.data.answers).toHaveLength(1);

      // Like once, idempotently; not one's own answer.
      const other = await client();
      await api()
        .put(`/api/v1/questions/${id}/answers/${answerId}/like`)
        .set(other.auth)
        .expect(200);
      const liked = await api()
        .put(`/api/v1/questions/${id}/answers/${answerId}/like`)
        .set(other.auth)
        .expect(200);
      expect(liked.body.data).toMatchObject({ likeCount: 1, likedByMe: true });
      await api()
        .put(`/api/v1/questions/${id}/answers/${answerId}/like`)
        .set(att.auth)
        .expect(403);

      // Only the author marks the best answer.
      await api()
        .put(`/api/v1/questions/${id}/best`)
        .set(other.auth)
        .send({ answerId })
        .expect(403);
      const best = await api()
        .put(`/api/v1/questions/${id}/best`)
        .set(cl.auth)
        .send({ answerId })
        .expect(200);
      expect(best.body.data.bestAnswerId).toBe(answerId);
      expect(best.body.data.answers[0].isBest).toBe(true);

      // Lists: filter solved, search, mine.
      const solved = await api()
        .get('/api/v1/questions')
        .query({ filter: 'solved', q: 'deposit' })
        .set(other.auth)
        .expect(200);
      expect((solved.body.data as { id: string }[]).map((x) => x.id)).toContain(
        id,
      );
      const mine = await api()
        .get('/api/v1/questions')
        .query({ filter: 'mine' })
        .set(att.auth)
        .expect(200);
      expect((mine.body.data as { id: string }[]).map((x) => x.id)).toContain(
        id,
      );

      // Reports use the usual endpoint and reach the moderation resolver.
      await api()
        .post('/api/v1/reports')
        .set(other.auth)
        .send({
          targetType: 'legal_answer',
          targetId: answerId,
          reason: 'spam',
        })
        .expect(204);

      // Deleting the answer frees the counters.
      await api()
        .delete(`/api/v1/questions/${id}/answer`)
        .set(att.auth)
        .expect(204);
      const after = await api()
        .get(`/api/v1/questions/${id}`)
        .set(cl.auth)
        .expect(200);
      expect(after.body.data).toMatchObject({
        answerCount: 0,
        bestAnswerId: null,
      });
    });

    it('alerts verified attorneys of the practice area and state who opted in', async () => {
      const cl = await client();
      const att = await attorney();
      const area = await leafArea();
      await prisma.attorneyPracticeArea.create({
        data: { attorney_id: att.id, practice_area_id: area.id },
      });
      await prisma.attorneyLicense.create({
        data: {
          attorney_id: att.id,
          state_code: 'NY',
          bar_number: `NY${Math.floor(Math.random() * 1e6)}`,
          license_status: 'verified',
        },
      });
      await prisma.notificationSetting.create({
        data: { user_id: att.id, category: 'new_cases', push_enabled: true },
      });
      const q = await prisma.legalQuestion.create({
        data: {
          author_id: cl.id,
          practice_area_id: area.id,
          state_code: 'NY',
          title: 'A question for alerts',
          body: 'Some longer question text.',
        },
      });
      const n = await app.get(LegalQaService).alertAttorneys(q);
      expect(n).toBe(1);
      expect(
        await prisma.notification.count({
          where: { type: 'legal_question_new', user_id: att.id },
        }),
      ).toBe(1);
    });
  });

  describe('deadline calculator', () => {
    it('counts the federal answer period past a weekend and a holiday', async () => {
      const cl = await client();
      const ok = await api()
        .get('/api/v1/deadlines/calculate')
        .query({ ruleCode: 'frcp_12a_answer', eventDate: '2026-10-05' })
        .set(cl.auth)
        .expect(200);
      expect(ok.body.data).toMatchObject({
        dueDate: '2026-10-26',
        rolled: false,
      });
      // 21 days from 2026-09-21 is Mon 2026-10-12 — Columbus Day: next day.
      const holiday = await api()
        .get('/api/v1/deadlines/calculate')
        .query({ ruleCode: 'frcp_12a_answer', eventDate: '2026-09-21' })
        .set(cl.auth)
        .expect(200);
      expect(holiday.body.data).toMatchObject({
        rawDate: '2026-10-12',
        dueDate: '2026-10-13',
        rolled: true,
      });
      expect(holiday.body.data.warnings).toContain('rolled');
      expect(holiday.body.data.holidays[0].date).toBe('2026-10-12');
    });

    it('warns when the holidays of a year are not loaded', async () => {
      const cl = await client();
      const r = await api()
        .get('/api/v1/deadlines/calculate')
        .query({ ruleCode: 'frcp_12a_answer', eventDate: '2031-03-03' })
        .set(cl.auth)
        .expect(200);
      expect(r.body.data.warnings).toContain('holidays_missing');
      await api()
        .get('/api/v1/deadlines/calculate')
        .query({ ruleCode: 'nope', eventDate: '2031-03-03' })
        .set(cl.auth)
        .expect(404);
    });

    it('lists rules by state and statutes by practice category', async () => {
      const cl = await client();
      const res = await api()
        .get('/api/v1/deadlines/rules')
        .query({ kind: 'statute_of_limitations' })
        .set(cl.auth)
        .expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(
        (res.body.data as { practiceCode: string | null }[]).every(
          (r) => r.practiceCode,
        ),
      ).toBe(true);
    });

    it('the admin adds federal holidays of a new year, idempotently, and edits a rule', async () => {
      const admin = await adminSession(base, prisma, 'super_admin');
      const first = await api()
        .post('/api/v1/admin/deadlines/holidays/federal')
        .set(admin.auth)
        .send({ year: 2029 })
        .expect(200);
      expect(first.body.data.created).toBeGreaterThan(8);
      const second = await api()
        .post('/api/v1/admin/deadlines/holidays/federal')
        .set(admin.auth)
        .send({ year: 2029 })
        .expect(200);
      expect(second.body.data).toMatchObject({
        created: 0,
        existing: first.body.data.created,
      });
      const cl = await client();
      const list = await api()
        .get('/api/v1/deadlines/holidays')
        .query({ year: 2029 })
        .set(cl.auth)
        .expect(200);
      expect(
        (list.body.data as { date: string }[]).map((h) => h.date),
      ).toContain('2029-07-04');

      const created = await api()
        .post('/api/v1/admin/deadlines/rules')
        .set(admin.auth)
        .send({
          jurisdiction: 'NY',
          kind: 'court_deadline',
          code: `ny_test_${Date.now()}`,
          labels: { en: 'Test rule' },
          amount: 30,
          dayType: 'business',
        })
        .expect(201);
      const id = created.body.data.id as string;
      const edited = await api()
        .patch(`/api/v1/admin/deadlines/rules/${id}`)
        .set(admin.auth)
        .send({ amount: 10, verified: true })
        .expect(200);
      expect(edited.body.data).toMatchObject({ amount: 10, verified: true });
      // Clients never reach the admin routes.
      await api().get('/api/v1/admin/deadlines/rules').set(cl.auth).expect(401);
      await api()
        .delete(`/api/v1/admin/deadlines/rules/${id}`)
        .set(admin.auth)
        .expect(204);
    });
  });
});
