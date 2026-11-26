import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { AddressInfo, Server } from 'node:net';
import WebSocket from 'ws';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { installSocketOriginPolicy } from '../src/common/cors/socket-origin';
import { SOCKET_SERVER_OPTIONS } from '../src/common/cors/socket-server-options';

/**
 * Review of stage 2 (#1328 / #1333): the one Socket.IO server of the real
 * AppModule runs with SOCKET_SERVER_OPTIONS, whichever gateway Nest connects
 * first. Before, HotlineGateway (no options) came first and the server ran
 * on engine.io defaults: 1 MB frames (maxPayload 1000000) instead of 64 KB.
 *
 * The engine.io "open" packet carries the server's own numbers
 * (pingInterval, pingTimeout, maxPayload = maxHttpBufferSize), and a frame
 * over the limit must close the socket.
 */
describe('Socket.IO server options on the real AppModule (e2e)', () => {
  let app: NestExpressApplication;
  let base: string;
  const open: WebSocket[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    base = `ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`;
  });

  afterAll(async () => {
    for (const w of open.splice(0)) w.terminate();
    installSocketOriginPolicy(null);
    await app.close();
  });

  /** A raw engine.io websocket (no Origin: the phone apps send none). */
  function connect(): Promise<{
    ws: WebSocket;
    handshake: Record<string, unknown>;
  }> {
    const ws = new WebSocket(base, { perMessageDeflate: true });
    open.push(ws);
    return new Promise((resolve, reject) => {
      ws.once('error', reject);
      ws.once('message', (data: Buffer) => {
        const text = data.toString('utf8');
        if (!text.startsWith('0')) {
          reject(new Error(`unexpected first packet ${text.slice(0, 40)}`));
          return;
        }
        resolve({
          ws,
          handshake: JSON.parse(text.slice(1)) as Record<string, unknown>,
        });
      });
    });
  }

  it('the open packet carries the shared limits (64 KB, 25 s / 20 s)', async () => {
    const { handshake } = await connect();
    expect(handshake.maxPayload).toBe(SOCKET_SERVER_OPTIONS.maxHttpBufferSize);
    expect(handshake.maxPayload).toBe(64 * 1024);
    expect(handshake.pingInterval).toBe(25_000);
    expect(handshake.pingTimeout).toBe(20_000);
  });

  it('a frame over 64 KB closes the socket; a smaller one does not', async () => {
    // A well-formed Socket.IO CONNECT (engine "4" + socket.io "0") to a
    // namespace that does not exist: the server answers CONNECT_ERROR and
    // keeps the transport, so only the frame size decides a close.
    const join = (bytes: number) =>
      `40/none,${JSON.stringify({ pad: 'p'.repeat(bytes) })}`;
    const small = await connect();
    small.ws.send(join(32 * 1024));
    const big = await connect();
    const closed = new Promise<number>((resolve) =>
      big.ws.once('close', (code: number) => resolve(code)),
    );
    big.ws.send(join(100 * 1024));
    // ws closes with 1009 "Message Too Big" at the server's maxPayload.
    expect(await closed).toBe(1009);
    await new Promise((r) => setTimeout(r, 200));
    expect(small.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('G6: websocket compression is negotiated (admin default «Авто»)', async () => {
    // Before, HotlineGateway created the server without perMessageDeflate,
    // so no socket could ever negotiate it, whatever the admin switch said.
    const { ws } = await connect();
    expect(ws.extensions).toContain('permessage-deflate');
  });
});
