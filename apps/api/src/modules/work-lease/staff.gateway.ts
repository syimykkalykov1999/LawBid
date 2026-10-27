import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import {
  STAFF_CLIENT_EVENTS,
  STAFF_NAMESPACE,
  STAFF_SERVER_EVENTS,
  staffAdminRoom,
  staffHeadRoom,
  type StaffStatus,
} from '../../common/staff-events';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminSessionService } from '../admin-auth/admin-session.service';
import { TokenService } from '../auth/services/token.service';
import { effectiveWorkspace } from '../staff-core/workspace-scope';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { LeaseService } from './lease.service';
import { StaffEventsPublisher } from './staff-events.publisher';
import { StaffPresenceService } from './staff-presence.service';

export { STAFF_NAMESPACE };

const log = new Logger('StaffGateway');

/** A heartbeat arriving faster than this is answered without touching Redis. */
const MIN_HEARTBEAT_GAP_MS = 5_000;

interface StaffSocketData {
  adminId: string;
  jti: string;
  workspace: string;
  lastHbAt: number;
  status?: StaffStatus;
}

const dataOf = (socket: Socket): StaffSocketData | undefined =>
  (socket.data as { staff?: StaffSocketData }).staff;

/**
 * Staff package (plan B2): the `/staff` namespace — presence heartbeat,
 * lease:* events, team tiles. Separate from `/realtime`.
 *  - connect: admin JWT + live Redis session (same checks as AdminAuthGuard;
 *    the account must still be an active admin); closed with
 *    `staff:error NOT_ENABLED` while both `staff.presence_enabled` and
 *    `staff.lease_enabled` are off (nothing listens, nothing is stored);
 *  - `presence:hb {active}` every 15 s -> `StaffPresenceService` (one Redis
 *    pipeline, NO database write); the ack carries the status, a change is
 *    pushed as `status:changed`;
 *  - the last socket of a person closing starts the 60 s grace
 *    (`presence.grace_sec`); if no heartbeat shows up anywhere by then
 *    (another tab, another instance) their leases go back to the queue.
 *    `staff.lease-sweep` is the safety net when this process dies.
 */
