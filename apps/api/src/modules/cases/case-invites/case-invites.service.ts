import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import { FilesService } from '../../files/files.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  BID_LIST_INCLUDE,
  toAttorneySummary,
} from '../case-bids/case-bids.service';
import { loadUrgencyThresholds, urgencyFields } from '../domain/case-urgency';
import { caseNotFound } from '../domain/case-state-machine';
import { CaseAccessPolicy } from '../policies/case-access.policy';
import { CasePhotosService } from '../services/case-photos.service';
import {
  INVITES_PAGE_SIZE,
  type CaseInviteDto,
  type CaseInvitePage,
  type CreateInviteDto,
  type DeclineInviteDto,
  type InviteListQueryDto,
  type InviteStatus,
} from './dto/case-invites.dto';

const DAY_MS = 24 * 3600 * 1000;

const INVITE_INCLUDE = {
  case: {
    select: {
      title: true,
      status: true,
      deleted_at: true,
      description: true,
      city: true,
      urgency: true,
      deadline_at: true,
      deadline_kind: true,
      budget_mode: true,
      budget_cents: true,
      practice_area: { select: { i18n_key: true } },
      states: { select: { state_code: true }, orderBy: { state_code: 'asc' } },
    },
  },
} satisfies Prisma.CaseInviteInclude;

type InviteRow = Prisma.CaseInviteGetPayload<{
  include: typeof INVITE_INCLUDE;
}>;

/**
 * Owner 2026-10-05: a client offers one of their open cases to a chosen
 * attorney ("Предложить дело" on the attorney's profile).
 *
 * - One invite per (case, attorney); a re-invite after a decline, cancel
 *   or expiry reuses the row. Only open cases; only an attorney who may
 *   see the case (verified, no block either way) — the same any-state /
 *   any-practice rule as bids, with the mismatch flags stored for both
 *   sides to see.
 * - The attorney answers with an ordinary bid (POST /cases/:id/bids marks
 *   the pending invite accepted — BidsService.create), so the
 *   subscription gate, counter-offers, acceptance and chat stay the bid
 *   flow's. Or declines, optionally with a reason (the client is told).
 * - The client may cancel while it is pending. Unanswered invites expire
 *   after `invites.expiry_days`; limits: `invites.max_pending_per_case`,
 *   `invites.max_per_day`.
 */
