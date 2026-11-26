import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import WebSocket from 'ws';
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import { WS_PER_MESSAGE_DEFLATE, WsCompressionGate } from './ws-compression';

/**
 * G6 (docs/dev/STAGE2_ARCH_PERF_2026-11-25.md): websocket permessage-deflate
 * behind the admin switch realtime.server.ws_compression_mode, proven on a
 * real Socket.IO server and a real `ws` client: what the socket negotiated,
 * and that a big frame really goes compressed while a small one does not.
 */
describe('WsCompressionGate (Выкл / Вкл / Авто)', () => {
  it('defaults: auto, 1 KB, 1000 compressed sockets per server', () => {
    const s = APP_SETTINGS as Record<string, unknown>;
    expect(s['realtime.server.ws_compression_mode']).toBe('auto');
    expect(s['realtime.server.ws_compression_threshold_bytes']).toBe(1024);
    expect(s['realtime.server.ws_compression_auto_max_sockets']).toBe(1000);
    expect(WS_PER_MESSAGE_DEFLATE).toEqual({
      threshold: 1024,
      zlibDeflateOptions: { level: 1 },
      concurrencyLimit: 10,
    });
  });

  it('off strips the offer, on keeps it, auto keeps it below the ceiling only', () => {
    const gate = new WsCompressionGate();
    const offer = () => ({
      headers: { 'sec-websocket-extensions': 'permessage-deflate' } as Record<
        string,
        string | undefined
      >,
    });
    const seen = (r: ReturnType<typeof offer>) =>
      'sec-websocket-extensions' in r.headers;

    gate.configure({ mode: 'off', thresholdBytes: 1024, autoMaxSockets: 10 });
    let r = offer();
    gate.onUpgrade(r);
    expect(seen(r)).toBe(false);

    gate.configure({ mode: 'on', thresholdBytes: 1024, autoMaxSockets: 0 });
    r = offer();
    gate.onUpgrade(r);
    expect(seen(r)).toBe(true);

    gate.configure({ mode: 'auto', thresholdBytes: 1024, autoMaxSockets: 0 });
    r = offer();
    gate.onUpgrade(r);
    expect(seen(r)).toBe(false);

    // A typo never turns a cost on unbounded: unreadable = auto.
    gate.configure({ mode: 'maybe', thresholdBytes: 1024, autoMaxSockets: 5 });
    expect(gate.mode).toBe('auto');
  });

  describe('on a real Socket.IO server', () => {
    let http: HttpServer;
    let io: Server;
    let gate: WsCompressionGate;
    let url: string;
    const open: WebSocket[] = [];

    beforeEach(async () => {
      http = createServer();
      io = new Server(http, {
        transports: ['websocket', 'polling'],
        perMessageDeflate: { ...WS_PER_MESSAGE_DEFLATE },
      });
      gate = new WsCompressionGate();
      expect(gate.attach(io as never)).toBe(true);
      io.on('connection', (s) => {
        s.on('big', () => s.emit('big', 'x'.repeat(8 * 1024)));
        s.on('small', () => s.emit('small', 'ok'));
      });
      await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
      const { port } = http.address() as AddressInfo;
      url = `ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`;
    });

    afterEach(async () => {
      for (const w of open.splice(0)) w.terminate();
      await new Promise<void>((r) => {
        void io.close(() => r());
      });
    });

    /** Opens a raw engine.io websocket and joins the default namespace. */
    async function connect(): Promise<{
      ws: WebSocket;
      bytesRead: () => number;
    }> {
      const ws = new WebSocket(url, { perMessageDeflate: true });
      open.push(ws);
      let sock: { bytesRead: number } | undefined;
      ws.once('upgrade', (res) => (sock = res.socket));
      await new Promise<void>((resolve, reject) => {
        ws.once('error', reject);
        ws.on('message', (data: Buffer) => {
          const text = data.toString('utf8');
          if (text.startsWith('0')) ws.send('40'); // engine open -> join "/"
          if (text.startsWith('40')) resolve();
        });
      });
      return { ws, bytesRead: () => sock?.bytesRead ?? 0 };
    }

    /** Bytes on the wire for one answer to [event]. */
    async function wireBytesOf(
      c: Awaited<ReturnType<typeof connect>>,
      event: 'big' | 'small',
    ): Promise<number> {
      const before = c.bytesRead();
      const got = new Promise<void>((resolve) =>
        c.ws.once('message', () => resolve()),
      );
      c.ws.send(`42["${event}"]`);
      await got;
      return c.bytesRead() - before;
    }

    it('on: the socket negotiates permessage-deflate and is counted', async () => {
      gate.configure({ mode: 'on', thresholdBytes: 1024, autoMaxSockets: 0 });
      const { ws } = await connect();
      expect(ws.extensions).toContain('permessage-deflate');
      expect(gate.compressed).toBe(1);
      ws.close();
      for (let i = 0; i < 100 && gate.compressed > 0; i += 1) {
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(gate.compressed).toBe(0);
    });

    it('off: no extension, frames go as they are', async () => {
      gate.configure({ mode: 'off', thresholdBytes: 1024, autoMaxSockets: 9 });
      const { ws } = await connect();
      expect(ws.extensions).toBe('');
      expect(gate.compressed).toBe(0);
    });

    it('auto: compresses up to the ceiling, the next socket stays plain', async () => {
      gate.configure({ mode: 'auto', thresholdBytes: 1024, autoMaxSockets: 1 });
      const a = await connect();
      const b = await connect();
      expect(a.ws.extensions).toContain('permessage-deflate');
      expect(b.ws.extensions).toBe('');
      expect(gate.compressed).toBe(1);
    });

    it('a big frame goes compressed, a small one as it is; off sends both plain', async () => {
      gate.configure({ mode: 'on', thresholdBytes: 1024, autoMaxSockets: 0 });
      const on = await connect();
      const small = await wireBytesOf(on, 'small');
      const big = await wireBytesOf(on, 'big');
      // 8 KB of text: deflated to a few dozen bytes on the wire.
      expect(big).toBeLessThan(500);
      expect(small).toBeLessThan(100);
      gate.configure({ mode: 'off', thresholdBytes: 1024, autoMaxSockets: 0 });
      const off = await connect();
      expect(await wireBytesOf(off, 'big')).toBeGreaterThan(8 * 1024);
    });
  });
});
