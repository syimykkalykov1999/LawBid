import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CrashReportsService } from '../src/modules/crash-reports/crash-reports.service';
import { adminSession } from './support/admin-login';

/**
 * Owner 2026-10-15: the app's own crash reports: the phone sends a batch
 * (no sign-in), the admin sees them grouped with versions, phones and how
 * many people they hit, and can mark one fixed.
 */
jest.setTimeout(90_000);

describe('Crash reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base = '';
  const tag = randomUUID().slice(0, 8);

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
    base = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const report = (version: string, line: number) => ({
    message: `StateError: Bad state ${tag}`,
    stack: `#0 CaseScreen.build (package:lawbid/case.dart:${line}:9)\n#1 Element.rebuild (framework.dart:${line + 5}:3)`,
    fatal: line % 2 === 0,
    platform: 'android',
    appVersion: version,
    build: '7',
    flavor: 'prod',
    osVersion: 'Android 14 (SDK 34)',
    deviceModel: 'Google Pixel 8',
    route: '/cases/:id',
  });

  it('the same crash from different phones is one group', async () => {
    // Different lines and versions, two phones: one fingerprint.
    await api()
      .post('/api/v1/crash-reports')
      .set('X-Device-Key', `dev-a-${tag}`)
      .send({ reports: [report('1.0.1', 10), report('1.0.1', 12)] })
      .expect(204);
    await api()
      .post('/api/v1/crash-reports')
      .set('X-Device-Key', `dev-b-${tag}`)
      .send({ reports: [report('1.0.2', 41)] })
      .expect(204);

    const admin = await adminSession(base, prisma, 'super_admin');
    const list = await api()
      .get('/api/v1/admin/crashes')
      .set(admin.auth)
      .expect(200);
    const group = (
      list.body.data as {
        fingerprint: string;
        message: string;
        count: number;
        devices: number;
        fatal: number;
        versions: string[];
      }[]
    ).find((g) => g.message.includes(tag));
    expect(group).toMatchObject({ count: 3, devices: 2, fatal: 2 });
    expect(group!.versions.sort()).toEqual(['1.0.1', '1.0.2']);

    const detail = await api()
      .get(`/api/v1/admin/crashes/${group!.fingerprint}`)
      .set(admin.auth)
      .expect(200);
    expect(detail.body.data.stack).toContain('CaseScreen.build');
    expect(detail.body.data.devices[0]).toMatchObject({
      value: 'Google Pixel 8',
      count: 3,
    });
    expect(detail.body.data.latest).toHaveLength(3);

    await api()
      .delete(`/api/v1/admin/crashes/${group!.fingerprint}`)
      .set(admin.auth)
      .expect(204);
    const after = await api()
      .get('/api/v1/admin/crashes')
      .set(admin.auth)
      .expect(200);
    expect(
      (after.body.data as { message: string }[]).some((g) =>
        g.message.includes(tag),
      ),
    ).toBe(false);
  });

  it('rejects junk, huge batches and an anonymous reader', async () => {
    await api().post('/api/v1/crash-reports').send({ reports: [] }).expect(400);
    await api()
      .post('/api/v1/crash-reports')
      .send({ reports: Array.from({ length: 11 }, () => report('1', 1)) })
      .expect(400);
    await api().get('/api/v1/admin/crashes').expect(401);
  });

  it('old reports are purged', async () => {
    await prisma.crashReport.create({
      data: {
        fingerprint: 'a'.repeat(40),
        message: `old ${tag}`,
        stack: 'x',
        platform: 'ios',
        app_version: '0.9',
        build: '1',
        flavor: 'prod',
        os_version: 'iOS 17',
        device_model: 'iPhone',
        created_at: new Date(Date.now() - 40 * 24 * 3600 * 1000),
      },
    });
    const r = await app.get(CrashReportsService).purge();
    expect(r.deleted).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.crashReport.count({ where: { message: `old ${tag}` } }),
    ).toBe(0);
  });
});
