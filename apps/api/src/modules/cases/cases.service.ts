import { notAvailable } from '../countries/countries.service';
import { CasePhotosService } from './services/case-photos.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { mineCaseWhere } from './mine/mine-filters';
import { ClientFraudService } from '../client-fraud/client-fraud.service';
import { SubscriptionAlertsService } from '../notifications/subscription-alerts.service';
import type { Case, CaseState, Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { RequestMeta } from '../auth/services/session.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { BidStateMachine } from '../bids/domain/bid-state-machine';
import { NotificationsService } from '../notifications/notifications.service';
import { OnboardingService } from '../users/services/onboarding.service';
import { CaseStateMachine, caseNotFound } from './domain/case-state-machine';
import {
  DEFAULT_URGENCY_THRESHOLDS,
  hasUrgencyInput,
  loadUrgencyThresholds,
  resolveUrgencyInput,
  UrgencyInputError,
  urgencyFields,
  type UrgencyInput,
  type UrgencyThresholds,
} from './domain/case-urgency';
import {
  validateCaseStates,
  type CaseStateInput,
} from './domain/case-states.rule';
import { assertNoContactInfo } from './domain/contact-detector';
import {
  ChatSystemMessages,
  type ChatChange,
} from '../chat/chat-system.service';
import { CaseJournalService } from '../journal/case-journal.service';
import { ReferralsService } from '../referrals/referrals.service';
import { EntitlementsService } from '../plans/entitlements.service';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  MY_CASES_PAGE_DEFAULT,
  type CreateCaseDto,
  type ListMyCasesQueryDto,
  type MyCasesFilter,
  type UpdateCaseDto,
} from './dto/case-requests.dto';
import type {
  CaseDto,
  CasePage,
  CaseSummaryDto,
} from './dto/case-responses.dto';

/** docs/04 §11.1 tab filters -> case_status values. */
const FILTER_STATUSES: Record<MyCasesFilter, Prisma.CaseWhereInput['status']> =
  {
    active: { in: ['open', 'in_progress', 'pending_completion', 'disputed'] },
    open: 'open',
    in_progress: { in: ['in_progress', 'pending_completion', 'disputed'] },
    archived: 'archived',
    closed: 'closed',
  };

const PRACTICE_AREA_SELECT = {
  id: true,
  code: true,
  name_en: true,
  i18n_key: true,
} satisfies Prisma.PracticeAreaSelect;

const CASE_DETAIL_INCLUDE = {
  practice_area: { select: PRACTICE_AREA_SELECT },
  states: { select: { state_code: true, is_primary: true } },
} satisfies Prisma.CaseInclude;

type CaseWithDetails = Case & {
  practice_area: {
    id: string;
    code: string;
    name_en: string;
    i18n_key: string;
  };
  states: Pick<CaseState, 'state_code' | 'is_primary'>[];
};

type CaseWithPracticeAndStates = Case & {
  practice_area: {
    id: string;
    code: string;
    name_en: string;
    i18n_key: string;
  };
  states: Pick<CaseState, 'is_primary'>[];
};

function forbidden(message: string): ForbiddenException {
  return new ForbiddenException({ code: ErrorCode.FORBIDDEN, message });
}

function validationError(
  message: string,
  details?: Record<string, unknown>,
): BadRequestException {
  return new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    details,
  });
}

function statesLocked(): ConflictException {
  return new ConflictException({
    code: ErrorCode.CASE_INVALID_STATE,
    message:
      'The practice area and states can only be changed before any bids arrive.',
    details: { reason: 'bids_exist' },
  });
}

/** docs/04 §3.2: budget is entered in whole dollars and stored in cents
 * (.cursorrules "Деньги только в центах"); `clarify_later` has no amount.
 * Pure and exported for direct unit testing — the DTO's @ValidateIf
 * already keeps the two in sync on the wire, this is the one place the
 * dollars -> cents conversion (and its defense-in-depth check) happens. */
export function budgetCentsOf(
  mode: 'amount' | 'clarify_later',
  amountDollars: number | undefined,
): number | null {
  if (mode === 'clarify_later') return null;
  if (!Number.isInteger(amountDollars) || (amountDollars as number) <= 0) {
    throw validationError('budgetAmountDollars is required for "amount".', {
      field: 'budgetAmountDollars',
    });
  }
  return (amountDollars as number) * 100;
}

