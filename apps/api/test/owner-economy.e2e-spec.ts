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
    flags = app.get(FeatureFlagsService);
  });

  afterAll(async () => {
    await ops.setEconomy(null);
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
    figures: { allowedUsd: number; projectedUsd: number; lines: unknown[] };
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
    // No revenue yet: the $150 floor is the allowance.
    expect(r.figures.allowedUsd).toBe(150);
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
        .send({ percent: 40, thresholdUsd: 200, ceilingMode: 'manual', manualApi: 7 })
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
        .send({ guardEnabled: true, percent: 50, thresholdUsd: 150, ceilingMode: 'auto' })
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
    const key = 'budget.sms.daily_max';
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value: 777 },
      update: { value: 777 },
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
    expect(Number(floored?.value)).toBeLessThan(777);
    expect(await ops.isEconomyLimited(Date.now() + 60_000)).toBe(true);

    const under = data(await set(50));
    expect(under.guard).toBe('ok');
    const back = await prisma.appConfig.findUnique({ where: { key } });
    expect(Number(back?.value)).toBe(777);

    await prisma.appConfig.deleteMany({ where: { key } });
    await flags.invalidate();
  });

  it('the 5-minute job answers without throwing on a bare database', async () => {
    const res = await economy.tick();
    expect(res).toHaveProperty('projectedUsd');
  });
});
