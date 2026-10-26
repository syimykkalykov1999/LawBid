import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { TokenService } from '../src/modules/auth/services/token.service';
import { CallsService } from '../src/modules/calls/calls.service';
import { StatusProbesService } from '../src/common/ops/status/status-probes.service';
import { CF_BREAKER_CLOSE_OK_PROBES } from '../src/modules/calls/cloudflare-transport';
import { totpCode } from '../src/modules/admin-auth/totp.util';
import { adminSession, type AdminSession } from './support/admin-login';

/**
 * T3 + T4 (calls audit 2026-10-26) — the owner's scenario end to end
 * through the real admin endpoints, SecretsService and GET
 * /calls/ice-servers, with Cloudflare's HTTP API mocked (the relay's
 * STUN/TURN check stubbed: no packet leaves the machine):
 *   no keys → own path;
 *   keys pasted in the admin, «Проверить», «Включить» → the NEXT call gets
 *   the Cloudflare relay first (own coturn behind it, FO-1), the
 *   «Связь для звонков» card says Cloudflare carries calls;
 *   Cloudflare dies → after the breaker limit new calls go on our own
 *   relay first, the card says so, a phone whose relay died gets ours first;
 *   Cloudflare back → after the good probes in a row (FO-6) new calls are on
 *   Cloudflare again;
 *   keys removed → own path, never a 5xx.
 */
jest.setTimeout(120_000);

const CF_KEYS = ['turn', 'sfu'].flatMap((p) =>
  [
    'fail',
    'open',
    'probe',
    'lastprobe',
    'use',
    'report',
    'relayfail',
    'verify',
    'okprobe',
  ].map((k) => `calls:cf:${k}:${p}`),
);

