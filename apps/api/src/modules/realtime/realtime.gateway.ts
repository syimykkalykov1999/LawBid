import { Inject, OnApplicationShutdown } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import type { Namespace, Socket } from 'socket.io';
import { AssistantContextService } from '../auth/assistant/assistant-context';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { PresenceService } from '../presence/presence.service';
import { SessionRevocationService } from '../auth/services/session-revocation.service';
import {
  TokenService,
  type AccessTokenClaims,
} from '../auth/services/token.service';
import {
  REALTIME_NAMESPACE,
  conversationRoom,
  userRoom,
  viewingKey,
} from './realtime-publisher.service';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Presence entries outlive a crashed instance by at most this. */
const VIEW_TTL_SEC = 3600;
/** At most one typing event per socket per this window. */
const TYPING_MIN_GAP_MS = 1000;
/** OQ-041: one signaling payload (SDP / ICE candidate) at most. */
const SIGNAL_MAX_BYTES = 64 * 1024;
/** How often a live socket re-checks the session blacklist. */
const REVOCATION_CHECK_MS = 45_000;

interface SocketState {
  user: AccessTokenClaims;
  /** OQ-048: an assistant's own id while `user.sub` is the attorney. */
  selfId?: string;
  expiryTimer?: NodeJS.Timeout;
  /** Security review: a revoked session (logout, "log out all") must
   * stop receiving events before the access token expires. */
  revocationTimer?: NodeJS.Timeout;
  lastTypingAt?: number;
  viewing: Set<string>;
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
})
export class RealtimeGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnApplicationShutdown
{
  private pub?: Redis;
  private sub?: Redis;
  private nsp?: Namespace;

  constructor(
    private readonly tokens: TokenService,
    private readonly revocation: SessionRevocationService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
    private readonly assistants: AssistantContextService,
    private readonly presence: PresenceService,
  ) {
    this.logger.setContext(RealtimeGateway.name);
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
    // Test doubles of REDIS_CLIENT can't pub/sub: stay on the in-memory
    // adapter (a single instance) then.
    if (typeof this.redis.duplicate !== 'function') return;
    this.pub = this.redis.duplicate();
    this.sub = this.redis.duplicate();
    nsp.server.adapter(createAdapter(this.pub, this.sub));
  }

  /** After Nest has closed the socket server (app.close() disposes it
   * before the shutdown hooks), so the adapter sends nothing more. */
  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      [this.pub, this.sub].map(async (c) => {
        try {
          await c?.quit();
        } catch {
          c?.disconnect();
        }
      }),
    );
  }

  async handleConnection(socket: Socket): Promise<void> {
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
    socket.data = { user: claims, viewing: new Set<string>() } as SocketState;
    this.armExpiry(socket, token);
    state(socket).revocationTimer = setInterval(() => {
      void this.revocation.isBlacklisted(state(socket).user.sid).then((r) => {
        if (r) {
          socket.emit('auth:error', { code: 'AUTH_SESSION_REVOKED' });
          socket.disconnect(true);
        }
      });
      // Owner 2026-10-01: presence heartbeat (own connections only).
      if (!state(socket).selfId) {
        void this.presence
          .touch(state(socket).user.sub, socket.id)
          .catch(() => undefined);
      }
    }, REVOCATION_CHECK_MS);
    state(socket).revocationTimer?.unref?.();
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
  }

  /** Tells the watchers of [userId] (open chats with them) — only when
   * the person shows their activity status. */
  private async announce(
    userId: string,
    online: boolean,
    lastSeenAt: Date | null,
  ): Promise<void> {
    if (!this.nsp || !(await this.presence.visible(userId))) return;
    this.nsp.to(presenceRoom(userId)).emit('presence:update', {
      userId,
      online,
      lastSeenAt: lastSeenAt?.toISOString() ?? null,
    });
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    this.gauge();
    const s = state(socket);
    if (!s?.user) return;
    clearTimeout(s.expiryTimer);
    clearInterval(s.revocationTimer);
    if (!s.selfId && s.user.role !== 'assistant') {
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

  /** §8.5 "повторная проверка при обновлении токена". */
  @SubscribeMessage('auth:refresh')
  async refresh(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { token?: unknown },
  ): Promise<{ ok: boolean }> {
    const token = typeof body?.token === 'string' ? body.token : '';
    const claims = token ? await this.verify(token) : null;
    const s = state(socket);
    if (!claims || claims.sub !== (s.selfId ?? s.user.sub)) {
      socket.emit('auth:error', { code: 'UNAUTHORIZED' });
      socket.disconnect(true);
      return { ok: false };
    }
    s.user = s.selfId ? { ...claims, sub: s.user.sub } : claims;
    this.armExpiry(socket, token);
    return { ok: true };
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
    if (!member) return { ok: false };
    await socket.join(conversationRoom(id));
    state(socket).viewing.add(id);
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
    @MessageBody() body: { conversationId?: unknown },
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
    body: { conversationId?: unknown },
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
    socket
      .to(conversationRoom(id))
      .emit('typing', { conversationId: id, typing });
  }

  /**
   * OQ-041: WebRTC signaling for an in-app call — an SDP offer/answer or
   * an ICE candidate goes to the other member of a live (ringing/active)
   * call only. Never stored; the audio itself never touches the server.
   */
  @SubscribeMessage('call:signal')
  async callSignal(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { callId?: unknown; data?: unknown },
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
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      select: { caller_id: true, callee_id: true, status: true },
    });
    if (!call || (call.status !== 'ringing' && call.status !== 'active')) {
      return { ok: false };
    }
    const peer =
      call.caller_id === uid
        ? call.callee_id
        : call.callee_id === uid
          ? call.caller_id
          : null;
    if (!peer) return { ok: false };
    this.nsp?.to(userRoom(peer)).emit('call:signal', { callId, data });
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

  /** An expired access token ends the socket unless refreshed first. */
  private armExpiry(socket: Socket, token: string): void {
    const s = state(socket);
    clearTimeout(s.expiryTimer);
    const exp = expiryOf(token);
    if (exp === null) return;
    s.expiryTimer = setTimeout(
      () => {
        socket.emit('auth:expired', {});
        socket.disconnect(true);
      },
      Math.max(0, exp - Date.now()),
    );
    s.expiryTimer.unref?.();
  }
}
