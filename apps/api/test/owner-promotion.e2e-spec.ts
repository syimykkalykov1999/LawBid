import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import type Redis from 'ioredis';
import { adminSession } from './support/admin-login';

/**
 * Owner 2026-10-27 «Продвижение»: the SEO switches and the channel
 * checklist are edited by the owner (and by an admin the owner granted the
 * `promotion` area); everybody else gets 404. The generator reads the
 * switches from the public GET /public/seo-settings (null = never decided).
 */
jest.setTimeout(120_000);

const KEYS = [
  'seo.sitemap_index_enabled',
  'seo.llms_enabled',
  'seo.ramp_per_day',
  'seo.checklist.google_search_console',
];

describe('Promotion admin page (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
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
    redis = app.get<Redis>(REDIS_CLIENT);
    await prisma.appConfig.deleteMany({ where: { key: { in: KEYS } } });
    await dropAppConfigCache(redis);
  });

  afterAll(async () => {
    await prisma.appConfig.deleteMany({ where: { key: { in: KEYS } } });
    await dropAppConfigCache(redis);
    await app.close();
  });

  const api = () => request(base);
  const data = <T>(res: request.Response) => (res.body as { data: T }).data;

  type Overview = {
    switches: { key: string; value: unknown; stored: boolean }[];
    checklist: { id: string; done: boolean }[];
    status: { manifestUrl: string };
    dryRun: { canStart: boolean; command: string };
  };
  type PublicSettings = Record<string, boolean | number | null>;

  it('is closed (404) to admins without the area, whatever their role', async () => {
    for (const role of ['moderator', 'support', 'finance'] as const) {
      const a = await adminSession(base, prisma, role);
      await api().get('/api/v1/admin/promotion').set(a.auth).expect(404);
      await api()
        .put('/api/v1/admin/promotion/settings/seo.llms_enabled')
        .set(a.auth)
        .send({ value: true })
        .expect(404);
      await api()
        .post('/api/v1/admin/promotion/dry-run')
        .set(a.auth)
        .expect(404);
    }
    await api().get('/api/v1/admin/promotion').expect(401);
  });

  it('a view-only grant reads but cannot change or start anything', async () => {
    const v = await adminSession(base, prisma, 'support', undefined, {
      promotion: 'view',
    });
    const o = data<Overview>(
      await api().get('/api/v1/admin/promotion').set(v.auth).expect(200),
    );
    expect(o.checklist.length).toBeGreaterThan(5);
    await api()
      .put('/api/v1/admin/promotion/settings/seo.llms_enabled')
      .set(v.auth)
      .send({ value: true })
      .expect(404);
    await api().post('/api/v1/admin/promotion/dry-run').set(v.auth).expect(404);
  });

  it('the owner sees everything off, flips a switch and a tick, and the generator sees it', async () => {
    const owner = await adminSession(base, prisma, 'super_admin');
    const o = data<Overview>(
      await api().get('/api/v1/admin/promotion').set(owner.auth).expect(200),
    );
    const llms = o.switches.find((s) => s.key === 'seo.llms_enabled');
    expect(llms).toMatchObject({ value: false, stored: false });
    expect(o.checklist.every((c) => !c.done)).toBe(true);
    expect(o.dryRun.command).toContain('seo-deploy.yml');
    expect(o.status.manifestUrl).toMatch(/\/seo-manifest\.json$/);

    // Never decided: the generator gets null for every switch.
    const before = data<PublicSettings>(
      await api().get('/api/v1/public/seo-settings').expect(200),
    );
    expect(Object.values(before).every((v) => v === null)).toBe(true);

    await api()
      .put('/api/v1/admin/promotion/settings/seo.sitemap_index_enabled')
      .set(owner.auth)
      .send({ value: true })
      .expect(200);
    await api()
      .put('/api/v1/admin/promotion/settings/seo.llms_enabled')
      .set(owner.auth)
      .send({ value: false })
      .expect(200);
    await api()
      .put('/api/v1/admin/promotion/settings/seo.ramp_per_day')
      .set(owner.auth)
      .send({ value: 200 })
      .expect(200);
    await api()
      .put(
        '/api/v1/admin/promotion/settings/seo.checklist.google_search_console',
      )
      .set(owner.auth)
      .send({ value: true })
      .expect(200);

    const after = data<Overview>(
      await api().get('/api/v1/admin/promotion').set(owner.auth).expect(200),
    );
    expect(
      after.switches.find((s) => s.key === 'seo.sitemap_index_enabled'),
    ).toMatchObject({ value: true, stored: true });
    expect(
      after.checklist.find((c) => c.id === 'google_search_console')?.done,
    ).toBe(true);

    const pub = await api().get('/api/v1/public/seo-settings').expect(200);
    expect(pub.headers['cache-control']).toContain('max-age=');
    expect(data<PublicSettings>(pub)).toEqual({
      incremental: null,
      sitemapIndex: true,
      robotsAi: null,
      llms: false, // an explicit OFF is reported, not null
      qualityGate: null,
      rampPerDay: 200,
    });

    // Every change left an audit row with before/after.
    const rows = await prisma.auditLog.count({
      where: { admin_id: owner.userId, action: 'config.app_config' },
    });
    expect(rows).toBeGreaterThanOrEqual(4);
  });

  it('a manage grant can write; the page refuses other keys and bad values', async () => {
    const m = await adminSession(base, prisma, 'support', undefined, {
      promotion: 'manage',
    });
    await api()
      .put('/api/v1/admin/promotion/settings/seo.llms_enabled')
      .set(m.auth)
      .send({ value: true })
      .expect(200);
    // Not a key of this page, even though it exists elsewhere.
    for (const key of ['infra.dry_run', 'seo.nope', 'guest.browsing_enabled']) {
      await api()
        .put(`/api/v1/admin/promotion/settings/${key}`)
        .set(m.auth)
        .send({ value: true })
        .expect(400);
    }
    // The key schema still validates the value.
    await api()
      .put('/api/v1/admin/promotion/settings/seo.ramp_per_day')
      .set(m.auth)
      .send({ value: -5 })
      .expect(400);
    await api()
      .put('/api/v1/admin/promotion/settings/seo.llms_enabled')
      .set(m.auth)
      .send({ value: 'yes' })
      .expect(400);
    // A manage admin is still not a settings admin.
    await api().get('/api/v1/admin/config').set(m.auth).expect(404);
  });

  it('the dry run without the GitHub App hands back the command and publishes nothing', async () => {
    const owner = await adminSession(base, prisma, 'super_admin');
    const r = data<{
      started: boolean;
      command: string;
      runsUrl: string | null;
    }>(
      await api()
        .post('/api/v1/admin/promotion/dry-run')
        .set(owner.auth)
        .expect(200),
    );
    expect(r.started).toBe(false);
    expect(r.command).toBe('gh workflow run seo-deploy.yml -f dry_run=true');
    expect(r.runsUrl).toBeNull();
  });
});