describe('Calls: Cloudflare primary, own path as automatic backup (e2e, T3/T4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let redis: Redis;
  let base = '';
  let admin: AdminSession;
  let cloudflare: 'up' | 'down' = 'up';
  const cfRequests: string[] = [];
  const realFetch = globalThis.fetch;
  const savedEnv = {
    TURN_URLS: process.env.TURN_URLS,
    TURN_SECRET: process.env.TURN_SECRET,
  };

  const goodCheck = () =>
    Promise.resolve({
      target: 'turn.cloudflare.com:3478',
      stun: { ok: true, ms: 5 },
      turn: { ok: true, ms: 7 },
    });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.TURN_URLS = 'turn:own-turn.example.com:3478';
    process.env.TURN_SECRET = 'e2e-own-turn-secret';
    delete process.env.CLOUDFLARE_TURN_KEY_ID;
    delete process.env.CLOUDFLARE_TURN_API_TOKEN;
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          input instanceof Request
            ? input.url
            : input instanceof URL
              ? input.href
              : String(input);
        if (!url.startsWith('https://rtc.live.cloudflare.com/')) {
          return realFetch(input, init);
        }
        cfRequests.push(url);
        if (cloudflare === 'down') {
          return Promise.resolve(
            new Response('{"error":"unavailable"}', { status: 503 }),
          );
        }
        return Promise.resolve(
          Response.json(
            {
              iceServers: [
                {
                  urls: [
                    'stun:stun.cloudflare.com:3478',
                    'turn:turn.cloudflare.com:3478?transport=udp',
                    'turns:turn.cloudflare.com:5349?transport=tcp',
                  ],
                  username: `cf-${randomUUID().slice(0, 8)}`,
                  credential: 'cf-credential',
                },
              ],
            },
            { status: 201 },
          ),
        );
      });
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
    // The relay's UDP check never leaves the machine.
    app.get(CallsService).relayCheck = goodCheck;
    app.get(StatusProbesService).relayCheck = goodCheck;
    await prisma.integrationCredential.deleteMany({
      where: { provider: { in: ['cloudflare_turn', 'cloudflare_sfu'] } },
    });
    await redis.del(...CF_KEYS);
    admin = await adminSession(base, prisma, 'super_admin');
    await api()
      .post('/api/v1/admin/auth/step-up')
      .set(admin.auth)
      .send({ code: totpCode(admin.totpSecret, Date.now() + 30_000) })
      .expect(200);
  });

  afterAll(async () => {
    await prisma.integrationCredential.deleteMany({
      where: { provider: { in: ['cloudflare_turn', 'cloudflare_sfu'] } },
    });
    await redis.del(...CF_KEYS);
    await app.close();
    jest.restoreAllMocks();
    Object.assign(process.env, savedEnv);
  });

  const api = () => request(base);

  /** A fresh person (a new call: no cached Cloudflare login). */
  async function person(): Promise<Record<string, string>> {
    const u = await prisma.user.create({
      data: { role: 'client', first_name: 'Ice', last_name: 'Caller' },
    });
    const t = tokens.signAccessToken({
      sub: u.id,
      role: 'client',
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    });
    return { Authorization: `Bearer ${t}` };
  }

  type Ice = { urls: string[]; username: string | null };
  async function ice(auth: Record<string, string>, relayFailed = false) {
    const res = await api()
      .get(`/api/v1/calls/ice-servers${relayFailed ? '?relayFailed=true' : ''}`)
      .set(auth)
      .expect(200);
    const servers = (res.body as { data: { iceServers: Ice[] } }).data
      .iceServers;
    const relays = servers.filter((s) => s.username !== null);
    const isCf = (s: Ice) => s.urls.some((u) => u.includes('cloudflare.com'));
    return {
      relays,
      firstRelayIsCloudflare: relays.length > 0 && isCf(relays[0]),
      hasCloudflare: relays.some(isCf),
      hasOwn: relays.some((s) =>
        s.urls.some((u) => u.includes('own-turn.example.com')),
      ),
    };
  }

  async function card() {
    const res = await api()
      .get('/api/v1/admin/system-health/calls-path')
      .set(admin.auth)
      .expect(200);
    return (
      res.body as {
        data: { carrying: string; breakers: { turn: string } };
      }
    ).data;
  }

  async function breakerOpen(): Promise<boolean> {
    return (await redis.exists('calls:cf:open:turn')) === 1;
  }

  it('1) no Cloudflare keys: calls go on our own relay', async () => {
    const r = await ice(await person());
    expect(r.hasCloudflare).toBe(false);
    expect(r.hasOwn).toBe(true);
    expect((await card()).carrying).toBe('own');
  });

  it('2) keys pasted in the admin, checked and switched on: the next call uses Cloudflare first', async () => {
    const saved = await api()
      .post('/api/v1/admin/integrations/cloudflare_turn/versions')
      .set(admin.auth)
      .send({
        values: {
          keyId: 'e2ecloudflarekey01',
          apiToken: 'e2e-cloudflare-api-token-0001',
        },
      })
      .expect(201);
    const version = (saved.body as { data: { version: number } }).data.version;
    // Saved = pending: nothing changes for calls yet.
    expect((await ice(await person())).hasCloudflare).toBe(false);
    const tested = await api()
      .post(
        `/api/v1/admin/integrations/cloudflare_turn/versions/${version}/test`,
      )
      .set(admin.auth)
      .send({})
      .expect(200);
    expect(
      (tested.body as { data: { lastTestOk: boolean } }).data.lastTestOk,
    ).toBe(true);
    await api()
      .post(
        `/api/v1/admin/integrations/cloudflare_turn/versions/${version}/activate`,
      )
      .set(admin.auth)
      .send({})
      .expect(200);

    const r = await ice(await person());
    expect(r.firstRelayIsCloudflare).toBe(true);
    // FO-1: our own coturn always rides behind it.
    expect(r.hasOwn).toBe(true);
    expect((await card()).carrying).toBe('cloudflare');
  });

  it('3) Cloudflare dies: the breaker opens, new calls take our own relay first', async () => {
    cloudflare = 'down';
    let opened = false;
    for (let i = 0; i < 8 && !opened; i++) {
      const r = await ice(await person());
      // Never left without a path while Cloudflare fails.
      expect(r.hasOwn).toBe(true);
      expect(r.hasCloudflare).toBe(false);
      opened = await breakerOpen();
    }
    expect(opened).toBe(true);
    const r = await ice(await person());
    expect(r.hasOwn).toBe(true);
    expect(r.firstRelayIsCloudflare).toBe(false);
    const c = await card();
    expect(c.carrying).toBe('own');
    expect(c.breakers.turn).toBe('open');
    // A phone whose relay died mid-call is answered with our own relay
    // first.
    const mid = await ice(await person(), true);
    expect(mid.relays[0].urls.some((u) => u.includes('own-turn'))).toBe(true);
  });

  it('4) Cloudflare comes back: after the good probes in a row new calls are on Cloudflare again', async () => {
    cloudflare = 'up';
    for (
      let i = 0;
      i < CF_BREAKER_CLOSE_OK_PROBES && (await breakerOpen());
      i++
    ) {
      // One probe a minute fleet-wide: the minute is over.
      await redis.del('calls:cf:probe:turn');
      const before = (await redis.get('calls:cf:lastprobe:turn')) ?? '';
      await ice(await person());
      // The probe runs in the background (a call never waits for it).
      for (let w = 0; w < 50; w++) {
        if (((await redis.get('calls:cf:lastprobe:turn')) ?? '') !== before) {
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    await new Promise((r) => setTimeout(r, 200));
    expect(await breakerOpen()).toBe(false);
    const r = await ice(await person());
    expect(r.firstRelayIsCloudflare).toBe(true);
    expect((await card()).carrying).toBe('cloudflare');
  });

  it('5) keys removed: back on our own path, never a 5xx', async () => {
    await api()
      .delete('/api/v1/admin/integrations/cloudflare_turn')
      .set(admin.auth)
      .send({ confirm: 'cloudflare_turn' })
      .expect(204);
    const r = await ice(await person());
    expect(r.hasCloudflare).toBe(false);
    expect(r.hasOwn).toBe(true);
    expect((await card()).carrying).toBe('own');
  });
});
