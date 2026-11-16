import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AddressInfo, Server } from 'node:net';
import request from 'supertest';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { useBodyParsers } from '../src/app.setup';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { adminSession, type AdminSession } from './support/admin-login';

/**
 * Owner list row 179 (detective R3A-6, B5): two admins (or the owner's phone
 * and laptop) save the same setting at the same moment from the same old
 * screen. Exactly one save wins; the other gets 409 STALE_VERSION with the
 * fresh row (`details.current`), so the admin shows the winner's value and
 * the owner can save again on top of it. Real Postgres, real serializable
 * transaction, two HTTP writers in parallel (RFC 9110 §13.1.1 If-Match).
 */
jest.setTimeout(120_000);

type Entry = { key: string; value: unknown; updatedAt: string | null };
type Flag = { key: string; enabled: boolean; paid: boolean; updatedAt: string };

const CONFIG_KEY = 'feed.reco_scan_max';

describe('admin settings: two writers, no lost update (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let base = '';
  let a: AdminSession;
  let b: AdminSession;
  let flagKey = '';
  let flagWas = false;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    useBodyParsers(app as never, '256kb');
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
    redis = app.get(REDIS_CLIENT);
    await prisma.appConfig.deleteMany({ where: { key: CONFIG_KEY } });
    await dropAppConfigCache(redis);
    a = await adminSession(base, prisma, 'super_admin');
    b = await adminSession(base, prisma, 'super_admin');
  });

  afterAll(async () => {
    await prisma.appConfig.deleteMany({ where: { key: CONFIG_KEY } });
    if (flagKey) {
      await prisma.featureFlag.update({
        where: { key: flagKey },
        data: { enabled: flagWas },
      });
    }
    await dropAppConfigCache(redis);
    await app.close();
  });

  const readEntry = async (s: AdminSession): Promise<Entry> => {
    const res = await request(base)
      .get('/api/v1/admin/config')
      .set(s.auth)
      .expect(200);
    const rows = (res.body as { data: Entry[] }).data;
    return rows.find((e) => e.key === CONFIG_KEY)!;
  };

  const putConfig = (s: AdminSession, value: number, seen: string | null) =>
    request(base)
      .put(`/api/v1/admin/config/${CONFIG_KEY}`)
      .set(s.auth)
      .send({ value, expectedUpdatedAt: seen });

  it('config: both tabs saw the same row → one 200, one 409 with the fresh value', async () => {
    // First save from the default (no row yet), then both tabs read it.
    const first = await putConfig(a, 950, null);
    expect(first.status).toBe(200);
    const seenA = await readEntry(a);
    const seenB = await readEntry(b);
    expect(seenA.updatedAt).toBe(seenB.updatedAt);

    const [ra, rb] = await Promise.all([
      putConfig(a, 900, seenA.updatedAt),
      putConfig(b, 800, seenB.updatedAt),
    ]);
    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual([200, 409]);
    const winner = ra.status === 200 ? ra : rb;
    const loser = ra.status === 200 ? rb : ra;
    const won = (winner.body as { data: Entry }).data;
    const err = (
      loser.body as {
        error: {
          code: string;
          details: { currentUpdatedAt: string; current: Entry };
        };
      }
    ).error;
    expect(err.code).toBe('STALE_VERSION');
    // The refusal carries what is in the database now: the winner's save.
    expect(err.details.current.value).toBe(won.value);
    expect(err.details.current.updatedAt).toBe(won.updatedAt);
    expect(err.details.currentUpdatedAt).toBe(won.updatedAt);

    const row = await prisma.appConfig.findUnique({
      where: { key: CONFIG_KEY },
    });
    expect(row?.value).toBe(won.value);

    // The loser saves again on top of the fresh value → accepted.
    const loserSession = ra.status === 200 ? b : a;
    const again = await putConfig(
      loserSession,
      700,
      err.details.current.updatedAt,
    );
    expect(again.status).toBe(200);
    expect((again.body as { data: Entry }).data.value).toBe(700);
  });

  it('config: two first saves over the default (no row yet) → one wins', async () => {
    await prisma.appConfig.deleteMany({ where: { key: CONFIG_KEY } });
    await dropAppConfigCache(redis);
    const [ra, rb] = await Promise.all([
      putConfig(a, 600, null),
      putConfig(b, 500, null),
    ]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    const loser = ra.status === 200 ? rb : ra;
    const winner = ra.status === 200 ? ra : rb;
    expect(
      (loser.body as { error: { details: { current: Entry } } }).error.details
        .current.value,
    ).toBe((winner.body as { data: Entry }).data.value);
  });

  it('flags: both tabs saw the same switch → one 200, one 409 with the fresh switch', async () => {
    const list = await request(base)
      .get('/api/v1/admin/feature-flags')
      .set(a.auth)
      .expect(200);
    // A free switch that is on: switching it off never needs provider keys.
    const flag = (list.body as { data: Flag[] }).data.find(
      (f) => !f.paid && f.enabled,
    )!;
    expect(flag).toBeDefined();
    flagKey = flag.key;
    flagWas = flag.enabled;

    const patch = (s: AdminSession, enabled: boolean) =>
      request(base)
        .patch(`/api/v1/admin/feature-flags/${flag.key}`)
        .set(s.auth)
        .send({ enabled, expectedUpdatedAt: flag.updatedAt });
    const [ra, rb] = await Promise.all([patch(a, false), patch(b, false)]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    const winner = ra.status === 200 ? ra : rb;
    const loser = ra.status === 200 ? rb : ra;
    const err = (
      loser.body as {
        error: { code: string; details: { current: Flag } };
      }
    ).error;
    expect(err.code).toBe('STALE_VERSION');
    expect(err.details.current.enabled).toBe(false);
    expect(err.details.current.updatedAt).toBe(
      (winner.body as { data: Flag }).data.updatedAt,
    );
  });
});
