import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * Owner 2026-10-22: GET /link-preview against a local fake site. The
 * server runs with NODE_ENV=test, so local hosts are reachable here; the
 * production-mode refusals (private ranges, redirects, DNS rebinding) are
 * covered by src/modules/link-preview/safe-fetch.spec.ts.
 */
jest.setTimeout(90_000);

describe('Link preview (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let tokens: TokenService;
  let site: HttpServer;
  let siteUrl = '';
  let hits = 0;
  let base = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    site = createServer((req, res) => {
      hits++;
      if (req.url?.startsWith('/og')) {
        res.setHeader('content-type', 'text/html');
        return void res.end(
          '<html><head><meta property="og:title" content="Fake site">' +
            '<meta property="og:description" content="Hello">' +
            '<meta property="og:image" content="/a.png"></head></html>',
        );
      }
      res.statusCode = 500;
      res.end();
    });
    await new Promise<void>((r) => site.listen(0, '127.0.0.1', r));
    siteUrl = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;

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
    redis = app.get(REDIS_CLIENT);
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await prisma.appConfig.deleteMany({
      where: { key: { startsWith: 'chat.link_preview' } },
    });
    await dropAppConfigCache(redis);
    const keys = await redis.keys('lp:v1:*');
    if (keys.length) await redis.del(...keys);
    site.closeAllConnections();
    await new Promise((r) => site.close(r));
    await app.close();
  });

  const api = () => request(base);
  async function auth() {
    const u = await prisma.user.create({
      data: { role: 'client', first_name: 'Lin', last_name: 'Kpreview' },
    });
    return {
      id: u.id,
      Authorization: `Bearer ${tokens.signAccessToken({
        sub: u.id,
        role: 'client',
        sid: randomUUID(),
        verified: false,
        subscriptionStatus: 'none',
      })}`,
    };
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
      .get('/api/v1/link-preview')
      .query({ url: `${siteUrl}/og` })
      .expect(401);
  });

  it('returns the card, then serves it from the cache', async () => {
    const u = await auth();
    const url = `${siteUrl}/og?c=${randomUUID()}`;
    const before = hits;
    const a = await api()
      .get('/api/v1/link-preview')
      .set('Authorization', u.Authorization)
      .query({ url })
      .expect(200);
    expect(a.body.data).toMatchObject({
      title: 'Fake site',
      description: 'Hello',
      imageUrl: `${siteUrl}/a.png`,
    });
    await api()
      .get('/api/v1/link-preview')
      .set('Authorization', u.Authorization)
      .query({ url })
      .expect(200);
    expect(hits - before).toBe(1);
  });

  it('caches a failing site briefly (negative cache) and answers empty', async () => {
    const u = await auth();
    const url = `${siteUrl}/broken?c=${randomUUID()}`;
    const before = hits;
    for (let i = 0; i < 2; i++) {
      const r = await api()
        .get('/api/v1/link-preview')
        .set('Authorization', u.Authorization)
        .query({ url })
        .expect(200);
      expect(r.body.data.title).toBeNull();
    }
    expect(hits - before).toBe(1);
  });

  it('rejects a non-http link with 400', async () => {
    const u = await auth();
    await api()
      .get('/api/v1/link-preview')
      .set('Authorization', u.Authorization)
      .query({ url: 'javascript:alert(1)' })
      .expect(400);
  });

  it('the deny-list and the kill switch stop the fetch', async () => {
    const u = await auth();
    const before = hits;
    await setConfig('chat.link_preview_denylist', ['127.0.0.1']);
    const denied = await api()
      .get('/api/v1/link-preview')
      .set('Authorization', u.Authorization)
      .query({ url: `${siteUrl}/og?d=${randomUUID()}` })
      .expect(200);
    expect(denied.body.data.title).toBeNull();
    await setConfig('chat.link_preview_denylist', []);
    await setConfig('chat.link_preview_enabled', 'off');
    const off = await api()
      .get('/api/v1/link-preview')
      .set('Authorization', u.Authorization)
      .query({ url: `${siteUrl}/og?k=${randomUUID()}` })
      .expect(200);
    expect(off.body.data.title).toBeNull();
    expect(hits - before).toBe(0);
    await setConfig('chat.link_preview_enabled', 'auto');
  });

  it('limits one person to 30 a minute', async () => {
    const u = await auth();
    let last = 200;
    for (let i = 0; i < 32; i++) {
      const r = await api()
        .get('/api/v1/link-preview')
        .set('Authorization', u.Authorization)
        .query({ url: `${siteUrl}/og?r=${i}-${randomUUID()}` });
      last = r.status;
      if (last === 429) {
        expect(i).toBe(30);
        break;
      }
    }
    expect(last).toBe(429);
  });
});