/** The urgency columns for a request (400 VALIDATION_FAILED on a bad
 * date or `by_date` without one). */
export function urgencyColumnsOf(
  dto: UrgencyInput,
  current: Parameters<typeof resolveUrgencyInput>[1],
  now: Date = new Date(),
): ReturnType<typeof resolveUrgencyInput> {
  try {
    return resolveUrgencyInput(dto, current, now);
  } catch (e) {
    if (e instanceof UrgencyInputError) {
      throw validationError(e.message, { field: e.field });
    }
    throw e;
  }
}

/** Changed urgency columns of [current] (empty when nothing changes),
 * recording old → new in [diff] for the journal. */
export function urgencyDiff(
  dto: UrgencyInput,
  current: {
    urgency: string | null;
    deadline_at: Date | null;
    deadline_kind: string | null;
  },
  diff: Record<string, { old: unknown; new: unknown }>,
): Partial<ReturnType<typeof resolveUrgencyInput>> {
  const before = urgencyFields(current);
  const next = urgencyColumnsOf(
    dto,
    current as Parameters<typeof resolveUrgencyInput>[1],
  );
  const after = urgencyFields(next);
  const out: Partial<ReturnType<typeof resolveUrgencyInput>> = {};
  if (before.urgency !== after.urgency) {
    out.urgency = next.urgency;
    diff.urgency = { old: before.urgency, new: after.urgency };
  }
  if (before.deadlineAt !== after.deadlineAt) {
    out.deadline_at = next.deadline_at;
    diff.deadlineAt = { old: before.deadlineAt, new: after.deadlineAt };
  }
  if (before.deadlineKind !== after.deadlineKind) {
    out.deadline_kind = next.deadline_kind;
    diff.deadlineKind = { old: before.deadlineKind, new: after.deadlineKind };
  }
  return out;
}

function toCaseDto(
  kase: CaseWithDetails,
  t: UrgencyThresholds = DEFAULT_URGENCY_THRESHOLDS,
): CaseDto {
  return {
    id: kase.id,
    title: kase.title,
    description: kase.description,
    practiceArea: {
      id: kase.practice_area.id,
      code: kase.practice_area.code,
      nameEn: kase.practice_area.name_en,
      i18nKey: kase.practice_area.i18n_key,
    },
    primaryStateCode: kase.primary_state_code,
    states: kase.states.map((s) => ({
      stateCode: s.state_code,
      isPrimary: s.is_primary,
    })),
    city: kase.city,
    budgetMode: kase.budget_mode,
    budgetCents: kase.budget_cents,
    coverKey: kase.cover_key,
    ...urgencyFields(kase, new Date(), t),
    status: kase.status,
    viewCount: kase.view_count,
    bidsCount: kase.bids_count,
    createdAt: kase.created_at.toISOString(),
    lastActivityAt: kase.last_activity_at.toISOString(),
    archivedAt: kase.archived_at?.toISOString() ?? null,
    clientCompletedAt: kase.client_completed_at?.toISOString() ?? null,
    attorneyConfirmedAt: kase.attorney_confirmed_at?.toISOString() ?? null,
    autoCloseAt: kase.auto_close_at?.toISOString() ?? null,
    closedAt: kase.closed_at?.toISOString() ?? null,
    deletedAt: kase.deleted_at?.toISOString() ?? null,
    stalePromptSentAt: kase.stale_prompt_sent_at?.toISOString() ?? null,
  };
}

function toSummaryDto(
  kase: CaseWithPracticeAndStates,
  t: UrgencyThresholds = DEFAULT_URGENCY_THRESHOLDS,
): CaseSummaryDto {
  return {
    id: kase.id,
    title: kase.title,
    practiceArea: {
      id: kase.practice_area.id,
      code: kase.practice_area.code,
      nameEn: kase.practice_area.name_en,
      i18nKey: kase.practice_area.i18n_key,
    },
    primaryStateCode: kase.primary_state_code,
    additionalStateCount: kase.states.filter((s) => !s.is_primary).length,
    city: kase.city,
    status: kase.status,
    budgetMode: kase.budget_mode,
    budgetCents: kase.budget_cents,
    coverKey: kase.cover_key,
    ...urgencyFields(kase, new Date(), t),
    bidsCount: kase.bids_count,
    createdAt: kase.created_at.toISOString(),
    lastActivityAt: kase.last_activity_at.toISOString(),
  };
}

