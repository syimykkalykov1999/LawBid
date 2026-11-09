import { Inject, OnModuleDestroy, Optional } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import type { Namespace, Socket } from 'socket.io';
import { ADMIN_CHANGED_CHANNEL } from '../../common/admin-summary/admin-summary.service';
import {
  ADMIN_ACTIVE_KEY,
  ADMIN_ACTIVE_TTL_SEC,
} from '../../common/ops/admin-activity';
import { pubSubClient } from '../../redis/redis-connection';
import { closeSubscriber } from '../../redis/subscribe-in-background';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AdminCountsService } from '../admin/admin-counts.service';
import { AdminSessionService } from '../admin-auth/admin-session.service';
import { RateLimitService } from '../auth/auth.public';
import type { AdminTicket } from './admin-realtime.controller';
import {
  ADMIN_RT_NAMESPACE,
  ADMINS_ROOM,
  adminTicketKey,
} from './realtime-publisher.service';

/** The ticket is 24 random bytes in base64url (32 chars). */
const TICKET_RE = /^[A-Za-z0-9_-]{16,64}$/;
/** Sockets one address may open per hour (a tab opens one per sign-in). */
const ADMIN_SOCKETS_PER_IP_PER_HOUR = 300;
/** How often live sockets are checked against their admin session and the
 * sidebar counts of the connected scopes are refreshed (the server-side
 * twin of the minute poll the tabs no longer run). */
export const ADMIN_TICK_MS = 30_000;

interface AdminSocketState {
  adminId: string;
  sessionId: string;
  countries: string[] | null;
}

const scopeKey = (countries: string[] | null) =>
  countries ? [...countries].sort().join(',') : '';

/**
 * Speed matrix 2026-11-09 (§3 #5): the admin panel's live channel. Every
 * signed-in tab joins one room with a one-shot ticket from
 * AdminRealtimeController; it only listens (any packet it sends ends the
 * socket, like the QR sign-in namespace). The gateway relays
 * ADMIN_CHANGED_CHANNEL — the key of a stored admin value that changed
 * (AdminSummaryService) — to the room as `admin:changed`, and every 30 s it
 * drops sockets whose admin session ended, marks «an admin is looking»
 * (the summaries cron and keep-warm boards follow it) and refreshes the
 * sidebar counts once per connected country scope, so the badges keep
 * moving although no tab polls them any more.
 */
