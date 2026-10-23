import {
  BeforeApplicationShutdown,
  Inject,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { createAdapter, createShardedAdapter } from '@socket.io/redis-adapter';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import type { Namespace, Socket } from 'socket.io';
import { AssistantContextService } from '../auth/assistant/assistant-context';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { RealtimeStatsService } from '../../common/ops/realtime-stats.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  SESSION_REVOKED_CHANNEL,
  parseSessionRevoked,
} from '../../redis/session-revoked';
import { PresenceService } from '../presence/presence.service';
import { SessionRevocationService } from '../auth/services/session-revocation.service';
import {
  TokenService,
  type AccessTokenClaims,
} from '../auth/services/token.service';
import {
  REALTIME_NAMESPACE,
  channelRoom,
  conversationRoom,
  postRoom,
  socketAdapterMode,
  userRoom,
  viewingKey,
} from './realtime-publisher.service';
import { demoContext } from '../../common/demo/demo-context';
import { RealtimeEventLog } from './realtime-event-log';
import {
  newSocketEventBucket,
  takeSocketEvent,
  type SocketEventBucket,
} from './socket-event-bucket';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Presence entries outlive a crashed instance by at most this. */
const VIEW_TTL_SEC = 3600;
/** At most one typing event per socket per this window. */
const TYPING_MIN_GAP_MS = 1000;
/** OQ-041: one signaling payload (SDP / ICE candidate) at most. */
const SIGNAL_MAX_BYTES = 64 * 1024;
/** How often a live socket refreshes its presence (and an assistant's
 * socket re-checks its duties). Owner 2026-10-22 (server load audit,
 * finding 5): no longer the session blacklist — a revoked session's
 * sockets are dropped by the `session:revoked` message instead. */
const HEARTBEAT_MS = 45_000;
/** A person back within this long after a drop counts as a reconnect. */
const RECONNECT_WINDOW_SEC = 120;
const goneKey = (userId: string) => `rt:gone:${userId}`;

/**
 * How long a shutting-down instance waits for its clients to move away
 * (REALTIME_DRAIN_MAX_MS overrides). Production stays under the ECS
 * `stopTimeout` (60 s, infra/modules/ecs) so SIGKILL never cuts it; dev
 * restarts (`nest start --watch`) and tests do not wait.
 */
export function drainBudgetMs(env: NodeJS.ProcessEnv = process.env): number {
  const set = Number(env.REALTIME_DRAIN_MAX_MS);
  if (env.REALTIME_DRAIN_MAX_MS !== undefined && Number.isFinite(set)) {
    return Math.max(0, set);
  }
  return env.NODE_ENV === 'production' ? 35_000 : 0;
}

interface SocketState {
  user: AccessTokenClaims;
  /** OQ-048: an assistant's own id while `user.sub` is the attorney. */
  selfId?: string;
  /** Owner 2026-10-23: `auth:expiring` goes out `auth_expiring_lead`
   * before the token ends; `expiryTimer` closes the socket only after the
   * grace period (a refreshed token re-arms both). */
  expiringTimer?: NodeJS.Timeout;
  expiryTimer?: NodeJS.Timeout;
  /** `exp` of the access token the socket is running on (ms). */
  expiresAtMs?: number;
  /** Presence heartbeat and the assistant's duty re-check. */
  heartbeatTimer?: NodeJS.Timeout;
  lastTypingAt?: number;
  /** Security research #5 (2026-10-22), A5: the per-socket packet
   * budget. */
  bucket: SocketEventBucket;
  viewing: Set<string>;
  /** Owner 2026-10-01: the other members of each open chat — "typing…"
   * also reaches their chat list. */
  peers?: Map<string, string[]>;
}

const presenceRoom = (userId: string) => `presence:${userId}`;

function state(socket: Socket): SocketState {
  return socket.data as SocketState;
}