/**
 * docs/04_CASES_BIDS.md §3 (stage 4.2) — case creation and management from
 * the client's side. Every status change goes through CaseStateMachine
 * (.cursorrules); every mutation appends a case_journal row via
 * CaseJournalService.append() in the same transaction.
 */
@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly onboarding: OnboardingService,
    private readonly caseMachine: CaseStateMachine,
    private readonly bidMachine: BidStateMachine,
    private readonly journal: CaseJournalService,
    private readonly notifications: NotificationsService,
    private readonly chat: ChatSystemMessages,
    private readonly photos: CasePhotosService,
    @Optional() private readonly alerts?: SubscriptionAlertsService,
    // Owner 2026-10-02: a published case qualifies a client referral.
    @Optional() private readonly referrals?: ReferralsService,
    // Owner 2026-10-05 (plan builder): the client's open-cases limit.
    @Optional() private readonly entitlements?: EntitlementsService,
    // Owner 2026-10-05: urgency thresholds (admin settings).
    @Optional() private readonly settings?: AppSettingsService,
    // Owner 2026-10-05 (docs/CLIENT_FRAUD.md): a restricted account cannot
    // publish; the case text is a repeat-account signal.
    @Optional() private readonly fraud?: ClientFraudService,
  ) {}

  /** POST /cases (§3.1–§3.4). */
  async create(
    user: RequestUser,
    dto: CreateCaseDto,
    meta: RequestMeta,
  ): Promise<CaseDto> {
    await this.assertClientReady(user.sub);
    await this.fraud?.assertNotRestricted(user.sub);
    await this.assertUnderCaseLimit(user.sub);

    assertNoContactInfo({
      title: dto.title,
      description: dto.description,
      city: dto.city,
    });

    const states: CaseStateInput[] = [
      { stateCode: dto.primaryStateCode, isPrimary: true },
      ...(dto.additionalStateCodes ?? []).map((stateCode) => ({
        stateCode,
        isPrimary: false,
      })),
    ];
    validateCaseStates(states);
    await this.assertValidStateCodes(states.map((s) => s.stateCode));
    const practiceArea = await this.assertLeafPracticeArea(dto.practiceAreaId);
    const budgetCents = budgetCentsOf(dto.budgetMode, dto.budgetAmountDollars);
    const urgency = urgencyColumnsOf(dto, null);

    // OQ-031: the author's own clean case photos (count: admin, bug 17).
    const photoIds = dto.photoFileIds ?? [];
    await this.photos.assertAttachable(user.sub, photoIds);

    const consentGranted = await this.hasContactSharingConsent(user.sub);
    if (!consentGranted && dto.clientContactSharingConsent !== true) {
      throw new ForbiddenException({
        code: ErrorCode.CLIENT_CONTACT_SHARING_CONSENT_REQUIRED,
        message:
          'Agree that your contacts will be shared with the attorney whose bid you accept before posting a case.',
      });
    }

    const created = await withTxRetry(this.prisma, async (tx) => {
      const now = new Date();
      const kase = await tx.case.create({
        data: {
          client_id: user.sub,
          title: dto.title,
          description: dto.description,
          practice_area_id: dto.practiceAreaId,
          primary_state_code: dto.primaryStateCode,
          city: dto.city ?? null,
          budget_mode: dto.budgetMode,
          budget_cents: budgetCents,
          cover_key: dto.coverKey ?? null,
          ...urgency,
          status: 'open',
          last_activity_at: now,
        },
      });
      await tx.caseState.createMany({
        data: states.map((s) => ({
          case_id: kase.id,
          state_code: s.stateCode,
          is_primary: s.isPrimary,
        })),
      });
      await this.photos.attach(tx, kase.id, photoIds);
      await this.journal.append(tx, {
        caseId: kase.id,
        clientId: user.sub,
        actor: { userId: user.sub, role: 'client' },
        event: 'created',
        payload: {
          title: kase.title,
          practiceAreaId: kase.practice_area_id,
          states: states as unknown as Prisma.InputJsonArray,
          budgetMode: kase.budget_mode,
          budgetCents: kase.budget_cents,
        },
      });
      if (!consentGranted) {
        await tx.userConsent.create({
          data: {
            user_id: user.sub,
            consent_type: 'client_contact_sharing',
            granted: true,
            ip: meta.ip ?? null,
            device_id: meta.deviceId ?? null,
          },
        });
      }
      return kase;
    });
    // Owner 2026-09-30: attorneys who turned "New cases" alerts on.
    const alerts = this.alerts;
    alerts?.later(() => alerts.attorneysForCase(created.id));
    try {
      await this.referrals?.onQualifyingEvent(user.sub, 'case_published');
    } catch {
      // Referral bookkeeping never breaks case creation.
    }
    // Never throws; awaited so it does not outlive the request.
    await this.fraud?.onCaseCreated(
      user.sub,
      `${dto.title}\n${dto.description}`,
    );

    return toCaseDto(
      {
        ...created,
        practice_area: practiceArea,
        states: statesRows(states),
      },
      await this.thresholds(),
    );
  }

  /** PATCH /cases/:id (§3.5). */
  async update(
    user: RequestUser,
    caseId: string,
    dto: UpdateCaseDto,
  ): Promise<CaseDto> {
    this.assertClientRole(user);
    if (Object.keys(dto).length === 0) {
      throw validationError('Send at least one field to update.');
    }
    assertNoContactInfo({
      title: dto.title,
      description: dto.description,
      city: dto.city,
    });
    if (dto.budgetMode !== undefined) {
      budgetCentsOf(dto.budgetMode, dto.budgetAmountDollars);
    }

    const hasPracticeChange = dto.practiceAreaId !== undefined;
    const hasStatesChange =
      dto.primaryStateCode !== undefined ||
      dto.additionalStateCodes !== undefined;

    // Validated outside the transaction (read-only lookups); the
    // transaction itself re-checks bids_count before writing.
    const practiceArea = hasPracticeChange
      ? await this.assertLeafPracticeArea(dto.practiceAreaId as string)
      : null;
    // Owner 2026-10-05: files can be added/removed while the case is open.
    if (dto.photoFileIds) {
      await this.photos.assertAttachable(user.sub, dto.photoFileIds, caseId);
    }

    const updated = await withTxRetry(this.prisma, async (tx) => {
      const current = await tx.case.findUnique({
        where: { id: caseId },
        include: {
          states: { select: { state_code: true, is_primary: true } },
          photos: { orderBy: { position: 'asc' }, select: { file_id: true } },
        },
      });
      if (!current || current.client_id !== user.sub) throw caseNotFound();
      const currentFiles = current.photos.map((p) => p.file_id);
      const filesChanged =
        dto.photoFileIds !== undefined &&
        (dto.photoFileIds.length !== currentFiles.length ||
          dto.photoFileIds.some((id, i) => id !== currentFiles[i]));
      if ((hasPracticeChange || hasStatesChange) && current.bids_count > 0) {
        throw statesLocked();
      }

      let states: CaseStateInput[] | null = null;
      if (hasStatesChange) {
        const currentAdditional = current.states
          .filter((s) => !s.is_primary)
          .map((s) => s.state_code);
        const primary = dto.primaryStateCode ?? current.primary_state_code;
        const additional = dto.additionalStateCodes ?? currentAdditional;
        states = [
          { stateCode: primary, isPrimary: true },
          ...additional
            .filter((code) => code !== primary)
            .map((stateCode) => ({ stateCode, isPrimary: false })),
        ];
        validateCaseStates(states);
        await this.assertValidStateCodes(
          states.map((s) => s.stateCode),
          tx,
        );
      }

      const extra: Omit<Prisma.CaseUncheckedUpdateManyInput, 'status'> = {};
      const diff: Record<string, { old: unknown; new: unknown }> = {};
      if (dto.title !== undefined && dto.title !== current.title) {
        extra.title = dto.title;
        diff.title = { old: current.title, new: dto.title };
      }
      if (
        dto.description !== undefined &&
        dto.description !== current.description
      ) {
        extra.description = dto.description;
        diff.description = { old: current.description, new: dto.description };
      }
      if (dto.city !== undefined && dto.city !== current.city) {
        extra.city = dto.city;
        diff.city = { old: current.city, new: dto.city };
      }
      if (dto.budgetMode !== undefined) {
        const budgetCents = budgetCentsOf(
          dto.budgetMode,
          dto.budgetAmountDollars,
        );
        if (
          dto.budgetMode !== current.budget_mode ||
          budgetCents !== current.budget_cents
        ) {
          extra.budget_mode = dto.budgetMode;
          extra.budget_cents = budgetCents;
          diff.budget = {
            old: { mode: current.budget_mode, cents: current.budget_cents },
            new: { mode: dto.budgetMode, cents: budgetCents },
          };
        }
      }
      // Owner 2026-10-04: cover and urgency; null clears.
      if (dto.coverKey !== undefined && dto.coverKey !== current.cover_key) {
        extra.cover_key = dto.coverKey;
        diff.coverKey = { old: current.cover_key, new: dto.coverKey };
      }
      // Owner 2026-10-05: a level or a date.
      if (hasUrgencyInput(dto)) {
        Object.assign(extra, urgencyDiff(dto, current, diff));
      }
      if (
        hasPracticeChange &&
        dto.practiceAreaId !== current.practice_area_id
      ) {
        extra.practice_area_id = dto.practiceAreaId;
        diff.practiceAreaId = {
          old: current.practice_area_id,
          new: dto.practiceAreaId,
        };
      }
      if (filesChanged) {
        diff.files = {
          old: currentFiles.length,
          new: dto.photoFileIds!.length,
        };
      }
      if (states) {
        extra.primary_state_code = states[0].stateCode;
        diff.states = {
          old: current.states.map((s) => ({
            stateCode: s.state_code,
            isPrimary: s.is_primary,
          })),
          new: states,
        };
      }

      const { case: afterCase, plan } = await this.caseMachine.apply(tx, {
        caseId,
        action: 'client_edit',
        extra,
      });

      if (filesChanged) {
        await tx.casePhoto.deleteMany({ where: { case_id: caseId } });
        await this.photos.attach(tx, caseId, dto.photoFileIds!);
      }

      if (states) {
        await tx.caseState.deleteMany({ where: { case_id: caseId } });
        await tx.caseState.createMany({
          data: states.map((s) => ({
            case_id: caseId,
            state_code: s.stateCode,
            is_primary: s.isPrimary,
          })),
        });
      }

      if (Object.keys(diff).length > 0) {
        await this.journal.append(tx, {
          caseId,
          clientId: user.sub,
          actor: { userId: user.sub, role: 'client' },
          event: plan.event,
          payload: diff as unknown as Prisma.InputJsonObject,
        });
      }

      if (current.bids_count > 0 && Object.keys(diff).length > 0) {
        const activeBidders = await tx.bid.findMany({
          where: { case_id: caseId, status: 'active' },
          select: { attorney_id: true },
          distinct: ['attorney_id'],
        });
        for (const { attorney_id } of activeBidders) {
          await this.notifications.emit(
            {
              type: 'case_updated',
              recipientId: attorney_id,
              payload: { caseId },
            },
            tx,
          );
        }
      }

      return afterCase;
    });

    const finalPracticeArea =
      practiceArea ?? (await this.practiceAreaOf(updated.practice_area_id));
    const finalStates = await this.prisma.caseState.findMany({
      where: { case_id: caseId },
      select: { state_code: true, is_primary: true },
    });
    return toCaseDto(
      {
        ...updated,
        practice_area: finalPracticeArea,
        states: finalStates,
      },
      await this.thresholds(),
    );
  }

  /**
   * PATCH /cases/:id/urgency (owner 2026-10-05): the level or the date
   * alone. The client changes it while the case is open or in work; the
   * hired attorney too (they often learn the court date first). The other
   * side is told: the hired attorney or the client (`case_deadline_changed`),
   * or, on an open case, the attorneys with an active bid (`case_updated`).
   */
  async updateUrgency(
    user: RequestUser,
    caseId: string,
    dto: UrgencyInput,
  ): Promise<CaseDto> {
    if (!hasUrgencyInput(dto)) {
      throw validationError('Send urgency, deadlineAt or deadlineKind.');
    }
    if (user.role !== 'client' && user.role !== 'attorney') {
      throw forbidden('Only the client or the hired attorney can do this.');
    }
    const updated = await withTxRetry(this.prisma, async (tx) => {
      const current = await tx.case.findUnique({
        where: { id: caseId },
        include: { accepted_bid: { select: { attorney_id: true } } },
      });
      if (!current || current.deleted_at) throw caseNotFound();
      const hiredAttorney = current.accepted_bid?.attorney_id ?? null;
      const isClient = user.role === 'client' && current.client_id === user.sub;
      const isAttorney =
        user.role === 'attorney' &&
        hiredAttorney === user.sub &&
        current.status !== 'open';
      if (!isClient && !isAttorney) throw caseNotFound();

      const diff: Record<string, { old: unknown; new: unknown }> = {};
      const extra = urgencyDiff(dto, current, diff);
      const { case: afterCase, plan } = await this.caseMachine.apply(tx, {
        caseId,
        action: 'set_urgency',
        extra,
      });
      if (Object.keys(diff).length === 0) return afterCase;
      await this.journal.append(tx, {
        caseId,
        clientId: current.client_id,
        actor: { userId: user.sub, role: isClient ? 'client' : 'attorney' },
        event: plan.event,
        payload: diff as unknown as Prisma.InputJsonObject,
      });
      const deadlineAt = afterCase.deadline_at
        ? afterCase.deadline_at.toISOString().slice(0, 10)
        : null;
      if (current.status === 'open') {
        const bidders = await tx.bid.findMany({
          where: { case_id: caseId, status: 'active' },
          select: { attorney_id: true },
          distinct: ['attorney_id'],
        });
        for (const { attorney_id } of bidders) {
          await this.notifications.emit(
            {
              type: 'case_updated',
              recipientId: attorney_id,
              payload: { caseId },
            },
            tx,
          );
        }
      } else {
        const recipient = isClient ? hiredAttorney : current.client_id;
        if (recipient) {
          await this.notifications.emit(
            {
              type: 'case_deadline_changed',
              recipientId: recipient,
              payload: { caseId, actorId: user.sub, deadlineAt },
            },
            tx,
          );
        }
      }
      return afterCase;
    });
    return this.toFullDto(updated);
  }

  /** POST /cases/:id/close (§3.5 "Закрыть кейс"). */
  async close(user: RequestUser, caseId: string): Promise<CaseDto> {
    return this.transitionAndRejectBids(
      user,
      caseId,
      'client_close',
      'case_closed',
    );
  }

  /** DELETE /cases/:id (§3.5 "Удалить кейс", soft delete). */
  async remove(user: RequestUser, caseId: string): Promise<{ deleted: true }> {
    await this.transitionAndRejectBids(
      user,
      caseId,
      'client_delete',
      'case_deleted',
    );
    return { deleted: true };
  }

  /** POST /cases/:id/restore (§10.1 "Вернуть" from the archive). */
  async restore(user: RequestUser, caseId: string): Promise<CaseDto> {
    this.assertClientRole(user);
    const updated = await withTxRetry(this.prisma, async (tx) => {
      const current = await tx.case.findUnique({
        where: { id: caseId },
        select: { client_id: true },
      });
      if (!current || current.client_id !== user.sub) throw caseNotFound();
      const { case: afterCase, plan } = await this.caseMachine.apply(tx, {
        caseId,
        action: 'client_restore',
      });
      await this.journal.append(tx, {
        caseId,
        clientId: user.sub,
        actor: { userId: user.sub, role: 'client' },
        event: plan.event,
        payload: {},
      });
      return afterCase;
    });
    return this.toFullDto(updated);
  }

  /** POST /cases/:id/keep-alive (§10.2 "Да, актуален"). */
  async keepAlive(user: RequestUser, caseId: string): Promise<CaseDto> {
    this.assertClientRole(user);
    const updated = await withTxRetry(this.prisma, async (tx) => {
      const current = await tx.case.findUnique({
        where: { id: caseId },
        select: { client_id: true },
      });
      if (!current || current.client_id !== user.sub) throw caseNotFound();
      const { case: afterCase, plan } = await this.caseMachine.apply(tx, {
        caseId,
        action: 'client_keep_alive',
      });
      await this.journal.append(tx, {
        caseId,
        clientId: user.sub,
        actor: { userId: user.sub, role: 'client' },
        event: plan.event,
        payload: { keepAlive: true },
      });
      return afterCase;
    });
    return this.toFullDto(updated);
  }

  /** GET /users/me/cases?filter=&cursor= (§11.1, §15). */
  async listMine(
    user: RequestUser,
    query: ListMyCasesQueryDto,
  ): Promise<CasePage> {
    this.assertClientRole(user);
    const filter = query.filter ?? 'active';
    const limit = query.limit ?? MY_CASES_PAGE_DEFAULT;
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const rows = await this.prisma.case.findMany({
      where: {
        client_id: user.sub,
        status: FILTER_STATUSES[filter],
        // Owner 2026-09-30: search and filters in "Mine".
        ...mineCaseWhere(query),
        ...(cursor
          ? {
              OR: [
                { created_at: { lt: cursor.createdAt } },
                { created_at: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: CASE_DETAIL_INCLUDE,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const covers = await this.photos.coverUrls(
      page.map((k) => k.id),
      user.sub,
    );
    const t = await this.thresholds();
    return {
      items: page.map((k) => ({
        ...toSummaryDto(k, t),
        coverUrl: covers.get(k.id) ?? null,
      })),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  // --- helpers ---

  private assertClientRole(user: RequestUser): void {
    if (user.role !== 'client') {
      throw forbidden('Only clients can manage cases.');
    }
  }

  /** §2 matrix: verified contacts + completed onboarding before a client
   * can post a case. Account status (active vs suspended/deleted) is
   * already gated at the session layer for every authenticated route. */
  /** Owner 2026-10-05: the plan may cap open cases (0 = unlimited). */
  private async assertUnderCaseLimit(userId: string): Promise<void> {
    const limit = await this.entitlements?.limit(userId, 'max_active_cases');
    if (!limit || limit <= 0) return;
    const open = await this.prisma.case.count({
      where: { client_id: userId, status: 'open' },
    });
    if (open >= limit) {
      throw new ConflictException({
        code: ErrorCode.CASE_LIMIT_REACHED,
        message: 'Your plan allows no more open cases at once.',
        details: { limit, open },
      });
    }
  }

  private async assertClientReady(userId: string): Promise<void> {
    const me = await this.onboarding.getMe(userId);
    if (me.role !== 'client') throw forbidden('Only clients can post cases.');
    // The e-mail is required only when getMe says so (admin «Вход и письма
    // по почте» on and the client still in onboarding).
    const emailMissing = me.missing.includes('email_verified');
    if (!me.phoneVerified || emailMissing) {
      throw new ForbiddenException({
        code: ErrorCode.CLIENT_CONTACTS_INCOMPLETE,
        message: emailMissing
          ? 'Verify your phone and email before posting a case.'
          : 'Verify your phone before posting a case.',
        details: {
          missing: [
            ...(me.phoneVerified ? [] : ['phone_verified']),
            ...(emailMissing ? ['email_verified'] : []),
          ],
        },
      });
    }
    if (me.onboarding.completedAt === null) {
      throw new ForbiddenException({
        code: ErrorCode.ONBOARDING_INCOMPLETE,
        message: 'Finish onboarding before posting a case.',
      });
    }
  }

  private async hasContactSharingConsent(userId: string): Promise<boolean> {
    const latest = await this.prisma.userConsent.findFirst({
      where: { user_id: userId, consent_type: 'client_contact_sharing' },
      orderBy: { created_at: 'desc' },
      select: { granted: true },
    });
    return latest?.granted === true;
  }

  private async assertValidStateCodes(
    codes: string[],
    db: Pick<Prisma.TransactionClient, 'state'> = this.prisma,
  ): Promise<void> {
    const rows = await db.state.findMany({
      where: { code: { in: codes }, is_active: true },
      select: { code: true },
    });
    const valid = new Set(rows.map((r) => r.code));
    const invalid = codes.filter((c) => !valid.has(c));
    if (invalid.length > 0) {
      throw validationError('Unknown or inactive state.', {
        field: 'states',
        invalid,
      });
    }
    // Owner 2026-10-05: new cases only in switched-on countries.
    const closed = await db.state.findFirst({
      where: { code: { in: codes }, country: { is_enabled: false } },
      select: { country_code: true },
    });
    if (closed) throw notAvailable(closed.country_code);
  }

  private async assertLeafPracticeArea(
    id: string,
  ): Promise<{ id: string; code: string; name_en: string; i18n_key: string }> {
    const area = await this.prisma.practiceArea.findFirst({
      where: {
        id,
        is_active: true,
        parent_id: { not: null },
        parent: { is_active: true },
      },
      select: PRACTICE_AREA_SELECT,
    });
    if (!area) {
      throw validationError(
        'practiceAreaId must be an active specialization (a leaf).',
        { field: 'practiceAreaId' },
      );
    }
    return area;
  }

  private async practiceAreaOf(
    id: string,
  ): Promise<{ id: string; code: string; name_en: string; i18n_key: string }> {
    return this.prisma.practiceArea.findUniqueOrThrow({
      where: { id },
      select: PRACTICE_AREA_SELECT,
    });
  }

  async toFullDto(kase: Case): Promise<CaseDto> {
    const [practiceArea, states] = await Promise.all([
      this.practiceAreaOf(kase.practice_area_id),
      this.prisma.caseState.findMany({
        where: { case_id: kase.id },
        select: { state_code: true, is_primary: true },
      }),
    ]);
    return toCaseDto(
      { ...kase, practice_area: practiceArea, states },
      await this.thresholds(),
    );
  }

  /** Owner 2026-10-05: the admin's urgency thresholds (days left). */
  thresholds(): Promise<UrgencyThresholds> {
    return loadUrgencyThresholds(this.settings);
  }

  /** Shared body of close/delete: the state transition plus auto-rejecting
   * every still-active bid (§3.5, §7 step 5 pattern reused for the
   * client-initiated case). */
  private async transitionAndRejectBids(
    user: RequestUser,
    caseId: string,
    action: 'client_close' | 'client_delete',
    rejectReason: 'case_closed' | 'case_deleted',
  ): Promise<CaseDto> {
    this.assertClientRole(user);
    const chat: ChatChange[] = [];
    const updated = await withTxRetry(this.prisma, async (tx) => {
      chat.length = 0;
      const current = await tx.case.findUnique({
        where: { id: caseId },
        select: { client_id: true },
      });
      if (!current || current.client_id !== user.sub) throw caseNotFound();

      const { case: afterCase, plan } = await this.caseMachine.apply(tx, {
        caseId,
        action,
      });
      await this.journal.append(tx, {
        caseId,
        clientId: user.sub,
        actor: { userId: user.sub, role: 'client' },
        event: plan.event,
        payload: {},
      });

      const rejected = await this.bidMachine.applyToActive(
        tx,
        { caseId },
        'auto_reject',
      );
      for (const r of rejected) {
        await this.journal.append(tx, {
          caseId,
          clientId: user.sub,
          actor: { userId: user.sub, role: 'client' },
          attorneyId: r.attorney_id,
          event: r.plan.event,
          payload: { bidId: r.id, reason: rejectReason },
        });
        await this.notifications.emit(
          {
            type: 'bid_rejected',
            recipientId: r.attorney_id,
            payload: { caseId, bidId: r.id, reason: rejectReason },
          },
          tx,
        );
      }
      // OQ-048: assistants' bid drafts for this case can't be sent now.
      await tx.bidDraft.deleteMany({ where: { case_id: caseId } });
      // docs/04 §9: pre-acceptance chats become read-only ("Кейс закрыт").
      chat.push(
        ...(await this.chat.post(
          tx,
          { case_id: caseId, status: 'pre_acceptance' },
          'case_closed',
          { close: true },
        )),
      );
      return afterCase;
    });
    this.chat.publish(chat);
    return this.toFullDto(updated);
  }
}

function statesRows(
  states: CaseStateInput[],
): Pick<CaseState, 'state_code' | 'is_primary'>[] {
  return states.map((s) => ({
    state_code: s.stateCode,
    is_primary: s.isPrimary,
  }));
}
