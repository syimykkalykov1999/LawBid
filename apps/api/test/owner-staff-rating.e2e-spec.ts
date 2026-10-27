import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { StaffDailyStatsJob } from '../src/jobs/handlers/staff-daily-stats.job';
import { StaffRatingNightlyJob } from '../src/jobs/handlers/staff-rating-nightly.job';
import {
  StaffSettingsService,
  resolveStaffSettings,
} from '../src/modules/staff-core/staff-settings.service';
import { StaffCountersService } from '../src/modules/staff-rating/staff-counters.service';
import {
  StaffRatingReadService,
  ratingScope,
} from '../src/modules/staff-rating/staff-rating-read.service';
import { StaffRecorderService } from '../src/modules/staff-rating/staff-recorder.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { adminSession, type AdminSession } from './support/admin-login';

/**
 * Staff package T5 (rating / KPI engine): decisions → Redis counters →
 * staff_daily_stats → nightly snapshots + suggestions → the owner / head
 * read API, on a real PostgreSQL and Redis. Dates are fixed in the past, so
 * the suite never depends on the time of day it runs (no UTC-midnight flake).
 */
jest.setTimeout(120_000);

const SEED_AT = new Date('2026-09-15T12:00:00Z'); // the decisions' day
const DAILY_RUN = new Date('2026-09-16T01:10:00Z'); // staff.daily-stats
const NIGHTLY_RUN = new Date('2026-09-16T01:40:00Z'); // staff.rating-nightly

const ALL_ON = {
  'staff.rating_enabled': true,
  'staff.suggestions_enabled': true,
  'staff.anomalies_enabled': true,
};

