import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Notification } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { clientDisplayName } from '../comments/comments.service';
import { FilesService } from '../files/files.service';
import { BadgesService } from './badges.service';
import { DEFAULT_PUSH, LOCKED_CATEGORIES } from './notification-rules';
import {
  CATEGORIES,
  type CategorySettingDto,
  type NotificationDto,
  type NotificationSettingsDto,
  type QuietHoursDto,
  NewCaseAlertsDto,
  UpdateNewCaseAlertsDto,
} from './notifications-api.dto';

const PAGE = 20;

function invalid(field: string, message: string): BadRequestException {
  return new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    details: { field },
  });
}

/** "22:00" → a TIME value (Prisma maps @db.Time to a 1970-01-01 date). */
function toTime(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

function fromTime(d: Date): string {
  return d.toISOString().slice(11, 16);
}

/** docs/05 §9.1, §9.5, §10 REST. */
@Injectable()
export class NotificationsApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly badges: BadgesService,
    private readonly files: FilesService,
  ) {}

  async list(
    userId: string,
    cursor?: string,
  ): Promise<{ items: NotificationDto[]; nextCursor: string | null }> {
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.notification.findMany({
      where: {
        user_id: userId,
        // new_message is never stored; guard old rows anyway (§9.2).
        type: { not: 'new_message' },
        ...(c
          ? {
              OR: [
                { created_at: { lt: c.createdAt } },
                { created_at: c.createdAt, id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    return {
      items: await this.present(page),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async read(
    userId: string,
    input: { ids?: string[]; all?: boolean },
  ): Promise<{ updated: number }> {
    if (!input.all && (!input.ids || input.ids.length === 0)) {
      throw invalid('ids', 'Pass ids or all: true.');
    }
    const { count } = await this.prisma.notification.updateMany({
      where: {
        user_id: userId,
        read_at: null,
        ...(input.all ? {} : { id: { in: input.ids } }),
      },
      data: { read_at: new Date() },
    });
    if (count > 0) await this.badges.notificationsChanged(userId);
    return { updated: count };
  }

  async settings(userId: string): Promise<NotificationSettingsDto> {
    const [rows, qh] = await Promise.all([
      this.prisma.notificationSetting.findMany({ where: { user_id: userId } }),
      this.prisma.notificationQuietHours.findUnique({
        where: { user_id: userId },
      }),
    ]);
    const byCat = new Map(rows.map((r) => [r.category, r]));
    return {
      categories: CATEGORIES.map((category) => {
        const locked = LOCKED_CATEGORIES.has(category);
        const r = byCat.get(category);
        return {
          category,
          locked,
          pushEnabled: locked
            ? true
            : (r?.push_enabled ?? DEFAULT_PUSH[category]),
          emailEnabled: locked ? true : (r?.email_enabled ?? true),
        };
      }),
      quietHours: qh
        ? {
            start: fromTime(qh.start_time),
            end: fromTime(qh.end_time),
            timezone: qh.timezone,
          }
        : null,
    };
  }

  async updateSettings(
    userId: string,
    items: CategorySettingDto[],
  ): Promise<NotificationSettingsDto> {
    for (const item of items) {
      if (
        LOCKED_CATEGORIES.has(item.category) &&
        (!item.pushEnabled || !item.emailEnabled)
      ) {
        throw invalid('items', 'System notifications can not be turned off.');
      }
    }
    for (const item of items) {
      if (LOCKED_CATEGORIES.has(item.category)) continue;
      await this.prisma.notificationSetting.upsert({
        where: {
          user_id_category: { user_id: userId, category: item.category },
        },
        create: {
          user_id: userId,
          category: item.category,
          push_enabled: item.pushEnabled,
          email_enabled: item.emailEnabled,
        },
        update: {
          push_enabled: item.pushEnabled,
          email_enabled: item.emailEnabled,
        },
      });
    }
    return this.settings(userId);
  }

  async setQuietHours(
    userId: string,
    dto: QuietHoursDto,
  ): Promise<NotificationSettingsDto> {
    if (dto.start == null) {
      await this.prisma.notificationQuietHours.deleteMany({
        where: { user_id: userId },
      });
      return this.settings(userId);
    }
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: dto.timezone ?? '' });
    } catch {
      throw invalid('timezone', 'Unknown time zone.');
    }
    const data = {
      start_time: toTime(dto.start),
      end_time: toTime(dto.end ?? dto.start),
      timezone: dto.timezone as string,
    };
    await this.prisma.notificationQuietHours.upsert({
      where: { user_id: userId },
      create: { user_id: userId, ...data },
      update: data,
    });
    return this.settings(userId);
  }

  /** The actor of social notifications: an attorney by public profile, a
   * client only as "Anna K." (§5.2 rule, no id/photo). */
  private async present(rows: Notification[]): Promise<NotificationDto[]> {
    const actorIds = [
      ...new Set(
        rows.flatMap((r) => {
          const a = (r.payload as Record<string, unknown> | null)?.actorId;
          return typeof a === 'string' ? [a] : [];
        }),
      ),
    ];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: {
            id: true,
            role: true,
            first_name: true,
            last_name: true,
            avatar_file_id: true,
            attorney_profile: { select: { username: true } },
          },
        })
      : [];
    const byId = new Map(actors.map((a) => [a.id, a]));
    const avatars = await this.files.avatarUrlsMany(
      actors.filter((a) => a.role === 'attorney').map((a) => a.avatar_file_id),
    );
    const out: NotificationDto[] = [];
    for (const r of rows) {
      const payload = (r.payload ?? {}) as Record<string, unknown>;
      const a =
        typeof payload.actorId === 'string' ? byId.get(payload.actorId) : null;
      const isAttorney = a?.role === 'attorney';
      // A client actor stays anonymous (§5.2): their id leaves the payload.
      const safePayload = { ...payload };
      delete safePayload.actorId;
      out.push({
        id: r.id,
        type: r.type,
        category: r.category,
        payload: isAttorney ? payload : safePayload,
        actor: a
          ? {
              id: isAttorney ? a.id : null,
              displayName: isAttorney
                ? [a.first_name, a.last_name].filter(Boolean).join(' ') ||
                  (a.attorney_profile?.username ?? '')
                : clientDisplayName(a.first_name, a.last_name),
              username: isAttorney
                ? (a.attorney_profile?.username ?? null)
                : null,
              avatarUrl:
                isAttorney && a.avatar_file_id
                  ? (avatars.get(a.avatar_file_id)?.url256 ?? null)
                  : null,
            }
          : null,
        aggregateCount: r.aggregate_count,
        readAt: r.read_at,
        createdAt: r.created_at,
      });
    }
    return out;
  }

  /** Owner 2026-10-01: which qualifications send "new case" alerts. */
  async newCaseAlerts(userId: string): Promise<NewCaseAlertsDto> {
    const p = await this.prisma.attorneyProfile.findUnique({
      where: { user_id: userId },
      select: {
        new_case_alerts_custom: true,
        practice_areas: { select: { practice_area_id: true } },
        new_case_alert_practices: { select: { practice_area_id: true } },
      },
    });
    if (!p) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only attorneys get new-case alerts.',
      });
    }
    return {
      useProfile: !p.new_case_alerts_custom,
      practiceAreaIds: p.new_case_alert_practices.map(
        (x) => x.practice_area_id,
      ),
      profilePracticeAreaIds: p.practice_areas.map((x) => x.practice_area_id),
    };
  }

  async setNewCaseAlerts(
    userId: string,
    dto: UpdateNewCaseAlertsDto,
  ): Promise<NewCaseAlertsDto> {
    await this.newCaseAlerts(userId); // attorneys only
    const ids = [...new Set(dto.practiceAreaIds ?? [])];
    if (!dto.useProfile && ids.length === 0) {
      throw invalid('practiceAreaIds', 'Choose at least one qualification.');
    }
    if (ids.length > 0) {
      const found = await this.prisma.practiceArea.count({
        where: { id: { in: ids } },
      });
      if (found !== ids.length) {
        throw invalid('practiceAreaIds', 'Unknown qualification.');
      }
    }
    await this.prisma.$transaction([
      this.prisma.attorneyProfile.update({
        where: { user_id: userId },
        data: { new_case_alerts_custom: !dto.useProfile },
      }),
      // The custom list is kept even while "as in my profile" is on, so
      // switching back restores it.
      ...(dto.practiceAreaIds === undefined
        ? []
        : [
            this.prisma.newCaseAlertPractice.deleteMany({
              where: { attorney_id: userId },
            }),
            this.prisma.newCaseAlertPractice.createMany({
              data: ids.map((id) => ({
                attorney_id: userId,
                practice_area_id: id,
              })),
            }),
          ]),
    ]);
    return this.newCaseAlerts(userId);
  }
}
