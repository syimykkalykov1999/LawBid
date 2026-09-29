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
import type { Namespace, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
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

interface SocketState {
  user: AccessTokenClaims;
  expiryTimer?: NodeJS.Timeout;
  lastTypingAt?: number;
  viewing: Set<string>;
}

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

  constructor(
    private readonly tokens: TokenService,
    private readonly revocation: SessionRevocationService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  afterInit(nsp: Namespace): void {
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
    await socket.join(userRoom(claims.sub));
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const s = state(socket);
    if (!s?.user) return;
    clearTimeout(s.expiryTimer);
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
    if (!claims || claims.sub !== state(socket).user.sub) {
      socket.emit('auth:error', { code: 'UNAUTHORIZED' });
      socket.disconnect(true);
      return { ok: false };
    }
    state(socket).user = claims;
    this.armExpiry(socket, token);
    return { ok: true };
  }

  @SubscribeMessage('conversation:join')
  async join(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId?: unknown },
  ): Promise<{ ok: boolean }> {
    const id = this.conversationIdOf(body);
    const uid = state(socket).user.sub;
    if (!id) return { ok: false };
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
      .emit('typing', { conversationId: id, userId: s.user.sub, typing });
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