@WebSocketGateway({
  namespace: STAFF_NAMESPACE,
  cors: { origin: true },
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 4 * 1024,
  pingInterval: 25_000,
  pingTimeout: 20_000,
  connectTimeout: 10_000,
})
export class StaffGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly sockets = new Map<string, Set<string>>();
  private readonly graceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: AdminSessionService,
    private readonly prisma: PrismaService,
    private readonly staff: StaffSettingsService,
    private readonly presence: StaffPresenceService,
    private readonly leases: LeaseService,
    private readonly events: StaffEventsPublisher,
  ) {}

  onModuleDestroy(): void {
    for (const t of this.graceTimers.values()) clearTimeout(t);
    this.graceTimers.clear();
  }

  /** The handshake runs async; an early `presence:hb` waits for it (`ready`). */
  handleConnection(socket: Socket): Promise<void> {
    const ready = this.connect(socket);
    socket.data = { ...(socket.data as object), ready };
    return ready;
  }

  private async connect(socket: Socket): Promise<void> {
    try {
      const cfg = await this.staff.get();
      if (
        !cfg.switches['staff.presence_enabled'] &&
        !cfg.switches['staff.lease_enabled']
      ) {
        return this.reject(socket, 'NOT_ENABLED');
      }
      const token = this.tokenOf(socket);
      if (!token) return this.reject(socket, 'UNAUTHORIZED');
      let claims: { sub: string; jti: string };
      try {
        claims = this.tokens.verifyAdminToken(token);
      } catch {
        return this.reject(socket, 'UNAUTHORIZED');
      }
      if ((await this.sessions.ownerOf(claims.jti)) !== claims.sub) {
        return this.reject(socket, 'UNAUTHORIZED');
      }
      const user = await this.prisma.user.findUnique({
        where: { id: claims.sub },
        select: {
          role: true,
          status: true,
          deleted_at: true,
          admin_profile: {
            select: {
              admin_role: true,
              workspace: true,
              is_workspace_head: true,
            },
          },
        },
      });
      if (
        !user ||
        user.role !== 'admin' ||
        user.status !== 'active' ||
        user.deleted_at ||
        !user.admin_profile
      ) {
        return this.reject(socket, 'UNAUTHORIZED');
      }
      const workspace = effectiveWorkspace(
        user.admin_profile.admin_role,
        user.admin_profile.workspace,
      );
      socket.data = {
        ...(socket.data as object),
        staff: {
          adminId: claims.sub,
          jti: claims.jti,
          workspace,
          lastHbAt: 0,
        } satisfies StaffSocketData,
      };
      await socket.join(staffAdminRoom(claims.sub));
      // The owner and the workspace head get the team tiles.
      const head =
        workspace === 'owner' ||
        (user.admin_profile.is_workspace_head &&
          cfg.switches['staff.head_enabled']);
      if (head) await socket.join(staffHeadRoom(workspace));

      const set = this.sockets.get(claims.sub) ?? new Set<string>();
      set.add(socket.id);
      this.sockets.set(claims.sub, set);
      const grace = this.graceTimers.get(claims.sub);
      if (grace) clearTimeout(grace);
      this.graceTimers.delete(claims.sub);
    } catch (e) {
      log.warn(`connect failed: ${String(e)}`);
      this.reject(socket, 'UNAVAILABLE');
    }
  }

  handleDisconnect(socket: Socket): void {
    const d = dataOf(socket);
    if (!d) return;
    const set = this.sockets.get(d.adminId);
    set?.delete(socket.id);
    if (set && set.size > 0) return;
    this.sockets.delete(d.adminId);
    void this.startGrace(d.adminId);
  }

  /** 60 s after the person's last socket closed: nobody signalling -> leases go back. */
  private async startGrace(adminId: string): Promise<void> {
    const cfg = await this.staff.get();
    if (
      !cfg.switches['staff.presence_enabled'] ||
      !cfg.switches['staff.lease_enabled']
    ) {
      return;
    }
    const graceMs = cfg.numbers['staff.presence.grace_sec'] * 1000;
    const prev = this.graceTimers.get(adminId);
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      this.graceTimers.delete(adminId);
      void this.releaseIfStillGone(adminId, graceMs);
    }, graceMs);
    timer.unref();
    this.graceTimers.set(adminId, timer);
  }

  private async releaseIfStillGone(
    adminId: string,
    graceMs: number,
  ): Promise<void> {
    try {
      if (this.sockets.has(adminId)) return;
      const r = await this.presence.read(adminId);
      // Another tab / instance is still signalling: nothing is lost.
      if (r.seenMs !== null && Date.now() - r.seenMs < graceMs) return;
      await this.leases.releaseAllFor(adminId, 'disconnected');
    } catch (e) {
      log.warn(`grace release failed: ${String(e)}`);
    }
  }

  @SubscribeMessage(STAFF_CLIENT_EVENTS.heartbeat)
  async onHeartbeat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { active?: unknown } | undefined,
  ): Promise<{ ok: boolean; status?: StaffStatus; code?: string }> {
    await (socket.data as { ready?: Promise<void> }).ready;
    const d = dataOf(socket);
    if (!d) return { ok: false, code: 'UNAUTHORIZED' };
    if (!(await this.staff.isOn('staff.presence_enabled'))) {
      return { ok: false, code: 'NOT_ENABLED' };
    }
    const now = Date.now();
    if (now - d.lastHbAt < MIN_HEARTBEAT_GAP_MS) {
      return { ok: true, status: d.status };
    }
    d.lastHbAt = now;
    // The session may have ended (sign-out, idle, revoked by the owner).
    if ((await this.sessions.ownerOf(d.jti)) !== d.adminId) {
      socket.emit(STAFF_SERVER_EVENTS.sessionRevoked, {});
      socket.disconnect(true);
      return { ok: false, code: 'UNAUTHORIZED' };
    }
    const status = await this.presence.heartbeat(
      d.adminId,
      body?.active === true,
      now,
    );
    if (status !== d.status) {
      d.status = status;
      this.events.toAdmin(d.adminId, STAFF_SERVER_EVENTS.statusChanged, {
        status,
      });
      this.events.tile(d.workspace, { adminId: d.adminId, status });
    }
    return { ok: true, status };
  }

  private tokenOf(socket: Socket): string | undefined {
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    if (typeof auth?.token === 'string') return auth.token;
    const header = socket.handshake.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  }

  private reject(socket: Socket, code: string): void {
    socket.emit(STAFF_SERVER_EVENTS.error, { code });
    socket.disconnect(true);
  }
}