@Injectable()
export class CaseInvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caseAccess: CaseAccessPolicy,
    private readonly notifications: NotificationsService,
    private readonly settings: AppSettingsService,
    private readonly files: FilesService,
    @Optional() private readonly photos?: CasePhotosService,
  ) {}

  /** POST /cases/:id/invites. */
  async create(
    user: RequestUser,
    caseId: string,
    dto: CreateInviteDto,
  ): Promise<CaseInviteDto> {
    if (user.role !== 'client') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the case owner can invite attorneys.',
      });
    }
    const kase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { client_id: true, status: true, deleted_at: true },
    });
    if (!kase || kase.deleted_at || kase.client_id !== user.sub) {
      throw caseNotFound();
    }
    if (kase.status !== 'open') {
      throw new ConflictException({
        code: ErrorCode.CASE_INVALID_STATE,
        message: 'Only an open case can be offered to an attorney.',
        details: { status: kase.status },
      });
    }
    const attorneyId = dto.attorneyId;
    const access =
      attorneyId === user.sub
        ? null
        : await this.caseAccess.decide(
            { userId: attorneyId, role: 'attorney' },
            caseId,
          );
    if (!access || access.kind === 'owner') {
      throw new ConflictException({
        code: ErrorCode.INVITE_ATTORNEY_UNAVAILABLE,
        message: 'This attorney cannot take the case.',
      });
    }
    const bid = await this.prisma.bid.findUnique({
      where: {
        case_id_attorney_id: { case_id: caseId, attorney_id: attorneyId },
      },
      select: { id: true },
    });
    if (bid) {
      throw new ConflictException({
        code: ErrorCode.BID_ALREADY_EXISTS,
        message: 'This attorney already sent a bid on this case.',
        details: { bidId: bid.id },
      });
    }

    const now = new Date();
    const [maxPending, maxPerDay, expiryDays] = await Promise.all([
      this.settings.number('invites.max_pending_per_case'),
      this.settings.number('invites.max_per_day'),
      this.settings.number('invites.expiry_days'),
    ]);
    const [pendingOnCase, sentToday] = await Promise.all([
      this.prisma.caseInvite.count({
        where: { case_id: caseId, status: 'pending', expires_at: { gt: now } },
      }),
      this.prisma.caseInvite.count({
        where: {
          client_id: user.sub,
          created_at: { gt: new Date(now.getTime() - DAY_MS) },
        },
      }),
    ]);
    if (pendingOnCase >= maxPending || sentToday >= maxPerDay) {
      throw new HttpException(
        {
          code: ErrorCode.INVITE_LIMIT_REACHED,
          message:
            pendingOnCase >= maxPending
              ? 'Too many attorneys are already invited to this case.'
              : 'Too many invites today. Try again tomorrow.',
          details: { maxPending, maxPerDay },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const data = {
      client_id: user.sub,
      status: 'pending',
      message: dto.message?.trim() || null,
      budget_cents: dto.budgetCents ?? null,
      decline_reason: null,
      outside_practice: !access.inPractice,
      outside_licensed_states: !access.inLicensedState,
      bid_id: null,
      expires_at: new Date(now.getTime() + Math.max(1, expiryDays) * DAY_MS),
      decided_at: null,
      created_at: now,
    };
    const invite = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.caseInvite.findUnique({
        where: {
          case_id_attorney_id: { case_id: caseId, attorney_id: attorneyId },
        },
      });
      if (existing && statusOf(existing, kase.status, now) === 'pending') {
        throw new ConflictException({
          code: ErrorCode.INVITE_ALREADY_PENDING,
          message: 'This attorney is already invited to this case.',
          details: { inviteId: existing.id },
        });
      }
      const row = existing
        ? await tx.caseInvite.update({
            where: { id: existing.id },
            data,
            include: INVITE_INCLUDE,
          })
        : await tx.caseInvite.create({
            data: { ...data, case_id: caseId, attorney_id: attorneyId },
            include: INVITE_INCLUDE,
          });
      await this.notifications.emit(
        {
          type: 'case_invite_received',
          recipientId: attorneyId,
          payload: { caseId, inviteId: row.id },
        },
        tx,
      );
      return row;
    });
    return this.toDto(invite, now, true);
  }

  /** GET /cases/:id/invites — the owner sees every invite on the case;
   * an attorney sees only their own (0 or 1). */
  async listForCase(
    user: RequestUser,
    caseId: string,
  ): Promise<CaseInviteDto[]> {
    const now = new Date();
    if (user.role === 'client') {
      const access = await this.caseAccess.decide(
        { userId: user.sub, role: 'client' },
        caseId,
      );
      if (access?.kind !== 'owner') throw caseNotFound();
      const rows = await this.prisma.caseInvite.findMany({
        where: { case_id: caseId },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: 100,
        include: INVITE_INCLUDE,
      });
      return Promise.all(rows.map((r) => this.toDto(r, now, true)));
    }
    if (user.role === 'attorney') {
      const row = await this.prisma.caseInvite.findUnique({
        where: {
          case_id_attorney_id: { case_id: caseId, attorney_id: user.sub },
        },
        include: INVITE_INCLUDE,
      });
      return row && !row.case.deleted_at
        ? [await this.toDto(row, now, false)]
        : [];
    }
    throw new ForbiddenException({
      code: ErrorCode.FORBIDDEN,
      message: 'Only the case owner or an invited attorney can see invites.',
    });
  }

  /** GET /invites — the attorney's invites, newest first. */
  async listForAttorney(
    user: RequestUser,
    query: InviteListQueryDto,
  ): Promise<CaseInvitePage> {
    assertAttorney(user);
    const now = new Date();
    const pendingOnly = (query.status ?? 'pending') === 'pending';
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.prisma.caseInvite.findMany({
      where: {
        attorney_id: user.sub,
        case: { deleted_at: null },
        ...(pendingOnly
          ? {
              status: 'pending',
              expires_at: { gt: now },
              case: { deleted_at: null, status: 'open' },
            }
          : {}),
        ...(cursor
          ? {
              OR: [
                { created_at: { lt: cursor.at } },
                { created_at: cursor.at, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: INVITES_PAGE_SIZE + 1,
      include: INVITE_INCLUDE,
    });
    const page = rows.slice(0, INVITES_PAGE_SIZE);
    const last = page[page.length - 1];
    return {
      items: await Promise.all(page.map((r) => this.toDto(r, now, false))),
      nextCursor:
        rows.length > INVITES_PAGE_SIZE && last
          ? encodeCursor(last.created_at, last.id)
          : null,
    };
  }

  /** GET /invites/:id — either side. */
  async get(user: RequestUser, id: string): Promise<CaseInviteDto> {
    const row = await this.load(id, user);
    return this.toDto(row, new Date(), user.role === 'client');
  }

  /** POST /invites/:id/decline (attorney). */
  async decline(
    user: RequestUser,
    id: string,
    dto: DeclineInviteDto,
  ): Promise<CaseInviteDto> {
    assertAttorney(user);
    const row = await this.load(id, user);
    const now = new Date();
    assertPending(row, now);
    const reason = dto.reason?.trim() || null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const n = await tx.caseInvite.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'declined', decline_reason: reason, decided_at: now },
      });
      if (n.count !== 1) throw invalidState('pending');
      await this.notifications.emit(
        {
          type: 'case_invite_declined',
          recipientId: row.client_id,
          payload: { caseId: row.case_id, inviteId: id, attorneyId: user.sub },
        },
        tx,
      );
      return tx.caseInvite.findUniqueOrThrow({
        where: { id },
        include: INVITE_INCLUDE,
      });
    });
    return this.toDto(updated, now, false);
  }

  /** POST /invites/:id/cancel (client, while pending). */
  async cancel(user: RequestUser, id: string): Promise<CaseInviteDto> {
    if (user.role !== 'client') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the client who sent the invite can cancel it.',
      });
    }
    const row = await this.load(id, user);
    const now = new Date();
    assertPending(row, now);
    const n = await this.prisma.caseInvite.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'cancelled', decided_at: now },
    });
    if (n.count !== 1) throw invalidState('pending');
    const updated = await this.prisma.caseInvite.findUniqueOrThrow({
      where: { id },
      include: INVITE_INCLUDE,
    });
    return this.toDto(updated, now, true);
  }

  /** The invite if the caller is its client or attorney; otherwise
   * INVITE_NOT_FOUND (no hint that it exists). */
  private async load(id: string, user: RequestUser): Promise<InviteRow> {
    const row = await this.prisma.caseInvite.findUnique({
      where: { id },
      include: INVITE_INCLUDE,
    });
    const mine =
      row &&
      !row.case.deleted_at &&
      ((user.role === 'client' && row.client_id === user.sub) ||
        (user.role === 'attorney' && row.attorney_id === user.sub));
    if (!row || !mine) {
      throw new NotFoundException({
        code: ErrorCode.INVITE_NOT_FOUND,
        message: 'Invite not found.',
      });
    }
    return row;
  }

  private async toDto(
    row: InviteRow,
    now: Date,
    withAttorney: boolean,
  ): Promise<CaseInviteDto> {
    let attorney: CaseInviteDto['attorney'] = null;
    if (withAttorney) {
      const a = await this.prisma.user.findUnique({
        where: { id: row.attorney_id },
        select: BID_LIST_INCLUDE.attorney.select,
      });
      if (a) {
        const avatar = await this.files.avatarUrls(a.avatar_file_id);
        attorney = toAttorneySummary(row.attorney_id, a, avatar.url256);
      }
    }
    const files = this.photos
      ? (await this.photos.counts([row.case_id])).get(row.case_id)
      : undefined;
    return {
      id: row.id,
      caseId: row.case_id,
      attorneyId: row.attorney_id,
      status: statusOf(row, row.case.status, now),
      message: row.message,
      budgetCents: row.budget_cents,
      declineReason: row.decline_reason,
      outsidePractice: row.outside_practice,
      outsideLicensedStates: row.outside_licensed_states,
      bidId: row.bid_id,
      expiresAt: row.expires_at.toISOString(),
      decidedAt: row.decided_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      caseTitle: row.case.title,
      caseStatus: row.case.status,
      casePracticeKey: row.case.practice_area.i18n_key,
      caseStateCodes: row.case.states.map((s) => s.state_code),
      caseCity: row.case.city,
      ...(({ urgency, urgencyLevel, deadlineAt, deadlineKind }) => ({
        caseUrgency: urgency,
        caseUrgencyLevel: urgencyLevel,
        caseDeadlineAt: deadlineAt,
        caseDeadlineKind: deadlineKind,
      }))(
        urgencyFields(
          row.case,
          now,
          await loadUrgencyThresholds(this.settings),
        ),
      ),
      caseBudget: {
        mode: row.case.budget_mode,
        amountCents: row.case.budget_cents,
      },
      caseDossier: {
        imagesCount: files?.images ?? 0,
        documentsCount: files?.documents ?? 0,
        descriptionLength: row.case.description.length,
      },
      attorney,
    };
  }
}

