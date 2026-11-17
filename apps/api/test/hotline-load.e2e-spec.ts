import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { TokenService } from '../src/modules/auth/services/token.service';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import { HotlineSweeper } from '../src/modules/hotline/hotline-sweeper.service';

/**
 * Owner row 87 — the hotline under load, on sockets, with numbers (plan
 * PR 4 proof without phones). Opt-in (it is a measurement, not a check):
 *
 *   HOTLINE_LOAD=1 HOTLINE_LAWYERS=200 HOTLINE_CLIENTS=1000 \
 *     npm run test:e2e -- test/hotline-load.e2e-spec.ts
 *
 * One API process on this machine, real PostgreSQL + Valkey, real
 * socket.io clients over WebSocket. Every attorney keeps a socket with the
 * hotline heartbeat and takes every offer at once («Взять» → the real 1:1
 * call row); every client asks over HTTP and waits on its socket for
 * `hotline:connected`; each call talks TALK_MS and the attorney ends it
 * (call ended, billing row, direct chat), so he gets the next waiting
 * client. Printed: join / ask / offer→connected / end latencies (p50, p95,
 * p99), calls per second, Valkey commands and API memory.
 */
const RUN = process.env.HOTLINE_LOAD === '1';
const LAWYERS = Number(process.env.HOTLINE_LAWYERS ?? 200);
const CLIENTS = Number(process.env.HOTLINE_CLIENTS ?? 1000);
const TALK_MS = Number(process.env.HOTLINE_TALK_MS ?? 200);
const CONCURRENCY = Number(process.env.HOTLINE_CONCURRENCY ?? 50);

jest.setTimeout(30 * 60_000);

const pct = (xs: number[], p: number) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(
    s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))],
  );
};
const stats = (xs: number[]) =>
  `n=${xs.length} p50=${pct(xs, 50)}ms p95=${pct(xs, 95)}ms p99=${pct(xs, 99)}ms max=${pct(xs, 100)}ms`;

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

