import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * 26.11 (call spam, like WhatsApp's «unanswered calls in a row» rule): a
 * person may start only so many 1:1 calls per minute / per day, and after
 * N unanswered rings in a row to the same person the next ring waits a
 * cooldown — all admin settings, 0 = off. A call back from the other
 * person starts the count over. 429 RATE_LIMITED, which the app shows as
 * «Too many attempts…».
 */
jest.setTimeout(120_000);

const KEYS = [
  'calls.start_rate_limit_per_minute',
  'calls.start_rate_limit_per_day',
  'calls.unanswered_in_row_limit',
  'calls.unanswered_cooldown_minutes',
];

describe('Call start limits (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
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
    tokens = app.get(TokenService);
    redis = app.get<Redis>(REDIS_CLIENT);
  });

  // Suites share one database and one Valkey: put the defaults back.
  afterEach(async () => {
    await prisma.appConfig.deleteMany({ where: { key: { in: KEYS } } });
    await dropAppConfigCache(redis);
  });

  afterAll(async () => {
    await app.close();
  });

  const set = async (values: Record<string, number>) => {
    for (const [key, value] of Object.entries(values)) {
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }
    await dropAppConfigCache(redis);
  };

  const api = () => request(base);
  const token = (id: string, role: 'client' | 'attorney') =>
    tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function chat(unlocked = true) {
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Cara', last_name: 'Caller' },
    });
    const attorney = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Paul', last_name: 'Phone' },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: attorney.id,
        username: `call_${attorney.id.slice(0, 8)}`,
        username_lower: `call_${attorney.id.slice(0, 8)}`,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    await prisma.subscription.create({
      data: { user_id: attorney.id, status: 'active', price_cents: 39900 },
    });
    const parent = await prisma.practiceArea.upsert({
      where: { code: 'calls_e2e' },
      create: {
        code: 'calls_e2e',
        name_en: 'Calls e2e',
        i18n_key: 'practice.calls_e2e',
        sort: 0,
      },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'calls_e2e.leaf' },
      create: {
        code: 'calls_e2e.leaf',
        parent_id: parent.id,
        name_en: 'Leaf',
        i18n_key: 'practice.calls_e2e.leaf',
        sort: 0,
      },
      update: {},
    });
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey' },
      update: {},
    });
    const kase = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'Call case',
        description: 'Details',
        practice_area_id: area.id,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    const conv = await prisma.conversation.create({
      data: {
        case_id: kase.id,
        client_id: client.id,
        attorney_id: attorney.id,
        status: unlocked ? 'active' : 'pre_acceptance',
        contacts_unlocked: unlocked,
        participants: {
          create: [{ user_id: client.id }, { user_id: attorney.id }],
        },
      },
    });
    const cTok = token(client.id, 'client');
    const aTok = token(attorney.id, 'attorney');
    return {
      id: conv.id,
      client: { id: client.id, token: cTok, auth: bearer(cTok) },
      attorney: { id: attorney.id, token: aTok, auth: bearer(aTok) },
    };
  }

  /** Rings, then the caller hangs up before an answer (canceled). */
  async function ringAndCancel(
    convId: string,
    auth: { Authorization: string },
  ) {
    const started = await api()
      .post(`/api/v1/conversations/${convId}/calls`)
      .set(auth)
      .expect(201);
    await api()
      .post(`/api/v1/calls/${started.body.data.id as string}/end`)
      .set(auth)
      .send({})
      .expect(200);
  }
  const start = (convId: string, auth: { Authorization: string }) =>
    api().post(`/api/v1/conversations/${convId}/calls`).set(auth);

  it('starts per minute: over the admin number = 429 RATE_LIMITED', async () => {
    await set({ 'calls.start_rate_limit_per_minute': 2 });
    const c = await chat();
    await ringAndCancel(c.id, c.attorney.auth);
    await ringAndCancel(c.id, c.attorney.auth);
    const blocked = await start(c.id, c.attorney.auth).expect(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.body.error.details.action).toBe('call_start');
    expect(blocked.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    // The other person has their own budget.
    await ringAndCancel(c.id, c.client.auth);
  });

  it('0 = no limit', async () => {
    await set({
      'calls.start_rate_limit_per_minute': 0,
      'calls.start_rate_limit_per_day': 0,
      'calls.unanswered_in_row_limit': 0,
    });
    const c = await chat();
    for (let i = 0; i < 4; i++) await ringAndCancel(c.id, c.attorney.auth);
  });

  it('unanswered rings in a row: the next one waits; a call back starts over', async () => {
    await set({
      'calls.unanswered_in_row_limit': 2,
      'calls.unanswered_cooldown_minutes': 60,
    });
    const c = await chat();
    await ringAndCancel(c.id, c.attorney.auth);
    await ringAndCancel(c.id, c.attorney.auth);
    const blocked = await start(c.id, c.attorney.auth).expect(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.body.error.details.action).toBe('call_unanswered');
    expect(blocked.body.error.details.retryAfterSeconds).toBeGreaterThan(
      59 * 60,
    );
    // Another pair of people is not paused.
    const other = await chat();
    await ringAndCancel(other.id, other.attorney.auth);
    // The client calls back: the attorney may ring again.
    await ringAndCancel(c.id, c.client.auth);
    await ringAndCancel(c.id, c.attorney.auth);
  });

  it('the cooldown is an admin number: 0 = no wait', async () => {
    await set({
      'calls.unanswered_in_row_limit': 2,
      'calls.unanswered_cooldown_minutes': 0,
    });
    const c = await chat();
    for (let i = 0; i < 3; i++) await ringAndCancel(c.id, c.attorney.auth);
  });
});