/** The status both sides see: a pending invite past its expiry is
 * `expired`; one on a case that no longer takes bids is `closed`. */
export function statusOf(
  row: { status: string; expires_at: Date },
  caseStatus: string,
  now: Date,
): InviteStatus {
  if (row.status !== 'pending') return row.status as InviteStatus;
  if (row.expires_at.getTime() <= now.getTime()) return 'expired';
  if (caseStatus !== 'open') return 'closed';
  return 'pending';
}

function assertAttorney(user: RequestUser): void {
  if (user.role !== 'attorney') {
    throw new ForbiddenException({
      code: ErrorCode.FORBIDDEN,
      message: 'Only attorneys have invites.',
    });
  }
}

function assertPending(row: InviteRow, now: Date): void {
  const status = statusOf(row, row.case.status, now);
  if (status !== 'pending') throw invalidState(status);
}

function invalidState(status: string): ConflictException {
  return new ConflictException({
    code: ErrorCode.INVITE_INVALID_STATE,
    message: 'This invite was already answered, cancelled or has expired.',
    details: { status },
  });
}

function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: at.toISOString(), id })).toString(
    'base64url',
  );
}

function decodeCursor(raw: string): { at: Date; id: string } {
  try {
    const { t, id } = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as { t?: unknown; id?: unknown };
    const at = typeof t === 'string' ? new Date(t) : null;
    if (at && !Number.isNaN(at.getTime()) && typeof id === 'string') {
      return { at, id };
    }
  } catch {
    // Fall through.
  }
  throw new HttpException(
    {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Invalid cursor.',
      details: { field: 'cursor' },
    },
    HttpStatus.BAD_REQUEST,
  );
}
