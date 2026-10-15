import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import { adminSession } from './support/admin-login';

/**
 * Owner 2026-10-15: events from the app, counted by day. The phone sends a
 * batch (no sign-in); the API adds up counts; the admin sees the top events
 * and screens; the flags `app_events` and `crash_reports` switch each off.
 */
jest.setTimeout(90_000);

describe('App events + kill flags (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let flags: FeatureFlagsService;
  let base = '';
  const tag = randomUUID().replace(/\D/g, '').slice(0, 6) || '1';
  const event = `ev_${tag}`;
  const screen = `/e2e/${tag}/:id`;

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
    flags = app.get(FeatureFlagsService);
  });

  afterAll(async () => {
    await prisma.featureFlag.updateMany({
      where: { key: { in: ['app_events', 'crash_reports'] } },
      data: { enabled: true },
    });
    await flags.invalidate();
    await app.close();
  });

  const api = () => request(base);
  const setFlag = async (key: string, enabled: boolean) => {
    await prisma.featureFlag.upsert({
      where: { key },
      update: { enabled },
      create: { key, enabled, description: key },
    });
    await flags.invalidate();
  };
  const rowCount = async () =>
    (
      await prisma.appEventDay.findFirst({
        where: { name: event, screen: '' },
      })
    )?.count ?? 0;

  it('a batch is added up into one row per event and screen', async () => {
    await api()
      .post('/api/v1/app-events')
      .send({
        events: [
          { name: event },
          { name: event },
          { name: 'screen_view', screen },
          { name: 'screen_view', screen },
          { name: 'screen_view', screen },
        ],
      })
      .expect(204);
    expect(await rowCount()).toBe(2);
    const views = await prisma.appEventDay.findFirst({
      where: { name: 'screen_view', screen },
    });
    expect(views?.count).toBe(3);
    // A second batch adds to the same row.
    await api()
      .post('/api/v1/app-events')
      .send({ events: [{ name: event }] })
      .expect(204);
    expect(await rowCount()).toBe(3);
  });

  it('refuses a malformed batch', async () => {
    await api()
      .post('/api/v1/app-events')
      .send({ events: [{ name: 'Bad Name!' }] })
      .expect(400);
    await api()
      .post('/api/v1/app-events')
      .send({ events: Array.from({ length: 51 }, () => ({ name: 'x' })) })
      .expect(400);
  });

  it('the admin sees the top events and screens', async () => {
    // days=45: its own cache key, so the other analytics spec is not served
    // this (5-minute) answer.
    const admin = await adminSession(base, prisma, 'super_admin');
    const res = await api()
      .get('/api/v1/admin/analytics?days=45')
      .set(admin.auth)
      .expect(200);
    const events = (
      res.body as {
        data: {
          events: {
            enabled: boolean;
            topEvents: { name: string; count: number }[];
            topScreens: { screen: string; count: number }[];
          };
        };
      }
    ).data.events;
    expect(events.enabled).toBe(true);
    expect(events.topEvents.find((e) => e.name === event)?.count).toBe(3);
    expect(events.topScreens.find((s) => s.screen === screen)?.count).toBe(3);
  });

  it('flag app_events off: the batch is accepted and dropped', async () => {
    await setFlag('app_events', false);
    await api()
      .post('/api/v1/app-events')
      .send({ events: [{ name: event }] })
      .expect(204);
    expect(await rowCount()).toBe(3);
    await setFlag('app_events', true);
  });

  it('flag crash_reports off: a crash batch is accepted and dropped', async () => {
    const fp = `kill-${tag}`;
    const body = {
      reports: [
        {
          message: `StateError: ${fp}`,
          stack: '#0 A.b (package:lawbid/a.dart:1:1)',
          platform: 'android',
          appVersion: '1.0.0',
          build: '1',
          flavor: 'prod',
          osVersion: 'Android 14',
          deviceModel: 'Pixel',
        },
      ],
    };
    await setFlag('crash_reports', false);
    await api().post('/api/v1/crash-reports').send(body).expect(204);
    expect(
      await prisma.crashReport.count({
        where: { message: { contains: fp } },
      }),
    ).toBe(0);
    await setFlag('crash_reports', true);
    await api().post('/api/v1/crash-reports').send(body).expect(204);
    expect(
      await prisma.crashReport.count({
        where: { message: { contains: fp } },
      }),
    ).toBe(1);
  });
});
