import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { StaffAdminActionsAdapter } from '../staff-appeals/staff-admin-actions.adapter';
import type {
  StaffDecideSuggestionDto,
  StaffDecideSuggestionResultDto,
} from './staff-home.dto';

const DAY_MS = 86_400_000;
/** «Проверять чаще»: this share of the person's decisions gets a second look. */
export const MORE_REVIEW_PCT = 30;
/** «Снять с очереди»: a pause lasts this many days, then the person returns. */
export const PAUSE_DAYS = 7;

const AUDIT = {
  apply: 'admin.staff.suggestion_apply',
  dismiss: 'admin.staff.suggestion_dismiss',
} as const;

const notFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Not found.' });
const bad = (message: string) =>
  new HttpException(
    { code: ErrorCode.VALIDATION_ERROR, message },
    HttpStatus.BAD_REQUEST,
  );

/** staff_actions.kind a suggestion kind is written as. */
export const ACTION_KIND: Record<string, string> = {
  warn: 'warn',
  retrain: 'warn',
  more_review: 'more_review',
  pull: 'pull',
  pause: 'pull',
  replace: 'replace',
  reward: 'reward',
};

const fmt = (d: Date) =>
  d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

/**
 * Staff package T10: the owner presses a button under a suggestion. «Apply»
 * does what the text said — and nothing else: a warning or a reward is only
 * written to the journal (`staff_actions`, the legal record: reason, rating
 * snapshot, date); «check more» sets a per-person review rate; «pull / pause»
 * puts the person on hold for a week; «replace» ends the work through the
 * administrators' own call (sessions closed). Every apply needs a fresh 2FA
 * code (the controller) and writes an audit row; there is no second approver.
 */
@Injectable()
export class StaffDecisionService {
  private readonly logger = new Logger(StaffDecisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffSettingsService,
    private readonly audit: AuditLogService,
    private readonly adminActions: StaffAdminActionsAdapter,
  ) {}

  async decide(
    admin: AdminActor,
    id: string,
    dto: StaffDecideSuggestionDto,
    now = new Date(),
  ): Promise<StaffDecideSuggestionResultDto> {
    if (admin.adminRole !== 'super_admin') throw notFound();
    const s = await this.staff.get();
    if (
      !s.switches['staff.rating_enabled'] ||
      !s.switches['staff.suggestions_enabled']
    ) {
      throw notFound();
    }
    const row = await this.prisma.staffSuggestion.findUnique({
      where: { id },
      select: {
        id: true,
        admin_id: true,
        kind: true,
        status: true,
        evidence: true,
      },
    });
    if (!row) throw notFound();
    if (row.status !== 'open') throw bad('Already decided.');
    const note = dto.note?.trim() || null;

    if (dto.action === 'dismiss') {
      await this.prisma.$transaction(async (tx) => {
        const r = await tx.staffSuggestion.updateMany({
          where: { id, status: 'open' },
          data: { status: 'dismissed', decided_by: admin.id, decided_at: now },
        });
        if (r.count === 0) throw bad('Already decided.');
        await this.audit.record(
          {
            adminId: admin.id,
            action: AUDIT.dismiss,
            targetType: 'staff_suggestion',
            targetId: id,
            after: { kind: row.kind, adminId: row.admin_id },
            ip: admin.ip,
          },
          tx,
        );
      });
      return { id, status: 'dismissed', done: 'Предложение отклонено.' };
    }

    const evidence = (
      row.evidence && typeof row.evidence === 'object' ? row.evidence : {}
    ) as Record<string, unknown>;
    const flags = Array.isArray(evidence.flags)
      ? evidence.flags.filter((f): f is string => typeof f === 'string')
      : [];
    const reason =
      row.kind === 'reward'
        ? 'top_rating'
        : row.kind === 'retrain'
          ? 'retrain'
          : (flags[0] ?? 'low_rating');
    const until = new Date(now.getTime() + PAUSE_DAYS * DAY_MS);
    let done = 'Записано в журнал.';

    await this.prisma.$transaction(async (tx) => {
      const r = await tx.staffSuggestion.updateMany({
        where: { id, status: 'open' },
        data: { status: 'applied', decided_by: admin.id, decided_at: now },
      });
      if (r.count === 0) throw bad('Already decided.');
      if (row.kind === 'more_review') {
        await tx.staffMemberState.upsert({
          where: { admin_id: row.admin_id },
          create: {
            admin_id: row.admin_id,
            review_rate_override: MORE_REVIEW_PCT,
          },
          update: { review_rate_override: MORE_REVIEW_PCT },
        });
        done = `Проверка решений чаще: ${MORE_REVIEW_PCT} %.`;
      } else if (row.kind === 'pull' || row.kind === 'pause') {
        await tx.staffMemberState.upsert({
          where: { admin_id: row.admin_id },
          create: {
            admin_id: row.admin_id,
            state: 'paused',
            state_reason: 'owner_pull',
            state_until: until,
          },
          update: {
            state: 'paused',
            state_reason: 'owner_pull',
            state_until: until,
          },
        });
        done = `Снят с очереди до ${fmt(until)}.`;
      } else if (row.kind === 'replace') {
        await tx.staffMemberState.upsert({
          where: { admin_id: row.admin_id },
          create: {
            admin_id: row.admin_id,
            state: 'offboarded',
            state_reason: 'owner_replace',
          },
          update: {
            state: 'offboarded',
            state_reason: 'owner_replace',
            state_until: null,
          },
        });
      }
      await tx.staffAction.create({
        data: {
          admin_id: row.admin_id,
          actor_id: admin.id,
          source: 'owner',
          kind: ACTION_KIND[row.kind] ?? 'warn',
          reason_code: reason.slice(0, 40),
          reason_note: note,
          rating_snapshot: evidence as Prisma.InputJsonValue,
          ends_at: row.kind === 'pull' || row.kind === 'pause' ? until : null,
          created_at: now,
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: AUDIT.apply,
          targetType: 'staff_suggestion',
          targetId: id,
          after: { kind: row.kind, adminId: row.admin_id },
          ip: admin.ip,
        },
        tx,
      );
    });

    if (row.kind === 'replace') {
      // Ending the work is the administrators' own call (sessions closed);
      // the journal is already written, so a failure here is reported, not hidden.
      try {
        await this.adminActions.disable(admin, row.admin_id);
        done = 'Работа закончена: доступ закрыт, сессии завершены.';
      } catch (e) {
        this.logger.error(`suggestion ${id}: disable failed: ${String(e)}`);
        done =
          'Записано в журнал, но доступ не закрылся: отключите человека в «Администраторах».';
      }
    }
    return { id, status: 'applied', done };
  }
}