describe('Staff rating engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let base = '';
  let settings: StaffSettingsService;
  let counters: StaffCountersService;
  let recorder: StaffRecorderService;
  let read: StaffRatingReadService;
  let owner: AdminSession;
  let good: AdminSession;
  let poor: AdminSession;
  let newbie: AdminSession;
  let accountant: AdminSession;
  const ids = () => [good, poor, newbie, accountant].map((a) => a.userId);

  const setSwitches = (on: Record<string, boolean>) =>
    jest
      .spyOn(settings, 'get')
      .mockImplementation(() => Promise.resolve(resolveStaffSettings(on)));

  async function decide(a: AdminSession, n: number, handleMs = 40_000) {
    for (let i = 0; i < n; i++) {
      await counters.bump(
        {
          adminId: a.userId,
          itemKind: 'verification',
          itemId: randomUUID(),
          outcome: i % 2 ? 'approve' : 'reject',
          handleMs,
        },
        SEED_AT,
      );
    }
  }

  async function signals(a: AdminSession, kind: string, n: number) {
    await prisma.staffQualitySignal.createMany({
      data: Array.from({ length: n }, () => ({
        admin_id: a.userId,
        kind,
        item_kind: 'verification',
        item_id: randomUUID(),
        created_at: SEED_AT,
      })),
    });
  }

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
    counters = app.get(StaffCountersService);
    recorder = app.get(StaffRecorderService);
    read = app.get(StaffRatingReadService);

    owner = await adminSession(base, prisma, 'super_admin');
    good = await adminSession(base, prisma, 'verifier');
    poor = await adminSession(base, prisma, 'verifier');
    newbie = await adminSession(base, prisma, 'verifier');
    accountant = await adminSession(base, prisma, 'finance');
    await prisma.adminProfile.update({
      where: { user_id: accountant.userId },
      data: { workspace: 'finance' },
    });
    await prisma.user.update({
      where: { id: poor.userId },
      data: { first_name: 'Pavel', last_name: 'Poor' },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    const admins = ids();
    await prisma.staffSuggestion.deleteMany({
      where: { admin_id: { in: admins } },
    });
    await prisma.staffAction.deleteMany({
      where: { admin_id: { in: admins } },
    });
    await prisma.staffRatingSnapshot.deleteMany({
      where: { admin_id: { in: admins } },
    });
    await prisma.staffDailyStat.deleteMany({
      where: { admin_id: { in: admins } },
    });
    await prisma.staffQualitySignal.deleteMany({
      where: { admin_id: { in: admins } },
    });
    await prisma.staffAnomaly.deleteMany({
      where: { admin_id: { in: admins } },
    });
    for (const a of admins) await redis.del(`staff:ctr:2026-09-15:${a}`);
    await redis.del('staff:ctr-admins:2026-09-15');
    await app.close();
  });

  const api = () => request(base);

  it('rating switch off (the default): the recorder writes nothing, the API does not exist', async () => {
    setSwitches({});
    await recorder.record({
      adminId: good.userId,
      itemKind: 'verification',
      itemId: randomUUID(),
      outcome: 'approve',
    });
    const today = new Date().toISOString().slice(0, 10);
    expect(await redis.exists(`staff:ctr:${today}:${good.userId}`)).toBe(0);
    await api().get('/api/v1/admin/staff/people').set(owner.auth).expect(404);
    await api()
      .get('/api/v1/admin/staff/shortlist')
      .set(owner.auth)
      .expect(404);
    await api()
      .get('/api/v1/admin/staff/suggestions')
      .set(owner.auth)
      .expect(404);
    await expect(
      new StaffDailyStatsJob(
        settings,
        null as never,
        null as never,
        null as never,
      ).run(),
    ).resolves.toEqual({ skipped: 'off' });
  });

  it('decisions → daily stats → snapshots → suggestions, and a re-run changes nothing', async () => {
    setSwitches(ALL_ON);
    await decide(good, 40);
    await decide(poor, 40);
    await decide(newbie, 12);
    await decide(accountant, 25);
    // poor: 20 repeat tickets and 10 complaints after close
    await signals(poor, 'reopened', 20);
    await signals(poor, 'complaint', 10);

    const daily = app.get(StaffDailyStatsJob);
    const nightly = app.get(StaffRatingNightlyJob);
    const first = await daily.run(DAILY_RUN);
    expect(first).toMatchObject({ day: '2026-09-15' });
    await daily.run(DAILY_RUN);
    const stats = await prisma.staffDailyStat.findMany({
      where: { admin_id: { in: ids() }, day: new Date('2026-09-15T00:00:00Z') },
    });
    const byId = new Map(stats.map((s) => [s.admin_id, s]));
    expect(stats).toHaveLength(4); // counted once, however many runs
    expect(byId.get(good.userId)).toMatchObject({
      decided: 40,
      workspace: 'mass',
      avg_handle_sec: 40,
    });
    expect(byId.get(poor.userId)).toMatchObject({
      decided: 40,
      reopened: 20,
      complaints: 10,
    });
    expect(byId.get(accountant.userId)).toMatchObject({
      decided: 25,
      workspace: 'finance',
    });

    await nightly.run(NIGHTLY_RUN);
    const date = new Date('2026-09-16T00:00:00Z');
    const snaps = await prisma.staffRatingSnapshot.findMany({
      where: { admin_id: { in: ids() }, snapshot_date: date },
    });
    const snap = new Map(snaps.map((s) => [s.admin_id, s]));
    expect(snaps).toHaveLength(4);
    expect(snap.get(good.userId)).toMatchObject({
      rating: 100,
      status: 'ok',
      n_decisions: 40,
    });
    expect(snap.get(poor.userId)).toMatchObject({
      status: 'red',
      n_decisions: 40,
    });
    expect(snap.get(poor.userId)!.rating).toBeLessThan(60);
    expect(snap.get(poor.userId)!.flags).toContain('very_low');
    // 12 decisions < 30: «мало данных», no number, no action
    expect(snap.get(newbie.userId)).toMatchObject({
      rating: null,
      status: 'low_data',
    });
    // finance has its own minimum (20): 25 decisions is enough
    expect(snap.get(accountant.userId)).toMatchObject({
      rating: 100,
      workspace: 'finance',
    });

    const sug = await prisma.staffSuggestion.findMany({
      where: { admin_id: { in: ids() } },
    });
    const kinds = sug
      .filter((s) => s.admin_id === poor.userId)
      .map((s) => s.kind)
      .sort();
    expect(kinds).toEqual(['more_review', 'pull', 'warn']);
    // nothing is applied: warnings are open too (auto-apply is off)
    expect(sug.every((s) => s.status === 'open')).toBe(true);
    expect(sug.some((s) => s.admin_id !== poor.userId)).toBe(false);
    expect(
      await prisma.staffAction.count({ where: { admin_id: { in: ids() } } }),
    ).toBe(0);

    // the same night again: same rows
    await nightly.run(NIGHTLY_RUN);
    expect(
      await prisma.staffRatingSnapshot.count({
        where: { admin_id: { in: ids() }, snapshot_date: date },
      }),
    ).toBe(4);
    expect(
      await prisma.staffSuggestion.count({
        where: { admin_id: { in: ids() } },
      }),
    ).toBe(3);
  });

  it('owner reads the list (worst first), the short list and the suggestions', async () => {
    setSwitches(ALL_ON);
    const list = await api()
      .get('/api/v1/admin/staff/people')
      .set(owner.auth)
      .expect(200);
    const items = (
      list.body as {
        data: { snapshotDate: string; items: Array<Record<string, unknown>> };
      }
    ).data;
    expect(items.snapshotDate).toBe('2026-09-16');
    const mine = items.items.filter((i) => ids().includes(i.adminId as string));
    expect(mine.map((i) => i.adminId)[0]).toBe(poor.userId); // worst first
    expect(mine.find((i) => i.adminId === poor.userId)).toMatchObject({
      name: 'Pavel Poor',
      status: 'red',
      workspace: 'mass',
    });
    expect(
      (
        mine.find((i) => i.adminId === poor.userId)!
          .openSuggestions as unknown[]
      ).length,
    ).toBe(3);
    expect(mine.find((i) => i.adminId === newbie.userId)).toMatchObject({
      rating: null,
      status: 'low_data',
    });

    const short = await api()
      .get('/api/v1/admin/staff/shortlist')
      .set(owner.auth)
      .expect(200);
    const worst = (
      short.body as { data: { worst: Array<{ adminId: string }> } }
    ).data.worst;
    expect(worst.map((w) => w.adminId)).toContain(poor.userId);

    const sugs = await api()
      .get('/api/v1/admin/staff/suggestions?kind=pull')
      .set(owner.auth)
      .expect(200);
    const rows = (
      sugs.body as { data: { items: Array<{ adminId: string; kind: string }> } }
    ).data.items;
    expect(rows.find((r) => r.adminId === poor.userId)).toMatchObject({
      kind: 'pull',
    });

    const one = await api()
      .get(`/api/v1/admin/staff/people/${poor.userId}`)
      .set(owner.auth)
      .expect(200);
    const detail = (
      one.body as {
        data: { evidence: { worst: unknown[] }; suggestions: unknown[] };
      }
    ).data;
    expect(detail.evidence.worst).toHaveLength(3);
    expect(detail.suggestions).toHaveLength(3);
  });

  it('the owner can narrow to one workspace; a foreign workspace is empty', async () => {
    setSwitches(ALL_ON);
    const fin = await api()
      .get('/api/v1/admin/staff/people?workspace=finance')
      .set(owner.auth)
      .expect(200);
    const rows = (
      fin.body as {
        data: { items: Array<{ adminId: string; workspace: string }> };
      }
    ).data.items;
    expect(rows.every((r) => r.workspace === 'finance')).toBe(true);
    expect(rows.map((r) => r.adminId)).toContain(accountant.userId);
    expect(rows.map((r) => r.adminId)).not.toContain(poor.userId);
  });

  it('a head reads only their workspace: other workspace = 404; others = 404', async () => {
    setSwitches(ALL_ON);
    const head = {
      adminRole: 'moderator',
      workspace: 'mass',
      workspaceHead: true,
    } as const;
    const scope = ratingScope(head);
    await expect(read.person(scope, accountant.userId)).rejects.toThrow(
      NotFoundException,
    );
    await expect(read.person(scope, poor.userId)).resolves.toMatchObject({
      adminId: poor.userId,
    });
    const list = await read.people(scope, {});
    expect(list.items.map((i) => i.adminId)).toContain(poor.userId);
    expect(list.items.map((i) => i.adminId)).not.toContain(accountant.userId);
    // asking for the other workspace does not widen a head's view
    expect(
      (await read.people(ratingScope(head, 'finance'), {})).items.map(
        (i) => i.adminId,
      ),
    ).not.toContain(accountant.userId);
    const sug = await read.suggestions(scope, { status: 'open' });
    expect(sug.items.every((s) => s.workspace === 'mass')).toBe(true);
    // not a head: not found, and over HTTP an ordinary staff member gets 404 too
    expect(() =>
      ratingScope({
        adminRole: 'verifier',
        workspace: 'mass',
        workspaceHead: false,
      }),
    ).toThrow(NotFoundException);
    await api().get('/api/v1/admin/staff/people').set(good.auth).expect(404);
    await api()
      .get('/api/v1/admin/staff/shortlist')
      .set(accountant.auth)
      .expect(404);
    // a malformed id is a clean 400, not a server error
    await api()
      .get('/api/v1/admin/staff/people/not-a-uuid')
      .set(owner.auth)
      .expect(400);
  });

  it('every read costs at most three database queries', async () => {
    setSwitches(ALL_ON);
    const raw = jest.spyOn(prisma, '$queryRaw');
    const sugg = jest.spyOn(prisma.staffSuggestion, 'findMany');
    const total = () => raw.mock.calls.length + sugg.mock.calls.length;
    const scope = ratingScope({ adminRole: 'super_admin', workspace: 'owner' });
    for (const call of [
      () => read.people(scope, {}),
      () => read.person(scope, poor.userId),
      () => read.shortlist(scope),
      () => read.suggestions(scope, {}),
    ]) {
      raw.mockClear();
      sugg.mockClear();
      await call();
      expect(total()).toBeGreaterThan(0);
      expect(total()).toBeLessThanOrEqual(3);
    }
  });

  it('after-close signals are rows; the recorder swallows nothing it should not', async () => {
    setSwitches(ALL_ON);
    const item = randomUUID();
    await recorder.signal(good.userId, 'reopened', 'support_ticket', item);
    const rows = await prisma.staffQualitySignal.findMany({
      where: { admin_id: good.userId, item_id: item },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'reopened',
      item_kind: 'support_ticket',
      value: 1,
    });
    setSwitches({});
    await recorder.signal(good.userId, 'complaint', 'support_ticket', item);
    expect(
      await prisma.staffQualitySignal.count({
        where: { admin_id: good.userId, item_id: item },
      }),
    ).toBe(1);
  });
});