/** `exp` (ms) of an already verified JWT. */
function expiryOf(token: string): number | null {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * docs/05 §8.5 Socket.IO gateway at `/realtime`: the access token is
 * checked at the handshake (and again on `auth:refresh`; an expired token
 * disconnects the socket), each socket joins `user:{id}`, and
 * `conversation:{id}` only after a participant check. The Redis adapter
 * makes rooms span all API instances (no sticky sessions needed). Server
 * events come from RealtimePublisher; `typing` is relayed, never stored.
 */
@WebSocketGateway({
  namespace: REALTIME_NAMESPACE,
  cors: { origin: true },
  transports: ['websocket', 'polling'],
  // Owner 2026-10-15: limits so one heavy or broken client cannot hurt the
  // rest. Every socket event is small (join, typing, presence, a call's
  // SDP/ICE of a few KB); files go through the REST API, not the socket.
  maxHttpBufferSize: 64 * 1024,
  pingInterval: 25_000,
  pingTimeout: 20_000,
  connectTimeout: 10_000,
})
export class RealtimeGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    BeforeApplicationShutdown,
    OnApplicationShutdown
{
  private pub?: Redis;
  private sub?: Redis;
  /** Owner 2026-10-22: the `session:revoked` listener (a subscriber
   * connection can run nothing else). */
  private revocations?: Redis;
  private nsp?: Namespace;
  /** Security review: a revoked session (logout, "log out all", a block)
   * must stop receiving events before the access token expires — this
   * instance's sockets by session chain id (`sid`), for the
   * `session:revoked` message. */
  private readonly bySession = new Map<string, Set<Socket>>();

  constructor(
    private readonly tokens: TokenService,
    private readonly revocation: SessionRevocationService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
    private readonly assistants: AssistantContextService,
    private readonly presence: PresenceService,
    @Optional() private readonly stats?: RealtimeStatsService,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() private readonly eventLog?: RealtimeEventLog,
  ) {
    this.logger.setContext(RealtimeGateway.name);
  }

  /** Owner 2026-10-23: the lifecycle timings (app_config `realtime.server.*`),
   * refreshed every 30 s — sockets arm timers synchronously from this. */
  private timing = {
    expiringLeadMs: 120_000,
    graceMs: 120_000,
    goingAwaySpreadMs: 20_000,
  };
  private timingTimer?: NodeJS.Timeout;
  /** SIGTERM / `startDraining()`: no new sockets, going-away sent. */
  private draining = false;

  private async loadTiming(): Promise<void> {
    if (!this.settings) return;
    try {
      const [lead, grace, spread] = await Promise.all([
        this.settings.number('realtime.server.auth_expiring_lead_seconds'),
        this.settings.number('realtime.server.auth_grace_seconds'),
        this.settings.number('realtime.server.going_away_spread_ms'),
      ]);
      this.timing = {
        expiringLeadMs: lead * 1000,
        graceMs: grace * 1000,
        goingAwaySpreadMs: spread,
      };
    } catch {
      // keep the previous values
    }
  }

  get isDraining(): boolean {
    return this.draining;
  }

  /** docs/06 §8 "число активных WebSocket-соединений": a gauge line per
   * connect/disconnect on this instance (CloudWatch metric filter sums
   * the instances). */
  private gauge(): void {
    const count = this.nsp?.sockets.size ?? 0;
    this.logger.info({ metric: 'ws_connections', count }, 'ws connections');
  }

  afterInit(nsp: Namespace): void {
    this.nsp = nsp;
    void this.loadTiming();
    this.timingTimer = setInterval(() => void this.loadTiming(), 30_000);
    this.timingTimer.unref();
    // Test doubles of REDIS_CLIENT can't pub/sub: stay on the in-memory
    // adapter (a single instance) then.
    if (typeof this.redis.duplicate !== 'function') return;
    this.pub = this.redis.duplicate();
    this.sub = this.redis.duplicate();
    // Owner 2026-10-22 (server load audit, finding 5): Redis 7 sharded
    // pub/sub (infra/modules/redis: engine 7.1). An event for `user:X`
    // reaches only the instances that hold that room, instead of every
    // instance reading every event (the classic adapter).
    // SOCKET_IO_ADAPTER=classic switches back; RealtimePublisher follows
    // the same setting.
    nsp.server.adapter(
      socketAdapterMode() === 'sharded'
        ? createShardedAdapter(this.pub, this.sub, {
            subscriptionMode: 'dynamic',
          })
        : createAdapter(this.pub, this.sub),
    );
    this.revocations = this.redis.duplicate();
    this.revocations.on('message', (channel: string, raw: string) => {
      if (channel === SESSION_REVOKED_CHANNEL) this.onSessionRevoked(raw);
    });
    void this.revocations
      .subscribe(SESSION_REVOKED_CHANNEL)
      .catch((error: unknown) =>
        this.logger.warn(
          { err: error instanceof Error ? error.message : error },
          'session:revoked subscribe failed',
        ),
      );
  }

  /** Owner 2026-10-22: drops this instance's sockets of a revoked session
   * (every instance gets the message and checks its own sockets). */
  onSessionRevoked(raw: string): void {
    const msg = parseSessionRevoked(raw);
    if (!msg) return;
    const sockets = this.bySession.get(msg.sessionId);
    if (!sockets) return;
    this.bySession.delete(msg.sessionId);
    for (const socket of sockets) {
      socket.emit('auth:error', { code: 'AUTH_SESSION_REVOKED' });
      socket.disconnect(true);
    }
  }

  private index(socket: Socket, sid: string | undefined): void {
    if (!sid) return;
    let set = this.bySession.get(sid);
    if (!set) this.bySession.set(sid, (set = new Set()));
    set.add(socket);
  }

  private unindex(socket: Socket, sid: string | undefined): void {
    if (!sid) return;
    const set = this.bySession.get(sid);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) this.bySession.delete(sid);
  }

  /**
   * Owner 2026-10-23 (graceful draining): on SIGTERM — before Nest
   * disposes the socket server — every connected socket gets
   * `server:going-away {retryAfterMs}` (a random 0..spread each, so the
   * herd does not come back in one second), no new socket is accepted,
   * and the existing ones are served until they leave or the drain
   * budget ends (the ECS stop timeout is 60 s). Old apps ignore the
   * event and are dropped at the end exactly as before.
   */
  async beforeApplicationShutdown(): Promise<void> {
    await this.startDraining();
    await this.waitForDrain();
  }

  /** Marks the instance as draining and tells every socket to leave. */
  async startDraining(): Promise<number> {
    if (this.draining) return 0;
    this.draining = true;
    let sent = 0;
    for (const socket of this.nsp?.sockets?.values() ?? []) {
      this.sendGoingAway(socket);
      sent += 1;
    }
    this.logger.info({ metric: 'ws_going_away', count: sent }, 'draining');
    await this.stats?.flush();
    return sent;
  }

  private sendGoingAway(socket: Socket): void {
    const retryAfterMs = Math.floor(
      Math.random() * (this.timing.goingAwaySpreadMs + 1),
    );
    socket.emit('server:going-away', { retryAfterMs, reason: 'deploy' });
    this.stats?.record('going_away');
  }

  /** Waits (bounded) for the clients to move away on their own. */
  private async waitForDrain(): Promise<void> {
    const budget = drainBudgetMs();
    const deadline = Date.now() + budget;
    while (Date.now() < deadline && (this.nsp?.sockets.size ?? 0) > 0) {
      await new Promise((r) => setTimeout(r, 250));
    }
    await this.stats?.flush();
  }

  /** After Nest has closed the socket server (app.close() disposes it
   * before the shutdown hooks), so the adapter sends nothing more. */
  async onApplicationShutdown(): Promise<void> {
    if (this.timingTimer) clearInterval(this.timingTimer);
    await Promise.all(
      [this.pub, this.sub, this.revocations].map(async (c) => {
        try {
          await c?.quit();
        } catch {
          c?.disconnect();
        }
      }),
    );
  }

  async handleConnection(socket: Socket): Promise<void> {
    // Owner 2026-10-23: a draining instance takes no new sockets — the
    // client waits the given time and lands on a healthy instance.
    if (this.draining) {
      this.sendGoingAway(socket);
      socket.disconnect(true);
      return;
    }
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    const header = socket.handshake.headers.authorization;
    const token =
      typeof auth?.token === 'string'
        ? auth.token
        : header?.startsWith('Bearer ')
          ? header.slice(7)
          : undefined;
    const claims = token ? await this.verify(token) : null;
    if (!token || !claims) {
      socket.emit('auth:error', { code: 'UNAUTHORIZED' });
      socket.disconnect(true);
      return;
    }
    // Owner 2026-10-05 (demo mode): a demo session's socket works in the
    // demo database for its whole life — the rest of this handshake and
    // every later packet run inside the demo context (src/common/demo).
    const demo = claims.demo === true;
    // Security research #5 (2026-10-22), A5: every packet takes a token
    // from the socket's bucket; a flood (a broken or hostile client) gets
    // `RATE_LIMITED` and is disconnected — the REST API has had this per
    // user for a long time, the socket had nothing.
    socket.use((packet, next) => {
      const s = state(socket);
      if (s?.bucket && !takeSocketEvent(s.bucket)) {
        this.logger.warn(
          { userId: s.user?.sub, event: String(packet[0]) },
          'socket packet limit: disconnecting',
        );
        socket.emit('auth:error', { code: 'RATE_LIMITED' });
        socket.disconnect(true);
        return;
      }
      demoContext.run(demo, () => next());
    });
    return demoContext.run(demo, () =>
      this.finishConnection(socket, claims, token),
    );
  }

  private async finishConnection(
    socket: Socket,
    claims: AccessTokenClaims,
    token: string,
  ): Promise<void> {
    socket.data = {
      user: claims,
      viewing: new Set<string>(),
      bucket: newSocketEventBucket(),
    } as SocketState;
    // The session was checked at the handshake (verify); from now on a
    // revocation reaches this socket as a `session:revoked` message.
    this.index(socket, claims.sid);
    this.armExpiry(socket, token);
    socket.on('disconnect', (reason: string) => {
      this.stats?.recordDisconnect(reason);
      this.logger.info({ metric: 'ws_disconnect', reason }, 'ws disconnect');
    });
    state(socket).heartbeatTimer = setInterval(() => {
      // Audit 2026-10-02: an assistant removed, stripped of "chats"/"calls"
      // or whose attorney's subscription lapsed stops hearing the
      // attorney's chats — the socket reconnects as the assistant alone.
      const selfId = state(socket).selfId;
      if (selfId) {
        void this.assistants
          .resolve(selfId)
          .then((ctx) => {
            const ok =
              ctx &&
              ctx.attorneyId === state(socket).user.sub &&
              (ctx.duties.includes('chats') || ctx.duties.includes('calls'));
            if (!ok) socket.disconnect(true);
          })
          .catch(() => undefined);
      }
      // Owner 2026-10-01: presence heartbeat (own connections only).
      if (!state(socket).selfId) {
        void this.presence
          .touch(state(socket).user.sub, socket.id)
          .catch(() => undefined);
      }
    }, HEARTBEAT_MS);
    state(socket).heartbeatTimer?.unref?.();
    await socket.join(userRoom(claims.sub));
    // OQ-048: an assistant with the "chats" (or "calls") duty hears the
    // attorney's chats and calls live, acting as the attorney like REST.
    if (claims.role === 'assistant') {
      const ctx = await this.assistants.resolve(claims.sub);
      if (
        ctx &&
        (ctx.duties.includes('chats') || ctx.duties.includes('calls'))
      ) {
        state(socket).selfId = claims.sub;
        state(socket).user = { ...claims, sub: ctx.attorneyId };
        await socket.join(userRoom(ctx.attorneyId));
      }
    }
    // Owner 2026-10-01: online — an assistant's socket never makes the
    // attorney look online.
    if (claims.role !== 'assistant') {
      try {
        if (await this.presence.touch(claims.sub, socket.id)) {
          await this.announce(claims.sub, true, null);
        }
      } catch {
        // Presence is best-effort.
      }
    }
    this.gauge();
    await this.markConnected(socket, claims.sub);
  }

  /**
   * Owner 2026-10-23: counts connects and recognises a reconnect (the same
   * person dropped less than 2 minutes ago, see [markGone]) for the board,
   * then tells the client where its event cursor is (`realtime:ready`).
   */
  private async markConnected(socket: Socket, userId: string): Promise<void> {
    this.stats?.record('connect');
    try {
      if ((await this.redis.del(goneKey(userId))) > 0) {
        this.stats?.record('reconnect');
        this.logger.info({ metric: 'ws_reconnect' }, 'ws reconnect');
      }
    } catch {
      // statistics only
    }
    let seq: number | null = null;
    try {
      seq = (await this.eventLog?.currentSeq()) ?? null;
    } catch {
      // the client then simply has no cursor and refreshes fully
    }
    socket.emit('realtime:ready', {
      seq,
      serverTime: new Date().toISOString(),
      authExpiresAt: this.expiryOfSocket(socket),
    });
  }

  private async markGone(userId: string): Promise<void> {
    try {
      await this.redis.set(goneKey(userId), '1', 'EX', RECONNECT_WINDOW_SEC);
    } catch {
      // statistics only
    }
  }

  private expiryOfSocket(socket: Socket): string | null {
    const exp = state(socket)?.expiresAtMs;
    return exp ? new Date(exp).toISOString() : null;
  }

  /** Tells the watchers of [userId] (open chats with them) — only when
   * the person shows their activity status. */
  private async announce(
    userId: string,
    online: boolean,
    lastSeenAt: Date | null,
  ): Promise<void> {
    if (!this.nsp || !(await this.presence.visible(userId))) return;
    const room = presenceRoom(userId);
    const payload = {
      userId,
      online,
      lastSeenAt: lastSeenAt?.toISOString() ?? null,
    };
    // Owner 2026-10-20 (privacy review): each watcher is checked against the
    // person's *current* "last seen" audience — someone who stopped being a
    // contact (or lost the right after a setting change) is dropped from the
    // room instead of staying subscribed.
    const sockets = await this.nsp.in(room).fetchSockets();
    const allowed = new Map<string, boolean>();
    for (const s of sockets) {
      const viewer = (s.data as SocketState | undefined)?.user?.sub;
      if (!viewer) continue;
      let ok = allowed.get(viewer);
      if (ok === undefined) {
        ok = (await this.presence.snapshot(viewer, [userId])).has(userId);
        allowed.set(viewer, ok);
      }
      if (ok) s.emit('presence:update', payload);
      else s.leave(room);
    }
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const demo = (socket.data as SocketState | undefined)?.user?.demo === true;
    return demoContext.run(demo, () => this.finishDisconnect(socket));
  }

  private async finishDisconnect(socket: Socket): Promise<void> {
    this.gauge();
    const s = state(socket);
    if (!s?.user) return;
    clearTimeout(s.expiringTimer);
    clearTimeout(s.expiryTimer);
    clearInterval(s.heartbeatTimer);
    this.unindex(socket, s.user.sid);
    if (!s.selfId && s.user.role !== 'assistant') {
      void this.markGone(s.user.sub);
      try {
        if (await this.presence.leave(s.user.sub, socket.id)) {
          await this.announce(s.user.sub, false, new Date());
        }
      } catch {
        // Shutting down: the entry expires anyway.
      }
    }
    try {
      for (const id of s.viewing) {
        await this.redis.srem(viewingKey(s.user.sub, id), socket.id);
      }
    } catch {
      // Shutting down (Redis already closed): the entries expire anyway.
    }
  }

  /**
   * §8.5 "повторная проверка при обновлении токена". Owner 2026-10-23: the
   * answer to `auth:expiring` — the new access token arrives as
   * `{accessToken}` (the older apps' `{token}` works too), is verified
   * like at the handshake and moves the expiry; the socket is never
   * closed for being refreshed. A bad or revoked token still ends it.
   */
  @SubscribeMessage('auth:refresh')
  async refresh(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { accessToken?: unknown; token?: unknown },
  ): Promise<{ ok: boolean; expiresAt?: string }> {
    const raw = body?.accessToken ?? body?.token;
    const token = typeof raw === 'string' ? raw : '';
    const claims = token ? await this.verify(token) : null;
    const s = state(socket);
    if (!claims || claims.sub !== (s.selfId ?? s.user.sub)) {
      socket.emit('auth:error', { code: 'UNAUTHORIZED' });
      socket.disconnect(true);
      return { ok: false };
    }
    if (claims.sid !== s.user.sid) {
      this.unindex(socket, s.user.sid);
      this.index(socket, claims.sid);
    }
    s.user = s.selfId ? { ...claims, sub: s.user.sub } : claims;
    this.armExpiry(socket, token);
    this.stats?.record('auth_refresh');
    return {
      ok: true,
      expiresAt: s.expiresAtMs
        ? new Date(s.expiresAtMs).toISOString()
        : undefined,
    };
  }

  /**
   * Owner 2026-10-23: after a reconnect the client sends the `seq` of the
   * last event it saw and gets only what it missed (5-minute window, at
   * most 200 events). `complete: false` = something is gone — refresh
   * once, then continue from the returned `seq`. Same data as
   * `GET /realtime/missed`.
   */
  @SubscribeMessage('sync:since')
  async syncSince(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { seq?: unknown },
  ): Promise<
    | { ok: true; seq: number; events: unknown[]; complete: boolean }
    | { ok: false }
  > {
    const s = state(socket);
    const since = typeof body?.seq === 'number' ? body.seq : Number(body?.seq);
    if (!s?.user || !this.eventLog || !Number.isFinite(since)) {
      return { ok: false };
    }
    try {
      const ids = s.selfId ? [s.user.sub, s.selfId] : [s.user.sub];
      const missed = await this.eventLog.since(ids, since);
      this.stats?.record('sync');
      return { ok: true, ...missed };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage('conversation:join')
  async join(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId?: unknown },
  ): Promise<{ ok: boolean }> {
    const id = this.conversationIdOf(body);
    const uid = state(socket)?.user?.sub;
    if (!id || !uid) return { ok: false };
    const member = await this.prisma.conversationParticipant.findUnique({
      where: { conversation_id_user_id: { conversation_id: id, user_id: uid } },
      select: { user_id: true },
    });
    // Owner 2026-10-20: a group chat is "open" the same way (push
    // suppression); no peer presence is followed in a group.
    const groupMember = member
      ? null
      : await this.prisma.chatGroupMember.findFirst({
          where: { group_id: id, user_id: uid, left_at: null },
          select: { user_id: true },
        });
    if (!member && !groupMember) return { ok: false };
    await socket.join(conversationRoom(id));
    state(socket).viewing.add(id);
    const others = member
      ? await this.prisma.conversationParticipant.findMany({
          where: { conversation_id: id, user_id: { not: uid } },
          select: { user_id: true },
        })
      : [];
    (state(socket).peers ??= new Map()).set(
      id,
      others.map((o) => o.user_id),
    );
    await this.redis
      .multi()
      .sadd(viewingKey(uid, id), socket.id)
      .expire(viewingKey(uid, id), VIEW_TTL_SEC)
      .exec();
    return { ok: true };
  }

  @SubscribeMessage('conversation:leave')
  async leave(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId?: unknown },
  ): Promise<{ ok: boolean }> {
    const id = this.conversationIdOf(body);
    if (!id) return { ok: false };
    await socket.leave(conversationRoom(id));
    state(socket).viewing.delete(id);
    await this.redis.srem(viewingKey(state(socket).user.sub, id), socket.id);
    return { ok: true };
  }

  /** Owner 2026-10-22 (load audit finding 3): an open channel hears its
   * call start / change / end (`call:ongoing`, `call:ongoing_ended`) instead
   * of asking every 10 s. Only its owner / admins and subscribers. */
  @SubscribeMessage('channel:watch')
  async watchChannel(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { channelId?: unknown },
  ): Promise<{ ok: boolean }> {
    const id = typeof body?.channelId === 'string' ? body.channelId : '';
    const uid = state(socket)?.user?.sub;
    if (!uid || !UUID_RE.test(id)) return { ok: false };
    const where = { channel_id_user_id: { channel_id: id, user_id: uid } };
    const reader =
      (await this.prisma.channelAdmin.findUnique({
        where,
        select: { user_id: true },
      })) ??
      (await this.prisma.channelSubscription.findUnique({
        where,
        select: { user_id: true },
      }));
    if (!reader) return { ok: false };
    await socket.join(channelRoom(id));
    return { ok: true };
  }

  /** Owner 2026-10-22 (client economy plan, package F): an open post hears
   * its new comments (`comment:new`) instead of reloading the list. Any
   * signed-in person who can see the post (published, not deleted). */
  @SubscribeMessage('post:watch')
  async watchPost(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { postId?: unknown },
  ): Promise<{ ok: boolean }> {
    const id = typeof body?.postId === 'string' ? body.postId : '';
    const uid = state(socket)?.user?.sub;
    if (!uid || !UUID_RE.test(id)) return { ok: false };
    const post = await this.prisma.post.findFirst({
      where: { id, deleted_at: null, status: 'published' },
      select: { id: true },
    });
    if (!post) return { ok: false };
    await socket.join(postRoom(id));
    return { ok: true };
  }

  @SubscribeMessage('post:unwatch')
  async unwatchPost(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { postId?: unknown },
  ): Promise<{ ok: boolean }> {
    const id = typeof body?.postId === 'string' ? body.postId : '';
    if (!UUID_RE.test(id)) return { ok: false };
    await socket.leave(postRoom(id));
    return { ok: true };
  }

  @SubscribeMessage('channel:unwatch')
  async unwatchChannel(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { channelId?: unknown },
  ): Promise<{ ok: boolean }> {
    const id = typeof body?.channelId === 'string' ? body.channelId : '';
    if (!UUID_RE.test(id)) return { ok: false };
    await socket.leave(channelRoom(id));
    return { ok: true };
  }

  /** Owner 2026-10-01: follow a chat partner's online / last seen. Only
   * someone you share a chat with, never across a block; nothing when
   * either side hides their activity status. */
  @SubscribeMessage('presence:watch')
  async watchPresence(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { userId?: unknown },
  ): Promise<{
    ok: boolean;
    visible?: boolean;
    online?: boolean;
    lastSeenAt?: string | null;
  }> {
    const me = state(socket)?.user?.sub;
    const other = typeof body?.userId === 'string' ? body.userId : '';
    if (!me || !/^[0-9a-f-]{36}$/i.test(other) || other === me) {
      return { ok: false };
    }
    const shared = await this.prisma.conversationParticipant.findFirst({
      where: {
        user_id: me,
        conversation: { participants: { some: { user_id: other } } },
      },
      select: { conversation_id: true },
    });
    if (!shared) return { ok: false };
    const blocked = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blocker_id: me, blocked_id: other },
          { blocker_id: other, blocked_id: me },
        ],
      },
      select: { blocker_id: true },
    });
    if (blocked) return { ok: true, visible: false };
    const view = (await this.presence.snapshot(me, [other])).get(other);
    if (!view) return { ok: true, visible: false };
    await socket.join(presenceRoom(other));
    return {
      ok: true,
      visible: true,
      online: view.online,
      lastSeenAt: view.lastSeenAt?.toISOString() ?? null,
    };
  }

  @SubscribeMessage('presence:unwatch')
  async unwatchPresence(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { userId?: unknown },
  ): Promise<{ ok: boolean }> {
    const other = typeof body?.userId === 'string' ? body.userId : '';
    if (!other) return { ok: false };
    await socket.leave(presenceRoom(other));
    return { ok: true };
  }

  @SubscribeMessage('typing:start')
  typingStart(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId?: unknown; kind?: unknown },
  ): void {
    this.relayTyping(socket, body, true);
  }

  @SubscribeMessage('typing:stop')
  typingStop(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId?: unknown },
  ): void {
    this.relayTyping(socket, body, false);
  }

  /** Only inside a joined conversation; the app hides the indicator after
   * 5 s without a new `typing` (§8.5 TTL). */
  private relayTyping(
    socket: Socket,
    body: { conversationId?: unknown; kind?: unknown },
    typing: boolean,
  ): void {
    const id = this.conversationIdOf(body);
    const s = state(socket);
    if (!id || !s.viewing.has(id)) return;
    const now = Date.now();
    if (typing && s.lastTypingAt && now - s.lastTypingAt < TYPING_MIN_GAP_MS) {
      return;
    }
    if (typing) s.lastTypingAt = now;
    // The open chat and the other members' chat lists (one delivery per
    // socket even when it is in both rooms).
    const peers = s.peers?.get(id) ?? [];
    socket
      .to([conversationRoom(id), ...peers.map(userRoom)])
      // Owner 2026-10-20: `kind` tells «typing…» from «recording a voice…».
      .emit('typing', {
        conversationId: id,
        typing,
        kind: body?.kind === 'voice' ? 'voice' : 'text',
      });
  }

  /**
   * OQ-041: WebRTC signaling for an in-app call — an SDP offer/answer or
   * an ICE candidate goes to the other member of a live (ringing/active)
   * call only. Never stored; the audio itself never touches the server.
   */
  @SubscribeMessage('call:signal')
  async callSignal(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { callId?: unknown; data?: unknown; to?: unknown },
  ): Promise<{ ok: boolean }> {
    const uid = state(socket)?.user?.sub;
    const callId =
      typeof body?.callId === 'string' && UUID_RE.test(body.callId)
        ? body.callId
        : null;
    const data = body?.data;
    if (!uid || !callId || typeof data !== 'object' || data === null) {
      return { ok: false };
    }
    // SDP is a few KB; anything larger is not signaling.
    if (JSON.stringify(data).length > SIGNAL_MAX_BYTES) return { ok: false };
    const to =
      typeof body?.to === 'string' && UUID_RE.test(body.to)
        ? body.to
        : undefined;
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      select: {
        caller_id: true,
        callee_id: true,
        status: true,
        is_group: true,
        participants: {
          where: { status: 'joined' },
          select: { user_id: true },
        },
      },
    });
    if (!call || (call.status !== 'ringing' && call.status !== 'active')) {
      return { ok: false };
    }
    let targets: string[] = [];
    if (call.is_group) {
      // Group call: only joined members signal, to one named member or
      // (no `to`) to all the others.
      const joined = call.participants.map((p) => p.user_id);
      if (joined.includes(uid)) {
        const others = joined.filter((u) => u !== uid);
        targets = to ? others.filter((u) => u === to) : others;
      }
    } else if (call.caller_id === uid) {
      targets = [call.callee_id];
    } else if (call.callee_id === uid) {
      targets = [call.caller_id];
    }
    if (targets.length === 0) return { ok: false };
    for (const t of targets) {
      this.nsp
        ?.to(userRoom(t))
        .emit('call:signal', { callId, data, from: uid });
    }
    return { ok: true };
  }

  private conversationIdOf(body: { conversationId?: unknown }): string | null {
    const id = body?.conversationId;
    return typeof id === 'string' && UUID_RE.test(id) ? id : null;
  }

  private async verify(token: string): Promise<AccessTokenClaims | null> {
    try {
      const claims = this.tokens.verifyAccessToken(token);
      if (await this.revocation.isBlacklisted(claims.sid)) return null;
      return claims;
    } catch {
      return null;
    }
  }

  /**
   * Owner 2026-10-23 (Slack/Discord style): the access token ending no
   * longer cuts the socket at once. `auth:expiring` goes out
   * `expiringLeadMs` before the end (the client answers `auth:refresh`
   * with a new token); only when none arrives within the grace period
   * after the end does the socket get `auth:expired` and close — exactly
   * what apps that never send `auth:refresh` always saw, just later.
   * Revocation is separate and immediate (`session:revoked`).
   */
  private armExpiry(socket: Socket, token: string): void {
    const s = state(socket);
    clearTimeout(s.expiringTimer);
    clearTimeout(s.expiryTimer);
    const exp = expiryOf(token);
    s.expiresAtMs = exp ?? undefined;
    if (exp === null) return;
    const { expiringLeadMs, graceMs } = this.timing;
    s.expiringTimer = setTimeout(
      () => {
        socket.emit('auth:expiring', {
          expiresAt: new Date(exp).toISOString(),
          expiresInMs: Math.max(0, exp - Date.now()),
          graceMs,
        });
        this.stats?.record('auth_expiring');
      },
      Math.max(0, exp - expiringLeadMs - Date.now()),
    );
    s.expiringTimer.unref?.();
    s.expiryTimer = setTimeout(
      () => {
        this.stats?.record('auth_expired');
        socket.emit('auth:expired', {});
        socket.disconnect(true);
      },
      Math.max(0, exp + graceMs - Date.now()),
    );
    s.expiryTimer.unref?.();
  }
}
