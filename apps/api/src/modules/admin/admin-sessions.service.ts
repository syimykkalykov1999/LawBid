import { Injectable, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminSessionService } from '../admin-auth/admin-session.service';
import type { AdminSessionRowDto } from './admin.dto';

export const SESSIONS_AUDIT = { revoke: 'admin_sessions.revoke' } as const;

/** Super admin oversight: every live admin session, and a kill switch. */
@Injectable()
export class AdminSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: AdminSessionService,
    private readonly audit: AuditLogService,
  ) {}

  async list(actor: AdminActor): Promise<AdminSessionRowDto[]> {
    const admins = await this.prisma.user.findMany({
      where: {
        role: 'admin',
        deleted_at: null,
        admin_profile: { isNot: null },
      },
      select: {
        id: true,
        email: true,
        admin_profile: { select: { admin_role: true } },
        admin_credential: { select: { login: true } },
      },
      take: 500,
    });
    const byId = new Map(admins.map((a) => [a.id, a]));
    const live = await this.sessions.listForUsers(admins.map((a) => a.id));
    return live
      .map((s) => {
        const a = byId.get(s.userId);
        return {
          sessionId: s.sessionId,
          adminId: s.userId,
          email: a?.email ?? '',
          login: a?.admin_credential?.login ?? null,
          role: a?.admin_profile?.admin_role ?? 'support',
          ip: s.ip,
          device: s.device,
          createdAt: s.createdAt,
          lastSeenAt: s.lastSeenAt,
          lastAction: s.lastAction,
          current: s.sessionId === actor.sessionId,
        } satisfies AdminSessionRowDto;
      })
      .sort((x, y) => y.lastSeenAt.localeCompare(x.lastSeenAt));
  }

  async revoke(actor: AdminActor, sessionId: string): Promise<void> {
    const owner = await this.sessions.ownerOf(sessionId);
    if (!owner) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Session not found or already ended.',
      });
    }
    await this.sessions.revoke(sessionId, owner);
    await this.audit.record({
      adminId: actor.id,
      action: SESSIONS_AUDIT.revoke,
      targetType: 'admin',
      targetId: owner,
      after: { sessionId },
      ip: actor.ip,
    });
  }
}
