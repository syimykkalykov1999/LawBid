import { randomUUID } from 'node:crypto';
import type { AddressInfo, Server } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * Owner 2026-10-22 (guest browsing): the public reads work without a token
 * (same DTOs, viewer fields false), under a per-IP budget and a kill
 * switch; every write, and every other read, stays 401.
 */
jest.setTimeout(90_000);

describe('Guest browsing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let tokens: TokenService;
  let base = '';
  let ipN = 0;
  const tag = randomUUID().replace(/-/g, '').slice(0, 10);
  let attorneyId = '';
  let username = '';
  let postId = '';
  let channelId = '';
  let channelName = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    (app as NestExpressApplication).set('trust proxy', 1);
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

    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Gue', last_name: 'Stview' },
    });
    attorneyId = u.id;
    username = `gv${tag}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    const p = await prisma.post.create({
      data: { author_id: u.id, body: `Guest readable #gv${tag}` },
    });
    postId = p.id;
    channelName = `gvch${tag}`.slice(0, 20);
    const ch = await prisma.channel.create({
      data: { owner_id: u.id, title: 'Guest channel', username: channelName },
    });
    channelId = ch.id;
    await prisma.channelPost.create({
      data: { channel_id: ch.id, author_id: u.id, body: 'hello guests' },
    });
  });

  afterAll(async () => {
    await prisma.appConfig.deleteMany({
      where: { key: { startsWith: 'guest.' } },
    });
    await dropAppConfigCache(redis);
    const keys = await redis.keys('rl:fixed:guest*');
    if (keys.length) await redis.del(...keys);
    await app.close();
  });

  // A fresh client address per scenario keeps the per-IP budgets apart.
  const guest = (ip = `203.0.113.${(ipN++ % 250) + 1}`) => ({
    get: (url: string) =>
      request(base).get(`/api/v1${url}`).set('X-Forwarded-For', ip),
    post: (url: string) =>
      request(base).post(`/api/v1${url}`).set('X-Forwarded-For', ip),
  });
  const setConfig = async (key: string, value: unknown) => {
    await prisma.appConfig.upsert({
      where: { key },
      update: { value: value as never },
      create: { key, value: value as never },
    });
    await dropAppConfigCache(redis);
  };

  it('anonymous reads succeed with the usual DTOs', async () => {
    const g = guest();
    const feed = await g.get('/feed').expect(200);
    expect(Array.isArray(feed.body.data)).toBe(true);
    expect(
      (feed.body.data as { id: string }[]).some((p) => p.id === postId),
    ).toBe(true);
    const one = await g.get(`/posts/${postId}`).expect(200);
    expect(one.body.data.id).toBe(postId);
    expect(one.body.data.liked ?? false).toBe(false);

    const prof = await g.get(`/attorneys/${username}`).expect(200);
    expect(prof.body.data.username).toBe(username);
    expect(prof.body.data.following ?? false).toBe(false);

    await g.get(`/attorneys/${attorneyId}/posts`).expect(200);
    await g.get('/search/latest-posts').expect(200);
    await g.get('/search/posts').query({ q: 'readable' }).expect(200);
    await g.get('/search/attorneys').query({ q: 'Stview' }).expect(200);
    await g.get('/search/tags').query({ q: 'gv' }).expect(200);
    await g.get('/search/trending-tags').expect(200);
    await g.get(`/tags/gv${tag}/posts`).expect(200);

    const ch = await g.get(`/channels/${channelName}`).expect(200);
    expect(ch.body.data.id).toBe(channelId);
    const posts = await g.get(`/channels/${channelId}/posts`).expect(200);
    expect(posts.body.data).toHaveLength(1);

    const reels = await g.get('/reels');
    expect(reels.status).not.toBe(401);
  });

  it('a hidden channel is not readable without an account', async () => {
    const hidden = await prisma.channel.create({
      data: {
        owner_id: attorneyId,
        title: 'Hidden',
        username: `hd${tag}`.slice(0, 20),
        status: 'hidden',
      },
    });
    await guest().get(`/channels/${hidden.id}`).expect(404);
  });

  it('everything else stays authenticated: writes and personal reads are 401', async () => {
    const g = guest();
    await g.post('/posts').expect(401);
    await g.post(`/posts/${postId}/like`).expect(401);
    await g.post(`/channels/${channelId}/views`).expect(401);
    await g.get('/feed/preferences').expect(401);
    await g.get('/search/people').query({ q: 'abc' }).expect(401);
    await g.get('/channels').expect(401);
    await g.get('/me/archived-posts').expect(401);
    await g.get(`/posts/${postId}/likes`).expect(401);
  });

  it('a bad or expired token on a guest route is 401, not a guest', async () => {
    await guest()
      .get('/feed')
      .set('Authorization', 'Bearer not-a-token')
      .expect(401);
  });

  it('a real token still reads as that person', async () => {
    const reader = await prisma.user.create({
      data: { role: 'client', first_name: 'Rea', last_name: 'Der' },
    });
    const token = tokens.signAccessToken({
      sub: reader.id,
      role: 'client',
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    });
    await guest()
      .get(`/posts/${postId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('anonymous callers have a stricter per-IP budget', async () => {
    await setConfig('guest.rate_limit_per_minute', 3);
    const g = guest('198.51.100.77');
    await g.get('/search/trending-tags').expect(200);
    await g.get('/search/trending-tags').expect(200);
    await g.get('/search/trending-tags').expect(200);
    const over = await g.get('/search/trending-tags');
    expect(over.status).toBe(429);
    expect(over.body.error?.code ?? over.body.code).toBe('RATE_LIMITED');
    // Another address is unaffected.
    await guest('198.51.100.78').get('/search/trending-tags').expect(200);
    await setConfig('guest.rate_limit_per_minute', 40);
    const keys = await redis.keys('rl:fixed:guest*');
    if (keys.length) await redis.del(...keys);
  });

  it('the admin kill switch closes guest browsing', async () => {
    await setConfig('guest.browsing_enabled', false);
    await guest().get('/feed').expect(401);
    // One switch: the app and the website are told «no» too (dedup D-12).
    await setConfig('client.guest_browse_app_enabled', true);
    await setConfig('client.guest_browse_web_enabled', true);
    const off = await guest().get('/config/bootstrap').expect(200);
    const offCfg = (off.body.data ?? off.body).app_config;
    expect(offCfg['client.guest_browse_app_enabled']).toBe(false);
    expect(offCfg['client.guest_browse_web_enabled']).toBe(false);
    await prisma.appConfig.deleteMany({
      where: {
        key: {
          in: [
            'client.guest_browse_app_enabled',
            'client.guest_browse_web_enabled',
          ],
        },
      },
    });
    await setConfig('guest.browsing_enabled', true);
    await guest().get('/feed').expect(200);
  });

  it('bootstrap tells the app whether guest browsing is on (app off, web on by default)', async () => {
    await prisma.appConfig.deleteMany({
      where: {
        key: {
          in: [
            'client.guest_browse_app_enabled',
            'client.guest_browse_web_enabled',
          ],
        },
      },
    });
    await dropAppConfigCache(redis);
    const first = await guest().get('/config/bootstrap').expect(200);
    const cfg = (first.body.data ?? first.body).app_config;
    expect(cfg['client.guest_browse_app_enabled']).toBe(false);
    expect(cfg['client.guest_browse_web_enabled']).toBe(true);

    await setConfig('client.guest_browse_app_enabled', true);
    await setConfig('client.guest_browse_web_enabled', false);
    const second = await guest().get('/config/bootstrap').expect(200);
    const cfg2 = (second.body.data ?? second.body).app_config;
    expect(cfg2['client.guest_browse_app_enabled']).toBe(true);
    expect(cfg2['client.guest_browse_web_enabled']).toBe(false);

    await prisma.appConfig.deleteMany({
      where: {
        key: {
          in: [
            'client.guest_browse_app_enabled',
            'client.guest_browse_web_enabled',
          ],
        },
      },
    });
    await dropAppConfigCache(redis);
  });
});
