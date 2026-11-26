import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { AddressInfo, Server } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { installSocketOriginPolicy } from '../src/common/cors/socket-origin';

/**
 * ASVS 5.0 V4.4.2 (STAGE2_SECURITY #6): the real Socket.IO server refuses a
 * handshake from a foreign browser origin on every namespace (the policy is
 * the one configureApp builds for HTTP CORS), and still accepts the phone
 * apps, which send no Origin. Before this, every gateway had
 * `cors: { origin: true }` and took any Origin.
 */
describe('Socket Origin allowlist (e2e)', () => {
  let app: NestExpressApplication;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    installSocketOriginPolicy(null);
    await app.close();
  });

  /** Resolves with 'connect' or the refusal message. */
  function handshake(
    namespace: string,
    origin: string | undefined,
    transport: 'websocket' | 'polling',
  ): Promise<string> {
    const port = ((app.getHttpServer() as Server).address() as AddressInfo)
      .port;
    const s = io(`http://127.0.0.1:${port}${namespace}`, {
      auth: { qrId: 'x'.repeat(20) },
      transports: [transport],
      reconnection: false,
      timeout: 5000,
      extraHeaders: origin ? { Origin: origin } : {},
    });
    sockets.push(s);
    return new Promise((resolve) => {
      s.once('connect', () => resolve('connect'));
      s.once('connect_error', (e: Error) => resolve(`refused: ${e.message}`));
    });
  }

  it.each(['websocket', 'polling'] as const)(
    '%s: a foreign Origin is refused at the handshake',
    async (transport) => {
      for (const ns of ['/qr', '/realtime', '/admin', '/staff']) {
        expect(await handshake(ns, 'https://evil.example', transport)).toMatch(
          /^refused/,
        );
      }
    },
  );

  it('no Origin (phone app) gets through the handshake', async () => {
    // The /qr namespace needs no token: the socket connects.
    expect(await handshake('/qr', undefined, 'websocket')).toBe('connect');
  });

  it('an allowed web origin gets through (localhost outside production)', async () => {
    expect(await handshake('/qr', 'http://localhost:5173', 'websocket')).toBe(
      'connect',
    );
  });
});