@WebSocketGateway({
  namespace: ADMIN_RT_NAMESPACE,
  cors: { origin: true },
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 4 * 1024,
  pingInterval: 25_000,
  pingTimeout: 20_000,
  connectTimeout: 10_000,
})
export class AdminRealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy
{
  private nsp?: Namespace;
  private sub?: Redis;
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
    private readonly sessions: AdminSessionService,
    @Optional() private readonly counts?: AdminCountsService,
    @Optional() private readonly rateLimit?: RateLimitService,
  ) {
    this.logger.setContext(AdminRealtimeGateway.name);
  }

  afterInit(nsp: Namespace): void {
    this.nsp = nsp;
    this.timer = setInterval(() => void this.tick(), ADMIN_TICK_MS);
    this.timer.unref();
    // Test doubles of REDIS_CLIENT can't pub/sub.
    if (typeof this.redis.duplicate !== 'function') return;
    this.sub = pubSubClient(this.redis);
    this.sub.on('message', (channel: string, key: string) => {
      if (channel === ADMIN_CHANGED_CHANNEL) this.onChanged(key);
    });
    void this.sub
      .subscribe(ADMIN_CHANGED_CHANNEL)
      .catch((error: unknown) =>
        this.logger.warn(
          { err: error instanceof Error ? error.message : error },
          'adm:changed subscribe failed',
        ),
      );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.sub) await closeSubscriber(this.sub);
  }

  /** One message of ADMIN_CHANGED_CHANNEL: the tabs on THIS instance hear it
   * (every instance gets the message, so no adapter broadcast). */
  onChanged(key: string): void {
    this.nsp?.local
      .to(ADMINS_ROOM)
      .emit('admin:changed', { key, at: new Date().toISOString() });
  }

  async handleConnection(socket: Socket): Promise<void> {
    // The browser only listens: any packet it sends ends the socket.
    socket.use((_packet, next) => {
      socket.disconnect(true);
      next(new Error('read-only'));
    });
    const auth = socket.handshake.auth as { ticket?: unknown } | undefined;
    const ticket = typeof auth?.ticket === 'string' ? auth.ticket : undefined;
    if (!ticket || !TICKET_RE.test(ticket)) {
      socket.emit('auth:error', { code: 'VALIDATION_ERROR' });
      socket.disconnect(true);
      return;
    }
    const ip = socket.handshake.address;
    if (this.rateLimit && ip) {
      const r = await this.rateLimit.consumeFixedWindow(
        ['admin-socket', 'ip', ip],
        ADMIN_SOCKETS_PER_IP_PER_HOUR,
        3600,
      );
      if (!r.allowed) {
        socket.emit('auth:error', { code: 'RATE_LIMITED' });
        socket.disconnect(true);
        return;
      }
    }
    // Redeemed once: a second handshake with the same ticket gets nothing.
    const raw = await this.redis.getdel(adminTicketKey(ticket));
    const stored = parseTicket(raw);
    if (
      !stored ||
      (await this.sessions.ownerOf(stored.sessionId)) !== stored.adminId
    ) {
      socket.emit('auth:error', { code: 'UNAUTHORIZED' });
      socket.disconnect(true);
      return;
    }
    socket.data = {
      adminId: stored.adminId,
      sessionId: stored.sessionId,
      countries: stored.countries,
    } satisfies AdminSocketState;
    await socket.join(ADMINS_ROOM);
    socket.emit('admin:ready', { at: new Date().toISOString() });
  }

  /** Every ADMIN_TICK_MS (exposed for tests): session check, activity
   * mark, one counts refresh per connected country scope. */
  async tick(): Promise<void> {
    const sockets = [...(this.nsp?.sockets.values() ?? [])];
    if (sockets.length === 0) return;
    const scopes = new Map<string, string[] | null>();
    for (const socket of sockets) {
      const st = socket.data as Partial<AdminSocketState>;
      if (!st.sessionId || !st.adminId) continue;
      let owner: string | null;
      try {
        owner = await this.sessions.ownerOf(st.sessionId);
      } catch {
        continue; // Redis trouble: keep the socket, check next time
      }
      if (owner !== st.adminId) {
        // Signed out, revoked or idle-expired: the tab goes back to its poll
        // (which answers 401 and sends it to /login).
        socket.emit('auth:error', { code: 'SESSION_ENDED' });
        socket.disconnect(true);
        continue;
      }
      scopes.set(scopeKey(st.countries ?? null), st.countries ?? null);
    }
    if (scopes.size === 0) return;
    try {
      await this.redis.set(ADMIN_ACTIVE_KEY, '1', 'EX', ADMIN_ACTIVE_TTL_SEC);
    } catch {
      /* a signal only */
    }
    if (!this.counts) return;
    for (const countries of scopes.values()) {
      // Reads the shared 30 s copy; a stale one is refreshed in the
      // background and announced on ADMIN_CHANGED_CHANNEL when it moved.
      await this.counts.get(countries).catch(() => undefined);
    }
  }
}

function parseTicket(raw: string | null): AdminTicket | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<AdminTicket> | null;
    if (!v || typeof v.adminId !== 'string' || typeof v.sessionId !== 'string')
      return null;
    return {
      adminId: v.adminId,
      sessionId: v.sessionId,
      countries: Array.isArray(v.countries)
        ? v.countries.filter((c): c is string => typeof c === 'string')
        : null,
    };
  } catch {
    return null;
  }
}
