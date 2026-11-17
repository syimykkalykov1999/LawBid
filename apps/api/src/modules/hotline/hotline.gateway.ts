import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { REALTIME_NAMESPACE } from '../realtime/realtime-publisher.service';
import { HotlineService } from './hotline.service';
import { hotlineCounterRoom } from './hotline-sweeper.service';

interface HotlineSocketData {
  user?: { sub?: string };
  /** This socket keeps its attorney on the line (`hotline:heartbeat`). */
  hotlineLine?: boolean;
  hotlineBeatAt?: number;
}

const data = (socket: Socket) => (socket.data ?? {}) as HotlineSocketData;
/** Faster heartbeats than this are ignored (a broken or hostile client). */
const MIN_BEAT_MS = 1000;
const MAX_WATCH = 10;

/**
 * Owner row 87: the hotline over the EXISTING socket (same `/realtime`
 * namespace, same handshake and auth as RealtimeGateway — this class only
 * adds its own events, it does not change the gateway).
 *  - `hotline:heartbeat` — the open hotline screen says «I am here» every
 *    `hotline.heartbeat_sec`; it keeps an attorney on the line, a waiting
 *    client in the queue, a connected call alive;
 *  - `hotline:away` — the app went to the background / left the section:
 *    the attorney is off the line AT ONCE (owner 16.11 ~18:20);
 *  - a closed line socket (screen off, network gone) → off at once;
 *  - `hotline:watch` / `hotline:unwatch` — the counters rooms (only sockets
 *    on the hotline screen get counters).
 */
@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
export class HotlineGateway implements OnGatewayDisconnect {
  constructor(private readonly hotline: HotlineService) {}

  @SubscribeMessage('hotline:heartbeat')
  async heartbeat(
    @ConnectedSocket() socket: Socket,
  ): Promise<{ ok: boolean; line: boolean | null }> {
    const d = data(socket);
    const sub = d.user?.sub;
    if (!sub || !(await this.hotline.enabled()))
      return { ok: false, line: null };
    const now = Date.now();
    if (d.hotlineBeatAt && now - d.hotlineBeatAt < MIN_BEAT_MS) {
      return { ok: true, line: null };
    }
    d.hotlineBeatAt = now;
    const res = await this.hotline.heartbeat(sub, socket.id);
    if (res.line !== null) d.hotlineLine = res.line;
    return { ok: true, line: res.line };
  }

  @SubscribeMessage('hotline:away')
  async away(@ConnectedSocket() socket: Socket): Promise<{ ok: boolean }> {
    const d = data(socket);
    if (!d.user?.sub) return { ok: false };
    if (d.hotlineLine) {
      d.hotlineLine = false;
      await this.hotline.goOffline(d.user.sub, 'away');
    }
    return { ok: true };
  }

  @SubscribeMessage('hotline:watch')
  async watch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { keys?: unknown },
  ): Promise<{ ok: boolean; counters: Record<string, unknown> }> {
    if (!data(socket).user?.sub || !(await this.hotline.enabled())) {
      return { ok: false, counters: {} };
    }
    const keys = (Array.isArray(body?.keys) ? body.keys : [])
      .map(String)
      .filter((x) => /^[bl]:[A-Za-z0-9_.~-]{1,200}$/.test(x))
      .slice(0, MAX_WATCH);
    if (keys.length === 0) return { ok: false, counters: {} };
    const { s } = await this.hotline.cfg();
    const until =
      Date.now() + Math.max(60, 4 * s['hotline.heartbeat_sec']) * 1000;
    const k = this.hotline.k;
    for (const key of keys) {
      await socket.join(hotlineCounterRoom(key));
      await this.hotline.redis.zadd(k.watch, until, key);
    }
    return { ok: true, counters: await this.hotline.counters(keys) };
  }

  @SubscribeMessage('hotline:unwatch')
  async unwatch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { keys?: unknown },
  ): Promise<{ ok: boolean }> {
    const keys = (Array.isArray(body?.keys) ? body.keys : []).map(String);
    for (const key of keys.slice(0, MAX_WATCH)) {
      await socket.leave(hotlineCounterRoom(key));
    }
    return { ok: true };
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const d = data(socket);
    if (d.hotlineLine && d.user?.sub) {
      await this.hotline.lineSocketClosed(d.user.sub, socket.id);
    }
  }
}
