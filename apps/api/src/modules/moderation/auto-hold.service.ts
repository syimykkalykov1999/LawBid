import { Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma, ReportTargetType } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import { PrismaService } from '../../prisma/prisma.service';

/** The `note` prefix of a system report (never a person's complaint). */
export const AUTO_HOLD_NOTE = 'auto_hold';

export interface AutoHoldInput {
  targetType: Extract<ReportTargetType, 'post' | 'comment'>;
  targetId: string;
  authorId: string;
  /** Which rule held it (hold words, links, repeat, classifier). */
  rule?: string;
}

/**
 * Algo audit 2026-10-27 (CONTENT C-2): a post or comment the rules held
 * (`hidden` before anyone saw it) used to be in no queue at all — the
 * moderators' queue reads `reports` only, so it stayed hidden for ever.
 * This files ONE system report per held object (reporter = its author,
 * note `auto_hold…`), which puts it in the open queue like any complaint;
 * the moderator then restores, removes or dismisses it (a dismiss of an
 * auto-hidden object restores it, C-1). Such a row never counts as a
 * complaint: it is skipped by the auto-hide threshold and by the reporter
 * reputation (ModerationService / AdminModerationService).
 */
@Injectable()
export class AutoHoldService {
  private readonly log = new Logger(AutoHoldService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  async enabled(): Promise<boolean> {
    if (!this.settings)
      return APP_SETTINGS['moderation.auto_hold_queue_enabled'];
    return this.settings.boolean('moderation.auto_hold_queue_enabled');
  }

  /** Files the system report (idempotent per object). Never throws:
   * publishing must not fail because the queue row could not be written. */
  async queue(
    input: AutoHoldInput,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<boolean> {
    try {
      if (!(await this.enabled())) return false;
      const existing = await db.report.findFirst({
        where: {
          target_type: input.targetType,
          target_id: input.targetId,
          status: 'open',
          note: { startsWith: AUTO_HOLD_NOTE },
        },
        select: { id: true },
      });
      if (existing) return false;
      await db.report.create({
        data: {
          reporter_id: input.authorId,
          target_type: input.targetType,
          target_id: input.targetId,
          reason: 'other',
          note: input.rule
            ? `${AUTO_HOLD_NOTE}: ${input.rule}`.slice(0, 500)
            : AUTO_HOLD_NOTE,
          target_author_id: input.authorId,
        },
      });
      return true;
    } catch (e) {
      this.log.error(
        `auto-hold report for ${input.targetType} ${input.targetId} failed: ${String(e)}`,
      );
      return false;
    }
  }
}
