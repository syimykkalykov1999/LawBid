import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { FileReleaseService } from '../../modules/files/storage/file-release.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_MS = 24 * 3600 * 1000;
/** A reminder later than this is not sent at all (an outage of the
 * worker must not wake everybody with yesterday's reminders). */
const REMINDER_GRACE_MS = 6 * 3600 * 1000;
const BATCH = 500;
/** Days before removal when the owner hears about it. */
export const PURGE_NOTICE_DAYS = [30, 7] as const;

/**
 * Owner 2026-10-05: the planner's reminder push — at `remind_at` (the
 * task's time minus `remind_before_min`) the owner of the planner and the
 * assistant the task is assigned to get `task_reminder`. `reminded_at`
 * is claimed with a conditional update, so overlapping runs send it once.
 */
@Injectable()
export class TaskRemindersJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TaskRemindersJob.name);
  }

  async run(now: Date = new Date()): Promise<{ sent: number }> {
    const due = await this.prisma.attorneyTask.findMany({
      where: {
        remind_at: {
          lte: now,
          gt: new Date(now.getTime() - REMINDER_GRACE_MS),
        },
        reminded_at: null,
        status: { in: ['open', 'taken'] },
        archived_at: null,
      },
      select: {
        id: true,
        attorney_id: true,
        kind: true,
        due_at: true,
        assignee: { select: { assistant_user_id: true, status: true } },
      },
      take: BATCH,
    });
    let sent = 0;
    for (const t of due) {
      const { count } = await this.prisma.attorneyTask.updateMany({
        where: { id: t.id, reminded_at: null },
        data: { reminded_at: now },
      });
      if (count === 0) continue;
      const payload = {
        taskId: t.id,
        kind: t.kind,
        ...(t.due_at ? { dueAt: t.due_at.toISOString() } : {}),
      };
      await this.notifications.emit({
        type: 'task_reminder',
        recipientId: t.attorney_id,
        payload,
      });
      const a = t.assignee;
      if (a?.assistant_user_id && a.status === 'active') {
        await this.notifications.emit({
          type: 'task_reminder',
          recipientId: a.assistant_user_id,
          payload,
        });
      }
      sent += 1;
    }
    if (sent) this.logger.info({ sent }, 'task reminders');
    return { sent };
  }
}

/**
 * Owner 2026-10-05: the archive is not kept forever — finished tasks
 * older than `tasks.archive_retention_days` (365) are removed with their
 * files, unless the owner marked them "keep forever". 30 and 7 days
 * before, the owner gets one `task_purge_soon` per planner (how many and
 * when) so they can keep what they need. `tasks.archive_auto_purge` off
 * stops both. Active tasks are never touched.
 */
@Injectable()
export class TaskArchivePurgeJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly notifications: NotificationsService,
    private readonly release: FileReleaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TaskArchivePurgeJob.name);
  }

  async run(
    now: Date = new Date(),
  ): Promise<{ removed: number; files: number; notices: number }> {
    if (!(await this.settings.boolean('tasks.archive_auto_purge'))) {
      return { removed: 0, files: 0, notices: 0 };
    }
    const days = await this.settings.number('tasks.archive_retention_days');
    if (!(days > 0)) return { removed: 0, files: 0, notices: 0 };
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    const notices = await this.notify(now, days);

    let removed = 0;
    let files = 0;
    for (;;) {
      const rows = await this.prisma.attorneyTask.findMany({
        where: {
          archived_at: { lt: cutoff },
          keep_forever: false,
          status: { in: ['done', 'not_done', 'cancelled'] },
        },
        select: { id: true, file_ids: true },
        take: BATCH,
      });
      if (rows.length === 0) break;
      await this.prisma.attorneyTask.deleteMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
      removed += rows.length;
      files += await this.dropFiles(
        rows.flatMap((r) => r.file_ids),
        now,
      );
      if (rows.length < BATCH) break;
    }
    if (removed || notices) {
      this.logger.info({ removed, files, notices }, 'task archive purge');
    }
    return { removed, files, notices };
  }

  /** One notice per planner per stage (30 → 7 days left). */
  private async notify(now: Date, days: number): Promise<number> {
    let sent = 0;
    for (const left of PURGE_NOTICE_DAYS) {
      if (left >= days) continue;
      const edge = new Date(now.getTime() - (days - left) * DAY_MS);
      const due = await this.prisma.attorneyTask.findMany({
        where: {
          archived_at: { lt: edge },
          keep_forever: false,
          status: { in: ['done', 'not_done', 'cancelled'] },
          OR: [
            { purge_notice_days: null },
            { purge_notice_days: { gt: left } },
          ],
        },
        select: { id: true, attorney_id: true, archived_at: true },
        take: 5000,
      });
      const byOwner = new Map<string, { ids: string[]; first: Date }>();
      for (const r of due) {
        const at = r.archived_at ?? now;
        const g = byOwner.get(r.attorney_id) ?? { ids: [], first: at };
        g.ids.push(r.id);
        if (at < g.first) g.first = at;
        byOwner.set(r.attorney_id, g);
      }
      for (const [owner, g] of byOwner) {
        await this.prisma.attorneyTask.updateMany({
          where: { id: { in: g.ids } },
          data: { purge_notice_days: left },
        });
        await this.notifications.emit({
          type: 'task_purge_soon',
          recipientId: owner,
          payload: {
            count: String(g.ids.length),
            days: String(left),
            purgeAt: new Date(g.first.getTime() + days * DAY_MS).toISOString(),
          },
        });
        sent += 1;
      }
    }
    return sent;
  }

  /** A removed task's files go too — unless another task still has them
   * (a repeating task's next copy shares the files). */
  private async dropFiles(ids: string[], now: Date): Promise<number> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return 0;
    const still = await this.prisma.attorneyTask.findMany({
      where: { file_ids: { hasSome: unique } },
      select: { file_ids: true },
    });
    const kept = new Set(still.flatMap((r) => r.file_ids));
    const gone = unique.filter((id) => !kept.has(id));
    if (gone.length === 0) return 0;
    // Owner 2026-10-05: through the release service — a file shared with
    // another upload (deduplicated) stays for it, previews go too.
    const { released } = await this.release.release(gone, 'task_purged', now);
    return released;
  }
}
