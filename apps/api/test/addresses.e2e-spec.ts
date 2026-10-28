import { randomUUID } from 'node:crypto';
import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import {
  ADDRESS_PROVIDERS,
  type AddressProvider,
  type AddressQuery,
} from '../src/modules/addresses/address-providers';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * Owner 2026-10-28: GET /addresses/suggest through the real app (auth,
 * validation, settings, limits) with a fake provider in place of Amazon
 * Location / Google, so no key and no paid call is needed.
 */
jest.setTimeout(90_000);

describe('Address suggestions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let tokens: TokenService;
  let base = '';
  let configured = true;
  let failing = false;
  const calls: AddressQuery[] = [];

  const fake: AddressProvider = {
    name: 'aws',
    cacheable: false,
    configured: () => Promise.resolve(configured),
    suggest: (q) => {
      calls.push(q);
      if (failing) return Promise.reject(new Error('ThrottlingException'));
      return Promise.resolve([
        { label: '12 Main St, Hays, KS 67601', city: 'Hays', stateCode: 'KS' },
      ]);
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ADDRESS_PROVIDERS)
      .useValue([fake])
      .compile();
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
    redis = app.get(REDIS_CLIENT);
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await prisma.appConfig.deleteMany({
      where: { key: { startsWith: 'addresses.' } },
    });
    await dropAppConfigCache(redis);
    await app.close();
  });

  beforeEach(() => {
    configured = true;
    failing = false;
    calls.length = 0;
  });

  const api = () => request(base);
  async function auth() {
    const u = await prisma.user.create({
      data: { role: 'client', first_name: 'Ada', last_name: 'Ddress' },
    });
    return `Bearer ${tokens.signAccessToken({
      sub: u.id,
      role: 'client',
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    })}`;
  }
  const setConfig = async (key: string, value: unknown) => {
    await prisma.appConfig.upsert({
      where: { key },
      update: { value: value as never },
      create: { key, value: value as never },
    });
    await dropAppConfigCache(redis);
  };

  it('needs a sign-in', async () => {
    await api()
      .get('/api/v1/addresses/suggest')
      .query({ q: '12 main' })
      .expect(401);
  });

  it('returns US suggestions for a typed address', async () => {
    const r = await api()
      .get('/api/v1/addresses/suggest')
      .set('Authorization', await auth())
      .query({ q: '12 Main', kind: 'address', session: 'sess_abcdefgh' })
      .expect(200);
    expect(r.body.data).toEqual({
      enabled: true,
      items: [
        { label: '12 Main St, Hays, KS 67601', city: 'Hays', stateCode: 'KS' },
      ],
    });
    expect(calls[0]).toMatchObject({
      text: '12 main',
      kind: 'address',
      session: 'sess_abcdefgh',
    });
  });

  it('refuses a bad kind or session (400)', async () => {
    const a = await auth();
    await api()
      .get('/api/v1/addresses/suggest')
      .set('Authorization', a)
      .query({ q: '12 main', kind: 'planet' })
      .expect(400);
    await api()
      .get('/api/v1/addresses/suggest')
      .set('Authorization', a)
      .query({ q: '12 main', session: 'x y' })
      .expect(400);
  });

  it('switch off or no keys: enabled=false, no provider call', async () => {
    const a = await auth();
    await setConfig('addresses.autocomplete_enabled', 'off');
    const off = await api()
      .get('/api/v1/addresses/suggest')
      .set('Authorization', a)
      .query({ q: '12 main' })
      .expect(200);
    expect(off.body.data).toEqual({ enabled: false, items: [] });
    await setConfig('addresses.autocomplete_enabled', 'auto');
    configured = false;
    const noKeys = await api()
      .get('/api/v1/addresses/suggest')
      .set('Authorization', a)
      .query({ q: '12 main' })
      .expect(200);
    expect(noKeys.body.data.enabled).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('a provider error is an empty list, never a 5xx', async () => {
    failing = true;
    const r = await api()
      .get('/api/v1/addresses/suggest')
      .set('Authorization', await auth())
      .query({ q: '12 main' })
      .expect(200);
    expect(r.body.data).toEqual({ enabled: true, items: [] });
  });

  it('the per-person day cap answers 429', async () => {
    await setConfig('addresses.per_user_per_day', 1);
    const a = await auth();
    await api()
      .get('/api/v1/addresses/suggest')
      .set('Authorization', a)
      .query({ q: '12 main' })
      .expect(200);
    const r = await api()
      .get('/api/v1/addresses/suggest')
      .set('Authorization', a)
      .query({ q: '12 main st' })
      .expect(429);
    expect(r.body.error?.code ?? r.body.code).toBe('RATE_LIMITED');
    await setConfig('addresses.per_user_per_day', 300);
  });
});
