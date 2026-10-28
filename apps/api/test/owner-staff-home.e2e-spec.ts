import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  StaffSettingsService,
  resolveStaffSettings,
} from '../src/modules/staff-core/staff-settings.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import {
  adminSession,
  adminStepUp,
  type AdminSession,
} from './support/admin-login';

/**
 * Staff package T10: «Сегодня» (one snapshot, owner only), the worker's OWN
 * rating (`admin/staff/me/progress`) and the suggestion buttons, on a real
 * PostgreSQL and Redis. The snapshot date is far in the future so the
 * suite's rows are always the "latest" whatever else the database holds.
 */
jest.setTimeout(120_000);

const SNAP = new Date('2099-01-01T00:00:00Z');
const TODAY_KEY = 'adm:sum:staff.today';

describe('Staff owner home (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let base = '';
  let settings: StaffSettingsService;
  let owner: AdminSession;
  let good: AdminSession;
  let poor: AdminSession;
  let newbie: AdminSession;
  const api = () => request(base);
  const on = (extra: Record<string, boolean> = {}) =>
    jest.spyOn(settings, 'get').mockImplementation(() =>
      Promise.resolve(
        resolveStaffSettings({
          'staff.owner_home_enabled': true,
          'staff.rating_enabled': true,
          'staff.suggestions_enabled': true,
          'staff.worker_progress_enabled': true,
          ...extra,
        }),
      ),
    );

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
    redis = app.get<Redis>(REDIS_CLIENT);
    settings = app.get(StaffSettingsService);
    owner = await adminSession(base, prisma, 'super_admin');
    good = await adminSession(base, prisma, 'verifier');
    poor = await adminSession(base, prisma, 'verifier');
    newbie = await adminSession(base, prisma, 'verifier');
    await prisma.user.update({
      where: { id: poor.userId },
      data: { first_name: 'Pavel', last_name: 'Poor' },
    });
    await prisma.staffRatingSnapshot.createMany({
      data: [
        {
          admin_id: good.userId,
          snapshot_date: SNAP,
          workspace: 'mass',
          rating: 96,
          n_decisions: 200,
          accuracy: 97,
          clean: 95,
          users_verdict: 90,
          speed: 99,
          status: 'green',
          rank_pct: 2,
          evidence: { trend: [90, 94, 96], best: ['secret-decision'] },
        },
        {
          admin_id: poor.userId,
          snapshot_date: SNAP,
          workspace: 'mass',
          rating: 48,
          n_decisions: 120,
          status: 'red',
          flags: ['very_low'],
          rank_pct: 99,
          evidence: { trend: [60, 50, 48] },
        },
      ],
    });
    await prisma.staffSuggestion.createMany({
      data: [
        {
          admin_id: good.userId,
          kind: 'reward',
          snapshot_date: SNAP,
          evidence: { rating: 96, n: 200, flags: [] },
        },
        {
          admin_id: good.userId,
          kind: 'warn',
          snapshot_date: SNAP,
          evidence: { rating: 96, n: 200, flags: [] },
        },
        {
          admin_id: poor.userId,
          kind: 'pull',
          snapshot_date: SNAP,
          evidence: { rating: 48, n: 120, flags: ['very_low'], rankPct: 99 },
        },
      ],
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    const admins = [good, poor, newbie].map((a) => a.userId);
    await redis.del(TODAY_KEY);
    await prisma.staffAction.deleteMany({
      where: { admin_id: { in: admins } },
    });
    await prisma.staffMemberState.deleteMany({
      where: { admin_id: { in: admins } },
    });
    await prisma.staffSuggestion.deleteMany({
      where: { admin_id: { in: admins } },
    });
    await prisma.staffRatingSnapshot.deleteMany({
      where: { admin_id: { in: admins } },
    });
    await app.close();
  });

  afterEach(() => jest.restoreAllMocks());

  it('everything off (the default): the owner gets 404 on every new route', async () => {
    await api().get('/api/v1/admin/staff/today').set(owner.auth).expect(404);
    await api()
      .get('/api/v1/admin/staff/today/system')
      .set(owner.auth)
      .expect(404);
    await api()
      .post('/api/v1/admin/staff/today/sentry/123/resolve')
      .set(owner.auth)
      .expect(404);
    await api().get('/api/v1/admin/staff/digest').set(owner.auth).expect(404);
    await api()
      .get('/api/v1/admin/staff/me/progress')
      .set(good.auth)
      .expect(404);
    await api()
      .get(`/api/v1/admin/staff/people/${poor.userId}/history`)
      .set(owner.auth)
      .expect(404);
  });

  it('today: the owner reads it, a worker or no login does not', async () => {
    on();
    await redis.del(TODAY_KEY);
    const res = await api()
      .get('/api/v1/admin/staff/today')
      .set(owner.auth)
      .expect(200);
    const t = (
      res.body as {
        data: {
          shortlist: {
            worst: Array<{ adminId: string }>;
            best: Array<{ adminId: string }>;
          };
          suggestions: {
            items: Array<{ recommendation: { adviceLabel: string } }>;
          };
          appeals: unknown;
          decision: { code: string };
        };
      }
    ).data;
    expect(t.shortlist.worst.map((p) => p.adminId)).toContain(poor.userId);
    expect(t.shortlist.best.map((p) => p.adminId)).toContain(good.userId);
    expect(t.suggestions.items[0]).toMatchObject({
      kind: 'pull',
      name: 'Pavel Poor',
    });
    expect(t.suggestions.items[0].recommendation.adviceLabel).toBe('Заменить');
    expect(t.appeals).toBeNull(); // its own switch is off
    expect(t.decision.code).toBe('suggestion_removal');
    await api().get('/api/v1/admin/staff/today').set(good.auth).expect(404);
    await api().get('/api/v1/admin/staff/today').expect(401);
  });

  it('today/system (owner desk 2026-10-27): ordered system actions + the Sentry line (off by default)', async () => {
    on();
    await redis.del('adm:sum:staff.today.system');
    const res = await api()
      .get('/api/v1/admin/staff/today/system')
      .set(owner.auth)
      .expect(200);
    const s = (
      res.body as {
        data: {
          freshSec: number;
          items: Array<{
            code: string;
            severity: string;
            action: { kind: string };
          }>;
          counts: Record<string, number>;
          sentry: { state: string };
        };
      }
    ).data;
    expect(s.freshSec).toBeGreaterThanOrEqual(300);
    expect(Array.isArray(s.items)).toBe(true);
    const order = ['critical', 'high', 'medium', 'low'];
    const idx = s.items.map((i) => order.indexOf(i.severity));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(new Set(s.items.map((i) => i.code)).size).toBe(s.items.length);
    expect(
      s.counts.critical + s.counts.high + s.counts.medium + s.counts.low,
    ).toBe(s.items.length);
    expect(s.sentry.state).toBe('off');
    // a resolve without a fresh code is refused by the step-up, never reaches Sentry
    await api()
      .post('/api/v1/admin/staff/today/sentry/123/resolve')
      .set(owner.auth)
      .expect(403);
    await api()
      .get('/api/v1/admin/staff/today/system')
      .set(good.auth)
      .expect(404);
  });

  it('today costs ONE database query when cold and none when warm', async () => {
    on();
    await redis.del(TODAY_KEY);
    const raw = jest.spyOn(prisma, '$queryRaw');
    await api().get('/api/v1/admin/staff/today').set(owner.auth).expect(200);
    const cold = raw.mock.calls.length;
    raw.mockClear();
    await api().get('/api/v1/admin/staff/today').set(owner.auth).expect(200);
    expect(raw.mock.calls.length).toBe(0);
    expect(cold).toBe(1);
  });

  it('me/progress: a worker reads only their own card, soft suggestions only', async () => {
    on();
    const mine = await api()
      .get('/api/v1/admin/staff/me/progress')
      .set(good.auth)
      .expect(200);
    const g = (
      mine.body as {
        data: { openSuggestions: unknown; evidence: unknown };
      }
    ).data;
    expect(g).toMatchObject({
      rating: 96,
      status: 'green',
      decisions: 200,
      rankPct: 2,
    });
    expect(g.openSuggestions).toEqual([{ kind: 'reward' }]); // the warning is not shown
    expect(g.evidence).toEqual({ trend: [90, 94, 96] }); // no decision ids
    expect(JSON.stringify(mine.body)).not.toContain('secret-decision');

    const other = await api()
      .get('/api/v1/admin/staff/me/progress')
      .set(poor.auth)
      .expect(200);
    expect((other.body as { data: { rating: number } }).data.rating).toBe(48);
    // no snapshot yet → not found, not somebody else's card
    await api()
      .get('/api/v1/admin/staff/me/progress')
      .set(newbie.auth)
      .expect(404);
    // the id cannot be chosen
    const forged = await api()
      .get(`/api/v1/admin/staff/me/progress?adminId=${poor.userId}`)
      .set(good.auth)
      .expect(200);
    expect((forged.body as { data: { rating: number } }).data.rating).toBe(96);
    // personal progress has its own switch
    jest.restoreAllMocks();
    jest
      .spyOn(settings, 'get')
      .mockImplementation(() =>
        Promise.resolve(resolveStaffSettings({ 'staff.rating_enabled': true })),
      );
    await api()
      .get('/api/v1/admin/staff/me/progress')
      .set(good.auth)
      .expect(404);
  });

  it('suggestion buttons: owner only, apply needs a fresh code, writes the journal', async () => {
    on();
    const s = await prisma.staffSuggestion.findFirstOrThrow({
      where: { admin_id: poor.userId, kind: 'pull' },
    });
    const url = `/api/v1/admin/staff/suggestions/${s.id}/decide`;
    await api().post(url).set(good.auth).send({ action: 'apply' }).expect(404);
    await adminStepUp(base, owner);
    const done = await api()
      .post(url)
      .set(owner.auth)
      .send({ action: 'apply', note: 'test' })
      .expect(200);
    expect((done.body as { data: { status: string } }).data.status).toBe(
      'applied',
    );
    const state = await prisma.staffMemberState.findUniqueOrThrow({
      where: { admin_id: poor.userId },
    });
    expect(state.state).toBe('paused');
    const act = await prisma.staffAction.findFirstOrThrow({
      where: { admin_id: poor.userId },
    });
    expect(act).toMatchObject({
      kind: 'pull',
      actor_id: owner.userId,
      reason_code: 'very_low',
    });
    // a second press is a clean 400
    await api().post(url).set(owner.auth).send({ action: 'apply' }).expect(400);
    // history shows the action
    const h = await api()
      .get(`/api/v1/admin/staff/people/${poor.userId}/history`)
      .set(owner.auth)
      .expect(200);
    expect(
      (h.body as { data: { state: string; actions: unknown[] } }).data,
    ).toMatchObject({ state: 'paused' });
    await api()
      .get(`/api/v1/admin/staff/people/${poor.userId}/history`)
      .set(good.auth)
      .expect(404);
  });

  it('weekly digest list is the owner’s only', async () => {
    on({ 'staff.weekly_digest_enabled': true });
    const week = new Date('2099-01-05T00:00:00Z');
    await prisma.staffDigest.upsert({
      where: { week_start: week },
      create: { week_start: week, payload: { decisions: 3 } },
      update: {},
    });
    try {
      const r = await api()
        .get('/api/v1/admin/staff/digest')
        .set(owner.auth)
        .expect(200);
      expect(
        (r.body as { data: { items: Array<{ weekStart: string }> } }).data
          .items[0].weekStart,
      ).toBe('2099-01-05');
      await api().get('/api/v1/admin/staff/digest').set(good.auth).expect(404);
    } finally {
      await prisma.staffDigest.delete({ where: { week_start: week } });
    }
  });
});
