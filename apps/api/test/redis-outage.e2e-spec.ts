import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RealtimePublisher } from '../src/modules/realtime/realtime-publisher.service';

/**
 * Opt-in (R-222): real behaviour when Redis dies and returns. Needs a Redis
 * container the test may stop and start:
 *   REDIS_OUTAGE_CONTAINER=lawbid-redis-1 npx jest --config test/jest-e2e.json redis-outage
 * Skipped in normal runs and CI.
 */
const container = process.env.REDIS_OUTAGE_CONTAINER;
const d = container ? describe : describe.skip;

d('Redis outage (real container)', () => {
  jest.setTimeout(240_000);
  let app: INestApplication;
  let base = '';
  const docker = (cmd: string) =>
    execSync(`docker ${cmd} ${container}`, { stdio: 'ignore' });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const api = () => request(base);
  const timed = async (name: string, run: () => Promise<number>) => {
    const t = Date.now();
    let status: number | string;
    try {
      status = await run();
    } catch (e) {
      status = e instanceof Error ? e.message.slice(0, 60) : 'error';
    }
    const ms = Date.now() - t;
    process.stdout.write(`OUTAGE ${name}: ${status} in ${ms} ms\n`);
    return { status, ms };
  };
  let seq = 0;
  const otp = (phone: string) =>
    api()
      .post('/api/v1/auth/otp/request')
      .timeout(30_000)
      .send({ channel: 'phone', identifier: phone });
  const signIn = async () => {
    seq += 1;
    const phone = `+1202555${String(7000 + seq).padStart(4, '0')}`;
    await otp(phone).expect(200);
    const res = await api()
      .post('/api/v1/auth/otp/verify')
      .send({
        channel: 'phone',
        identifier: phone,
        code: '000000',
        deviceInfo: { deviceId: 'redis-outage' },
      })
      .expect(201);
    const body = res.body as { data: { accessToken: string } };
    return { Authorization: `Bearer ${body.data.accessToken}` };
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1', {
      exclude: ['/health/live', '/health/ready', '/docs', '/docs-json'],
    });
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    docker('start');
    await app.close();
  });

  it('stays bounded while Redis is down, and recovers by itself', async () => {
    const auth = await signIn();
    const token = auth.Authorization.replace('Bearer ', '');
    const userId = (
      JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as {
        sub: string;
      }
    ).sub;
    const socket: Socket = io(`${base}/realtime`, {
      auth: { token },
      transports: ['websocket'],
    });
    const seen: string[] = [];
    socket.on('notification:new', (m: { mark: string }) => seen.push(m.mark));
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    const publisher = app.get(RealtimePublisher);
    const push = (mark: string) =>
      publisher.toUsers([userId], 'notification:new', { mark });
    /** Delivered through Redis, whichever instance holds the socket. */
    const delivered = async (mark: string) => {
      for (let i = 0; i < 40; i += 1) {
        push(mark);
        await sleep(250);
        if (seen.includes(mark)) return true;
      }
      return false;
    };
    expect(await delivered('before')).toBe(true);
    const read = (name: string, path: string, h = {}) =>
      timed(name, async () => {
        const r = await api().get(path).set(h).timeout(30_000);
        return r.status;
      });

    await read('before /health/ready', '/health/ready');
    await read('before /me/session', '/api/v1/me/session', auth);

    docker('stop');
    await sleep(1500);
    const during = [
      await read('down /health/live', '/health/live'),
      await read('down /health/ready', '/health/ready'),
      await read('down /countries (public)', '/api/v1/countries'),
      await read('down /me/session (signed in)', '/api/v1/me/session', auth),
      await read('down /config/bootstrap', '/api/v1/config/bootstrap'),
      await timed('down otp request', async () => {
        const r = await otp('+12025557999');
        return r.status;
      }),
      await timed('down presign', async () => {
        const r = await api()
          .post('/api/v1/files/presign')
          .set(auth)
          .timeout(30_000)
          .send({
            purpose: 'chat_attachment',
            mime: 'application/pdf',
            sizeBytes: 10,
            sha256: 'a'.repeat(64),
          });
        return r.status;
      }),
    ];
    // Nothing hangs: every answer comes in bounded time, none is a timeout.
    for (const x of during) {
      expect(typeof x.status).toBe('number');
      expect(x.ms).toBeLessThan(15_000);
    }
    expect(during[0].status).toBe(200);
    // Publishing while Redis is away neither throws nor brings the app down.
    expect(() => push('during')).not.toThrow();

    docker('start');
    const t = Date.now();
    let ready = 0;
    while (Date.now() - t < 60_000 && ready !== 200) {
      await sleep(500);
      ready = (await api().get('/health/ready').timeout(10_000)).status;
    }
    process.stdout.write(`OUTAGE ready again after ${Date.now() - t} ms\n`);
    expect(ready).toBe(200);

    // A live socket gets events again, with no action of its own.
    const t2 = Date.now();
    const back = await delivered('after');
    process.stdout.write(
      `OUTAGE realtime after return: ${back} in ${Date.now() - t2} ms\n`,
    );
    socket.close();
    expect(back).toBe(true);

    // Everything Redis carries works again: sign-in (OTP keys, rate limits).
    const again = await signIn();
    expect(
      (await api().get('/api/v1/me/session').set(again)).status,
    ).toBeLessThan(300);

    // A queue job runs after the return: a real upload goes through the scan.
    const data = Buffer.from(`%PDF-1.7 outage ${Date.now()}`);
    const pre = await api()
      .post('/api/v1/files/presign')
      .set(again)
      .send({
        purpose: 'chat_attachment',
        mime: 'application/pdf',
        sizeBytes: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
      })
      .expect(201);
    const p = (
      pre.body as {
        data: {
          fileId: string;
          upload: { url: string; fields: Record<string, string> };
        };
      }
    ).data;
    const form = new FormData();
    for (const [k, v] of Object.entries(p.upload.fields)) form.append(k, v);
    form.append(
      'file',
      new Blob([new Uint8Array(data)], { type: 'application/pdf' }),
    );
    expect(
      (await fetch(p.upload.url, { method: 'POST', body: form })).status,
    ).toBe(204);
    await api()
      .post(`/api/v1/files/${p.fileId}/confirm`)
      .set(again)
      .expect(200);
    let scan = 'pending';
    for (let i = 0; i < 100 && scan === 'pending'; i += 1) {
      const f = await api().get(`/api/v1/files/${p.fileId}`).set(again);
      scan = (f.body as { data: { scanStatus: string } }).data.scanStatus;
      await sleep(200);
    }
    process.stdout.write(`OUTAGE scan after return: ${scan}\n`);
    expect(scan).toBe('clean');
  });
});
