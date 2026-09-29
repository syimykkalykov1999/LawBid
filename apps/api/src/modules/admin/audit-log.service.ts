import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { AuditLogPage, AuditLogQueryDto } from './admin.dto';

const DEFAULT_LIMIT = 50;

/**
 * docs/06 §2.3 item 12 "Журнал аудита: фильтры по администратору,
 * действию, объекту, датам"; §2.2: super_admin sees everything, every
 * other role only its own rows (the filter is forced server-side).
 */
@Injectable()
export class AuditLogQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AdminActor, q: AuditLogQueryDto): Promise<AuditLogPage> {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
    const adminId = actor.adminRole === 'super_admin' ? q.adminId : actor.id;
    const where: Prisma.AuditLogWhereInput = {
      ...(adminId ? { admin_id: adminId } : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.targetType ? { target_type: q.targetType } : {}),
      ...(q.targetId ? { target_id: q.targetId } : {}),
      ...(q.from || q.to
        ? {
            created_at: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
      ...(cursor
        ? {
            OR: [
              { created_at: { lt: cursor.createdAt } },
              { created_at: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { admin: { select: { email: true } } },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        adminId: r.admin_id,
        adminEmail: r.admin.email,
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        justification: r.justification,
        before: r.before,
        after: r.after,
        ip: r.ip,
        createdAt: r.created_at.toISOString(),
      })),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }
}
