import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type DmcaNotice, type ReportTargetType } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { UsageLimitsService } from '../../common/usage-limits/usage-limits.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminUsersService } from '../admin-users/admin-users.service';
import type { ModerationCardDto } from '../moderation/admin-moderation.dto';
import { AdminModerationService } from '../moderation/admin-moderation.service';
import { ModerationService } from '../moderation/moderation.service';
import { ReportsService } from '../reports/reports.module';
import {
  type AdminDmcaCounterDto,
  type AdminDmcaListQueryDto,
  type AdminDmcaNoticeDetailDto,
  type AdminDmcaNoticeRowDto,
  type CreateDmcaNoticeDto,
  type DmcaCounterNoticeDto,
  type DmcaDecideDto,
  type DmcaMineDto,
  type DmcaNoticeBriefDto,
  type DmcaNoticeCreatedDto,
  type DmcaStatus,
  type DmcaTargetType,
} from './legal.dto';
import { LEGAL_AUDIT, LegalService } from './legal.service';

const PAGE = 50;
const MINE_LIMIT = 50;
/** The reason written on the suspension and shown to the author. */
export const REPEAT_INFRINGER_REASON = 'Repeat copyright infringer (DMCA)';

type Page<T> = { items: T[]; nextCursor: string | null };

function invalidState(message: string): ConflictException {
  return new ConflictException({ code: ErrorCode.DMCA_INVALID_STATE, message });
}
function notFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'DMCA notice not found.',
  });
}
const toJson = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

function counterOf(raw: unknown): AdminDmcaCounterDto | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = raw as Record<string, unknown>;
  const s = (k: string): string => (typeof c[k] === 'string' ? c[k] : '');
  return {
    name: s('name'),
    address: s('address'),
    phone: typeof c.phone === 'string' ? c.phone : null,
    email: s('email'),
    consentJurisdiction: c.consentJurisdiction === true,
    sworn: c.sworn === true,
    signature: s('signature'),
    submittedAt: s('submittedAt'),
  };
}

export function presentNotice(n: DmcaNotice): AdminDmcaNoticeRowDto {
  return {
    id: n.id,
    status: n.status as DmcaStatus,
    reportId: n.report_id,
    targetType: (n.target_type as DmcaTargetType | null) ?? null,
    targetId: n.target_id,
    infringingUrl: n.infringing_url,
    complainantName: n.complainant_name,
    complainantEmail: n.complainant_email,
    complainantAddress: n.complainant_address,
    complainantPhone: n.complainant_phone,
    workDescription: n.work_description,
    goodFaith: n.good_faith,
    accuracySworn: n.accuracy_sworn,
    signature: n.signature,
    submittedByUserId: n.submitted_by_user_id,
    authorUserId: n.author_user_id,
    counter: counterOf(n.counter),
    decidedBy: n.decided_by,
    decidedAt: n.decided_at?.toISOString() ?? null,
    decisionNote: n.decision_note,
    createdAt: n.created_at.toISOString(),
    updatedAt: n.updated_at.toISOString(),
  };
}

/**
 * Owner 2026-10-05 (legal): DMCA takedown notices (17 U.S.C. §512).
 * A user files a notice from the report sheet (with a target) or from
 * the About screen (with a URL). The admin decides: `remove` takes the
 * content down through the ordinary moderation action (audited, the
 * author is notified), counts a strike against the author and suspends
 * a repeat infringer at the configured threshold (§512(i)); `reject`
 * closes it; the author may file a counter-notice (§512(g)) after a
 * removal, after which the admin `restore`s the content (by law 10–14
 * business days later unless the complainant sues) and the strike is
 * taken back.
 */
@Injectable()
export class DmcaService {
  private readonly logger = new Logger(DmcaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly limits: UsageLimitsService,
    private readonly moderation: ModerationService,
    private readonly adminModeration: AdminModerationService,
    private readonly users: AdminUsersService,
    private readonly audit: AuditLogService,
    private readonly legal: LegalService,
  ) {}

  // ---- app --------------------------------------------------------------