(RUN ? describe : describe.skip)('Hotline load on sockets (opt-in)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let redis: Redis;
  let base = '';
  const sockets: Socket[] = [];
  let sweepTimer: NodeJS.Timeout | undefined;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    redis = app.get<Redis>(REDIS_CLIENT);
    await prisma.featureFlag.upsert({
      where: { key: 'hotline' },
      create: { key: 'hotline', enabled: true },
      update: { enabled: true },
    });
    await app.get(FeatureFlagsService).invalidate();
    await prisma.state.upsert({
      where: { code: 'CA' },
      create: { code: 'CA', name: 'California' },
      update: { is_active: true },
    });
    await prisma.practiceArea.upsert({
      where: { code: 'hotline_load' },
      create: {
        code: 'hotline_load',
        name_en: 'Hotline load',
        i18n_key: 'practice.hotline_load',
        sort: 0,
      },
      update: { is_active: true },
    });
    const keys = await redis.keys('hl:{hl}*');
    if (keys.length) await redis.del(...keys);
    // the sweeper as in production: every API instance ticks each second
    const sweeper = app.get(HotlineSweeper);
    sweepTimer = setInterval(() => void sweeper.tick().catch(() => 0), 1000);
  });

  afterAll(async () => {
    if (sweepTimer) clearInterval(sweepTimer);
    sockets.forEach((s) => s.disconnect());
    await app.close();
  });

  const token = (sub: string, role: 'client' | 'attorney') =>
    tokens.signAccessToken({
      sub,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });

  const http = async (
    method: string,
    path: string,
    t: string,
    body?: unknown,
  ) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: Record<string, unknown>;
    };
    if (res.status >= 400) {
      throw new Error(
        `${method} ${path} → ${res.status} ${JSON.stringify(json)}`,
      );
    }
    return json.data ?? {};
  };

  const connect = (t: string) =>
    new Promise<Socket>((resolve, reject) => {
      const s = io(`${base}/realtime`, {
        auth: { token: t },
        transports: ['websocket'],
        reconnection: false,
      });
      sockets.push(s);
      s.once('connect', () => resolve(s));
      s.once('connect_error', reject);
    });

  it(`${LAWYERS} attorneys, ${CLIENTS} clients: every client talks to exactly one attorney`, async () => {
    const run = randomUUID().slice(0, 6);
    const lawyerRows = Array.from({ length: LAWYERS }, () => ({
      id: randomUUID(),
      role: 'attorney' as const,
      first_name: 'Load',
      last_name: `Lawyer ${run}`,
    }));
    const clientRows = Array.from({ length: CLIENTS }, () => ({
      id: randomUUID(),
      role: 'client' as const,
      first_name: 'Load',
      last_name: `Client ${run}`,
      phone_verified_at: new Date(),
    }));
    await prisma.user.createMany({ data: [...lawyerRows, ...clientRows] });
    await prisma.attorneyProfile.createMany({
      data: lawyerRows.map((l) => ({
        user_id: l.id,
        username: `hl_${l.id.slice(0, 12)}`,
        username_lower: `hl_${l.id.slice(0, 12)}`,
        languages: ['en'],
        verification_status: 'verified' as const,
      })),
    });
    await prisma.attorneyLicense.createMany({
      data: lawyerRows.map((l) => ({
        attorney_id: l.id,
        state_code: 'CA',
        bar_number: `L-${l.id.slice(0, 8)}`,
        license_status: 'verified' as const,
        verified_at: new Date(),
      })),
    });

    const cmdBefore = await redis.info('stats');
    const opsBefore = Number(
      /total_commands_processed:(\d+)/.exec(cmdBefore)?.[1],
    );
    const t0 = Date.now();

    // attorneys: socket + «Ожидать звонки» + heartbeat; take every offer
    const joinMs: number[] = [];
    const offerToConnected: number[] = [];
    const endMs: number[] = [];
    const callIds = new Set<string>();
    let talks = 0;
    await pool(lawyerRows, CONCURRENCY, async (l) => {
      const t = token(l.id, 'attorney');
      const s = await connect(t);
      const a = Date.now();
      await http('PUT', '/hotline/line', t, {
        states: ['CA'],
        practiceAreas: ['hotline_load'],
        languages: ['en'],
      });
      await s.emitWithAck('hotline:heartbeat', {});
      joinMs.push(Date.now() - a);
      setInterval(
        () => void s.emitWithAck('hotline:heartbeat', {}),
        20_000,
      ).unref();
      s.on('hotline:offer', (o: { requestId: string }) => {
        void (async () => {
          const at = Date.now();
          const r = await http(
            'POST',
            `/hotline/offers/${o.requestId}/accept`,
            t,
          );
          if (r.state !== 'connected') return;
          offerToConnected.push(Date.now() - at);
          callIds.add(String(r.callId));
          await new Promise((x) => setTimeout(x, TALK_MS));
          const e = Date.now();
          await http('POST', `/hotline/calls/${o.requestId}/end`, t);
          endMs.push(Date.now() - e);
          talks += 1;
        })().catch((err: unknown) => {
          throw err;
        });
      });
    });
    const joinedAt = Date.now();

    // clients: socket, ask, wait for «connected» then for «ended»
    const askMs: number[] = [];
    const waitMs: number[] = [];
    const served = new Set<string>();
    await pool(clientRows, CONCURRENCY, async (c) => {
      const t = token(c.id, 'client');
      const s = await connect(t);
      const done = new Promise<void>((resolve) => {
        s.once('hotline:ended', () => resolve());
      });
      const connected = new Promise<void>((resolve) => {
        s.once('hotline:connected', () => resolve());
      });
      const a = Date.now();
      const r = await http('POST', '/hotline/requests', t, {
        state: 'CA',
        practiceArea: 'hotline_load',
        languages: ['en'],
        topic: 'Load test',
      });
      askMs.push(Date.now() - a);
      // a waiting client keeps its place with the heartbeat
      const beat = setInterval(
        () => void s.emitWithAck('hotline:heartbeat', {}),
        20_000,
      );
      await connected;
      waitMs.push(Date.now() - a);
      served.add(String(r.id));
      await done;
      clearInterval(beat);
      s.disconnect();
    });
    const totalMs = Date.now() - joinedAt;
    const cmdAfter = await redis.info('stats');
    const opsAfter = Number(
      /total_commands_processed:(\d+)/.exec(cmdAfter)?.[1],
    );
    const rss = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const rows = await prisma.hotlineCall.count({
      where: { attorney_id: { in: lawyerRows.map((l) => l.id) } },
    });

    const report = [
      `hotline load: ${LAWYERS} attorneys, ${CLIENTS} clients, talk ${TALK_MS} ms, concurrency ${CONCURRENCY}`,
      `attorney join (PUT line + heartbeat): ${stats(joinMs)}`,
      `client ask (POST /hotline/requests): ${stats(askMs)}`,
      `client ask → connected (queue wait incl.): ${stats(waitMs)}`,
      `«Взять» (POST accept → real call row): ${stats(offerToConnected)}`,
      `«Конец» (end → call ended + billing + chat): ${stats(endMs)}`,
      `calls: ${talks} in ${(totalMs / 1000).toFixed(1)} s = ${(talks / (totalMs / 1000)).toFixed(1)} calls/s`,
      `Valkey commands: ${opsAfter - opsBefore} (${Math.round((opsAfter - opsBefore) / Math.max(1, talks))} per call)`,
      `process RSS (API + all ${LAWYERS + CLIENTS} sockets in one Node): ${rss} MB; setup ${(joinedAt - t0) / 1000} s`,
    ].join('\n');
    // the e2e setup silences console.*; the numbers go straight out
    process.stderr.write(`\n${report}\n`);

    expect(served.size).toBe(CLIENTS);
    expect(callIds.size).toBe(CLIENTS); // one real call per client, no doubles
    expect(rows).toBe(CLIENTS);
  });
});
