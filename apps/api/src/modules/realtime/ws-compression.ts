import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WS_PER_MESSAGE_DEFLATE } from '../../common/cors/socket-server-options';
import {
  parseSwitchMode,
  type SwitchMode,
} from '../../common/app-settings/switch-mode';

/**
 * G6 (docs/dev/STAGE2_ARCH_PERF_2026-11-25.md): permessage-deflate (RFC 7692)
 * on the Socket.IO websocket, the stock option of `ws` (MIT) that engine.io
 * passes through. Discord compresses its gateway traffic ("How Discord
 * Reduced Websocket Traffic by 40%", 09.2024); REST here is brotli / gzip
 * already, the socket was not.
 *
 * Only frames of at least `threshold` bytes are compressed (engine.io and ws
 * both skip smaller ones): typing, presence and acks stay as they are; a
 * message list, a case card or a call's SDP shrinks. Level 1 (fastest), at
 * most 10 zlib jobs at once per process (`concurrencyLimit`).
 *
 * Cost is memory: a socket that has sent one compressed frame keeps a zlib
 * stream. Measured on this Mac (ws 8.21, Node 24, 300 sockets, one 6 KB
 * event + five small ones each): about +200 KB RSS per compressed socket,
 * wire bytes 8 900 -> 716 per socket (−92 %). So the admin switch
 * `realtime.server.ws_compression_mode`:
 *   off   no socket negotiates compression;
 *   on    every new socket may;
 *   auto  (default) new sockets may while this process holds fewer than
 *         `realtime.server.ws_compression_auto_max_sockets` compressed
 *         sockets; past it new sockets stay uncompressed (nothing breaks,
 *         the browser and the app just get plain frames).
 * The choice is made per connection at the HTTP upgrade by leaving out the
 * client's `Sec-WebSocket-Extensions` offer (RFC 7692 §5: no offer, no
 * extension), so a change applies to new sockets at once and open ones keep
 * what they negotiated.
 */
// The option itself lives with the other server options: every gateway
// passes the same object, whichever one Nest connects first.
export { WS_PER_MESSAGE_DEFLATE };

export interface WsCompressionSettings {
  mode: SwitchMode;
  thresholdBytes: number;
  autoMaxSockets: number;
}

interface EngineConn {
  transport?: {
    name?: string;
    socket?: { extensions?: unknown };
    perMessageDeflate?: unknown;
  };
  on(event: 'upgrade', fn: () => void): unknown;
  once(event: 'close', fn: () => void): unknown;
}

interface EngineLike {
  opts?: { perMessageDeflate?: { threshold?: number } | false };
  on(event: 'connection', fn: (conn: EngineConn) => void): unknown;
}

const OFFER = 'sec-websocket-extensions';

export class WsCompressionGate {
  private settings: WsCompressionSettings = {
    mode: 'auto',
    thresholdBytes: WS_PER_MESSAGE_DEFLATE.threshold,
    autoMaxSockets: 1000,
  };
  private compressedNow = 0;
  private engine?: EngineLike;

  /** Compressed sockets open on this process (the gauge line shows it). */
  get compressed(): number {
    return this.compressedNow;
  }

  get mode(): SwitchMode {
    return this.settings.mode;
  }

  /** May the NEXT socket negotiate compression? */
  allowsNew(): boolean {
    switch (this.settings.mode) {
      case 'off':
        return false;
      case 'on':
        return true;
      default:
        return this.compressedNow < this.settings.autoMaxSockets;
    }
  }

  configure(raw: {
    mode: unknown;
    thresholdBytes: number;
    autoMaxSockets: number;
  }): void {
    this.settings = {
      mode: parseSwitchMode(raw.mode),
      thresholdBytes: Math.max(0, Math.floor(raw.thresholdBytes)),
      autoMaxSockets: Math.max(0, Math.floor(raw.autoMaxSockets)),
    };
    // engine.io keeps its own copy of the options and hands that object to
    // `ws` (engine.io Server.opts.perMessageDeflate): the threshold of the
    // frames it sends and of every new ws connection is read from it.
    const pmd = this.engine?.opts?.perMessageDeflate;
    if (pmd) pmd.threshold = this.settings.thresholdBytes;
  }

  /** The upgrade request, before engine.io / ws read it. */
  onUpgrade(req: Pick<IncomingMessage, 'headers'>): void {
    if (!this.allowsNew()) delete req.headers[OFFER];
  }

  /** Counts the engine.io connections whose websocket negotiated deflate
   * (a polling connection is counted when it upgrades). */
  watch(conn: EngineConn): void {
    let counted = false;
    const check = (): void => {
      if (counted) return;
      const t = conn.transport;
      if (t?.name !== 'websocket') return;
      const ext = t.socket?.extensions;
      if (typeof ext === 'string' && ext.includes('permessage-deflate')) {
        counted = true;
        this.compressedNow += 1;
      } else {
        // engine.io gives every websocket transport the server option, and
        // a transport that has it never takes Socket.IO's pre-encoded
        // broadcast frames (engine.io transports/websocket.js
        // `_canSendPreEncodedFrame`). This socket negotiated nothing: put
        // back engine.io's own value for it (null) so its broadcasts stay
        // encoded once for every receiver, as before this change.
        t.perMessageDeflate = null;
      }
    };
    check();
    conn.on('upgrade', check);
    conn.once('close', () => {
      if (counted) this.compressedNow = Math.max(0, this.compressedNow - 1);
    });
  }

  /** Hooks the Socket.IO server once: its HTTP server's `upgrade` (in front
   * of engine.io's own listener) and the engine's connections. */
  attach(io: { httpServer?: HttpServer; engine?: EngineLike }): boolean {
    if (this.engine || !io.httpServer || !io.engine) return false;
    this.engine = io.engine;
    io.httpServer.prependListener('upgrade', (req: IncomingMessage) =>
      this.onUpgrade(req),
    );
    io.engine.on('connection', (conn) => this.watch(conn));
    this.configure(this.settings);
    return true;
  }
}