  /** POST /legal/dmca. */
  async create(
    userId: string,
    dto: CreateDmcaNoticeDto,
  ): Promise<DmcaNoticeCreatedDto> {
    const hasTarget = Boolean(dto.targetType && dto.targetId);
    if (Boolean(dto.targetType) !== Boolean(dto.targetId)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'targetType and targetId go together.',
        details: { field: dto.targetType ? 'targetId' : 'targetType' },
      });
    }
    if (!hasTarget && !dto.infringingUrl) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Point at the content: a target on LawBid or a URL.',
        details: { field: 'infringingUrl' },
      });
    }
    let reportId: string | null = null;
    if (hasTarget) {
      const targetType = dto.targetType as ReportTargetType;
      const targetId = dto.targetId!;
      // The ordinary report path: consumes the `report` limit, dedups per
      // reporter+target and auto-hides at the reporter threshold.
      await this.reports.create(userId, {
        targetType,
        targetId,
        reason: 'copyright',
        note: dto.workDescription.slice(0, 1000),
      });
      const report = await this.prisma.report.findFirst({
        where: {
          reporter_id: userId,
          target_type: targetType,
          target_id: targetId,
          reason: 'copyright',
        },
        orderBy: { created_at: 'desc' },
        select: { id: true },
      });
      reportId = report?.id ?? null;
    } else {
      await this.limits.consume('report', userId);
    }
    const row = await this.prisma.dmcaNotice.create({
      data: {
        report_id: reportId,
        target_type: hasTarget ? (dto.targetType as ReportTargetType) : null,
        target_id: hasTarget ? dto.targetId! : null,
        infringing_url: hasTarget
          ? (dto.infringingUrl ?? null)
          : dto.infringingUrl!,
        complainant_name: dto.complainantName,
        complainant_email: dto.complainantEmail,
        complainant_address: dto.complainantAddress,
        complainant_phone: dto.complainantPhone ?? null,
        work_description: dto.workDescription,
        good_faith: dto.goodFaith,
        accuracy_sworn: dto.accuracySworn,
        signature: dto.signature,
        submitted_by_user_id: userId,
      },
      select: { id: true, status: true },
    });
    this.logger.log({ noticeId: row.id, hasTarget }, 'DMCA notice filed');
    return { id: row.id, status: row.status as DmcaStatus };
  }

  /** GET /legal/dmca/mine. */
  async mine(userId: string): Promise<DmcaMineDto> {
    const [submitted, against] = await Promise.all([
      this.prisma.dmcaNotice.findMany({
        where: { submitted_by_user_id: userId },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: MINE_LIMIT,
      }),
      this.prisma.dmcaNotice.findMany({
        where: { author_user_id: userId },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: MINE_LIMIT,
      }),
    ]);
    return {
      submitted: submitted.map((n) => this.brief(n, false)),
      against: against.map((n) => this.brief(n, true)),
    };
  }

  private brief(n: DmcaNotice, isAuthor: boolean): DmcaNoticeBriefDto {
    const counter = counterOf(n.counter);
    return {
      id: n.id,
      status: n.status as DmcaStatus,
      targetType: (n.target_type as DmcaTargetType | null) ?? null,
      targetId: n.target_id,
      infringingUrl: n.infringing_url,
      createdAt: n.created_at.toISOString(),
      decidedAt: n.decided_at?.toISOString() ?? null,
      decisionNote: n.decision_note,
      counterSubmittedAt: counter?.submittedAt || null,
      canCounter: isAuthor && n.status === 'removed',
    };
  }

  /** POST /legal/dmca/:id/counter — only the author of the removed content. */
  async counter(
    userId: string,
    id: string,
    dto: DmcaCounterNoticeDto,
    now = new Date(),
  ): Promise<DmcaNoticeBriefDto> {
    const notice = await this.prisma.dmcaNotice.findUnique({ where: { id } });
    if (!notice) throw notFound();
    if (notice.author_user_id !== userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message:
          'Only the author of the removed content may file a counter-notice.',
      });
    }
    if (notice.status !== 'removed') {
      throw invalidState(
        'A counter-notice can be filed only while the content is removed.',
      );
    }
    const counter: AdminDmcaCounterDto = {
      name: dto.name,
      address: dto.address,
      phone: dto.phone ?? null,
      email: dto.email,
      consentJurisdiction: dto.consentJurisdiction,
      sworn: dto.sworn,
      signature: dto.signature,
      submittedAt: now.toISOString(),
    };
    const res = await this.prisma.dmcaNotice.updateMany({
      where: { id, status: 'removed' },
      data: { status: 'counter_received', counter: toJson(counter) },
    });
    if (res.count === 0) throw invalidState('The notice changed meanwhile.');
    const fresh = await this.prisma.dmcaNotice.findUnique({ where: { id } });
    return this.brief(fresh!, true);
  }

  // ---- admin --------------------------------------------------------------

  async list(q: AdminDmcaListQueryDto): Promise<Page<AdminDmcaNoticeRowDto>> {
    const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
    const filters: Prisma.DmcaNoticeWhereInput[] = [];
    if (q.status) filters.push({ status: q.status });
    if (cursor) {
      filters.push({
        OR: [
          { created_at: { lt: cursor.createdAt } },
          { created_at: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }
    const rows = await this.prisma.dmcaNotice.findMany({
      where: { AND: filters },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    return {
      items: page.map(presentNotice),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async detail(id: string): Promise<AdminDmcaNoticeDetailDto> {
    const notice = await this.mustFind(id);
    const settings = await this.legal.settings();
    let target: ModerationCardDto | null = null;
    if (notice.target_type && notice.target_id) {
      try {
        target = await this.adminModeration.card(
          notice.target_type,
          notice.target_id,
        );
      } catch (e) {
        if (!(e instanceof NotFoundException)) throw e;
      }
    }
    const authorId = notice.author_user_id ?? target?.author?.id ?? null;
    const author = authorId
      ? await this.prisma.user.findUnique({
          where: { id: authorId },
          select: { copyright_strikes: true },
        })
      : null;
    return {
      notice: presentNotice(notice),
      target,
      authorStrikes: author?.copyright_strikes ?? null,
      strikesToSuspend: settings.dmcaStrikesToSuspend,
    };
  }

  /** POST /admin/legal/dmca/:id/decide. */
  async decide(
    admin: AdminActor,
    id: string,
    dto: DmcaDecideDto,
    now = new Date(),
  ): Promise<AdminDmcaNoticeRowDto> {
    const notice = await this.mustFind(id);
    const reason = `DMCA notice ${id}`;
    let authorUserId = notice.author_user_id;
    let next: DmcaStatus;
    const outcome: Record<string, unknown> = {};

    if (dto.action === 'remove') {
      if (notice.status !== 'new') {
        throw invalidState('Only a new notice can lead to a removal.');
      }
      if (!notice.target_type || !notice.target_id) {
        throw invalidState(
          'This notice points at a URL, not at content on LawBid; handle it by hand.',
        );
      }
      const target = await this.moderation.resolve(
        notice.target_type,
        notice.target_id,
      );
      if (!target) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'The reported content no longer exists.',
        });
      }
      // Already gone (another moderator, the author): no second action,
      // but the notice is still recorded as a removal.
      if (target.status !== 'removed') {
        await this.adminModeration.act(
          admin,
          notice.target_type,
          notice.target_id,
          'remove',
          reason,
        );
      }
      authorUserId = target.authorId;
      if (authorUserId) {
        const strikes = await this.addStrike(admin, authorUserId);
        outcome.strikes = strikes.strikes;
        outcome.suspended = strikes.suspended;
      }
      next = 'removed';
    } else if (dto.action === 'reject') {
      if (notice.status !== 'new') {
        throw invalidState('Only a new notice can be rejected.');
      }
      next = 'rejected';
    } else {
      // restore
      if (notice.status !== 'counter_received' && notice.status !== 'removed') {
        throw invalidState('Only removed content can be restored.');
      }
      if (notice.target_type && notice.target_id) {
        const target = await this.moderation.resolve(
          notice.target_type,
          notice.target_id,
        );
        if (target && target.status !== 'published') {
          await this.adminModeration.act(
            admin,
            notice.target_type,
            notice.target_id,
            'restore',
            reason,
          );
        }
      }
      if (authorUserId) {
        // The strike goes back (never below zero).
        await this.prisma.user.updateMany({
          where: { id: authorUserId, copyright_strikes: { gt: 0 } },
          data: { copyright_strikes: { decrement: 1 } },
        });
      }
      next = 'restored';
    }

    const after = await this.prisma.dmcaNotice.update({
      where: { id },
      data: {
        status: next,
        author_user_id: authorUserId,
        decided_by: admin.id,
        decided_at: now,
        decision_note: dto.note ?? null,
      },
    });
    await this.audit.record({
      adminId: admin.id,
      action: LEGAL_AUDIT.dmcaDecide,
      targetType: 'dmca_notice',
      targetId: id,
      before: { status: notice.status },
      after: {
        status: next,
        action: dto.action,
        note: dto.note ?? null,
        ...outcome,
      },
      ip: admin.ip,
    });
    return presentNotice(after);
  }

  /**
   * One more strike against the author; at the threshold an active
   * account is suspended through the ordinary sanction (audited, sessions
   * ended, the user notified). 0 = never automatically.
   */
  private async addStrike(
    admin: AdminActor,
    authorId: string,
  ): Promise<{ strikes: number; suspended: boolean }> {
    const user = await this.prisma.user.update({
      where: { id: authorId },
      data: { copyright_strikes: { increment: 1 } },
      select: { copyright_strikes: true, status: true },
    });
    const settings = await this.legal.settings();
    const threshold = settings.dmcaStrikesToSuspend;
    let suspended = false;
    if (
      threshold > 0 &&
      user.copyright_strikes >= threshold &&
      user.status === 'active'
    ) {
      await this.users.suspend(admin, authorId, REPEAT_INFRINGER_REASON);
      suspended = true;
    }
    return { strikes: user.copyright_strikes, suspended };
  }

  private async mustFind(id: string): Promise<DmcaNotice> {
    const n = await this.prisma.dmcaNotice.findUnique({ where: { id } });
    if (!n) throw notFound();
    return n;
  }
}
