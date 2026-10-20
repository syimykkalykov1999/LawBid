import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { EconomyService } from '../src/common/economy/economy.service';
import { OpsStateService } from '../src/common/ops/ops-state.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { totpCode } from '../src/modules/admin-auth/totp.util';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import { adminSession, type AdminSession } from './support/admin-login';

/**
 * Owner 2026-10-16 «Экономика»: the card endpoints (super admin only), the
 * rule edited in the admin, the rollback flag, one-click tier raise (off
 * AWS it answers 409), and the guard cycle on a real database: spend above
 * the rule floors the provider caps, below it they come back.
 */
jest.setTimeout(120_000);

describe('Economy (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let economy: EconomyService;
  let ops: OpsStateService;
  let flags: FeatureFlagsService;
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
    economy = app.get(EconomyService);
    ops = app.get(OpsStateService);
    // The guard state is one Redis key shared by every e2e shard: while this
    // suite holds the guard «on», another shard's phone-change OTP would
    // answer 503. Keep the state in memory for this process only.
    let held: Awaited<ReturnType<OpsStateService['economy']>> = null;
    jest.spyOn(ops, 'economy').mockImplementation(() => Promise.resolve(held));
    jest.spyOn(ops, 'setEconomy').mockImplementation((state) => {
      held = state;
      (ops as unknown as { economyCache?: unknown }).economyCache = undefined;
      return Promise.resolve();
    });
    flags = app.get(FeatureFlagsService);
    // The catalog row is created on boot outside the test environment.
    await prisma.featureFlag.upsert({
      where: { key: 'economy_guard' },
      update: { enabled: true },
      create: {
        key: 'economy_guard',
        enabled: true,
        rollout_percent: 100,
        description: 'e2e',
      },
    });
    await flags.invalidate();
  });

  afterAll(async () => {
    await ops.setEconomy(null);
    // Back to the suites' default (global setup): the guard off, so no
    // later suite's worker can limit SMS (503) on an empty test database.
    await prisma.featureFlag.updateMany({
      where: { key: 'economy_guard' },
      data: { enabled: false },
    });
    await app.close();
  });

  const api = () => request(base);

  async function stepUp(a: AdminSession) {
    await api()
      .post('/api/v1/admin/auth/step-up')
      .set(a.auth)
      .send({ code: totpCode(a.totpSecret, Date.now() + 30_000) })
      .expect(200);
  }

  type Report = {
    enabled: boolean;
    guard: 'ok' | 'limited';
    figures: {
      allowedUsd: number;
      revenue30dUsd: number;
      projectedUsd: number;
      lines: unknown[];
    };
    settings: { percent: number; thresholdUsd: number; ceilingMode: string };
    containers: { onAws: boolean };
    capacity: { onAws: boolean; dbTiers: unknown[] };
  };
  const data = (res: request.Response) => (res.body as { data: Report }).data;

  it('the card is for the super admin only', async () => {
    const mod = await adminSession(base, prisma, 'moderator');
    await api().get('/api/v1/admin/economy').set(mod.auth).expect(404);
    const admin = await adminSession(base, prisma, 'super_admin');
    const r = data(
      await api().get('/api/v1/admin/economy').set(admin.auth).expect(200),
    );
    expect(r.enabled).toBe(true);
    expect(r.guard).toBe('ok');
    expect(r.settings).toMatchObject({
      percent: 50,
      thresholdUsd: 150,
      ceilingMode: 'auto',
    });
    // Other suites share this database and may have paid rows, so the
    // allowance is the larger of the $150 floor and 50% of what is earned.
    expect(r.figures.allowedUsd).toBeCloseTo(
      Math.max(150, r.figures.revenue30dUsd * 0.5),
      1,
    );
    expect(r.figures.lines).toHaveLength(4);
    expect(r.containers.onAws).toBe(false);
    expect(r.capacity.dbTiers.length).toBeGreaterThan(0);
  });

  it('saves the rule, refuses nonsense, switches the flag off and on', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    await api()
      .patch('/api/v1/admin/economy/settings')
      .set(admin.auth)
      .send({ percent: 0 })
      .expect(400);
    await api()
      .patch('/api/v1/admin/economy/settings')
      .set(admin.auth)
      .send({ ceilingMode: 'sideways' })
      .expect(400);
    const saved = data(
      await api()
        .patch('/api/v1/admin/economy/settings')
        .set(admin.auth)
        .send({
          percent: 40,
          thresholdUsd: 200,
          ceilingMode: 'manual',
          manualApi: 7,
        })
        .expect(200),
    );
    expect(saved.settings).toMatchObject({
      percent: 40,
      thresholdUsd: 200,
      ceilingMode: 'manual',
      manualApi: 7,
    });
    const off = data(
      await api()
        .patch('/api/v1/admin/economy/settings')
        .set(admin.auth)
        .send({ guardEnabled: false })
        .expect(200),
    );
    expect(off.enabled).toBe(false);
    const on = data(
      await api()
        .patch('/api/v1/admin/economy/settings')
        .set(admin.auth)
        .send({
          guardEnabled: true,
          percent: 50,
          thresholdUsd: 150,
          ceilingMode: 'auto',
        })
        .expect(200),
    );
    expect(on.enabled).toBe(true);
    // Both changes are in the audit log.
    const audited = await prisma.auditLog.findMany({
      where: { action: { in: ['economy.settings'] } },
    });
    expect(audited.length).toBeGreaterThanOrEqual(2);
  });

  it('«увеличить» needs a fresh 2FA code and works only on AWS', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    await api()
      .post('/api/v1/admin/economy/increase')
      .set(admin.auth)
      .send({ target: 'db' })
      .expect(403);
    await stepUp(admin);
    const res = await api()
      .post('/api/v1/admin/economy/increase')
      .set(admin.auth)
      .send({ target: 'db' })
      .expect(409);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'FEATURE_DISABLED',
    );
    await api()
      .post('/api/v1/admin/economy/increase')
      .set(admin.auth)
      .send({ target: 'cpu' })
      .expect(400);
  });

  it('guard cycle: over the rule floors the caps, back under restores them', async () => {
    const admin = await adminSession(base, prisma, 'super_admin');
    // The suite lifts the SMS caps to 1 000 000 (e2e-setup-env), which is
    // the floor of the automatic cap; a cap above it is what the guard cuts.
    const key = 'budget.sms.daily_max';
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value: 5_000_000 },
      update: { value: 5_000_000 },
    });
    const set = (usd: number) =>
      api()
        .patch('/api/v1/admin/economy/settings')
        .set(admin.auth)
        .send({ awsFallbackUsd: usd })
        .expect(200);

    // No AWS budget off AWS → the fallback amount stands for the AWS bill.
    const over = data(await set(400));
    expect(over.guard).toBe('limited');
    const floored = await prisma.appConfig.findUnique({ where: { key } });
    expect(Number(floored?.value)).toBe(1_000_000);
    expect(await ops.isEconomyLimited(Date.now() + 60_000)).toBe(true);

    const under = data(await set(50));
    expect(under.guard).toBe('ok');
    const back = await prisma.appConfig.findUnique({ where: { key } });
    expect(Number(back?.value)).toBe(5_000_000);

    await prisma.appConfig.deleteMany({ where: { key } });
    await flags.invalidate();
  });

  it('the 5-minute job answers without throwing on a bare database', async () => {
    const res = await economy.tick();
    expect(res).toHaveProperty('projectedUsd');
  });
});
