import { Injectable, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import { AdminConfigService } from '../admin-config/admin-config.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import {
  BADGE_STATUSES,
  COMPLAINT_REASONS,
  TRUST_ACTOR,
  TRUST_AUDIT_ACTION,
  TRUST_LEVELS,
  type BadgeStatus,
  type TrustPreset,
} from './attorney-trust.constants';
import type { TrustSnapshot } from './attorney-trust.service';
import type {
  AdminTrustCardDto,
  BulkTrustDto,
  ClearedByItemDto,
  StaffAdminDto,
  StaffDecisionStatsDto,
  BulkTrustResultDto,
  DocumentRequestDto,
  RecomputeAllResultDto,
  TrustQueueItemDto,
  TrustAttorneyListItemDto,
  TrustHoldDto,
  TrustHoldListItemDto,
  TrustSetStatusDto,
  TrustSettingsDto,
  TrustStatsDto,
} from './attorney-trust.dto';
import {
  AttorneyTrustService,
  type TrustActor,
} from './attorney-trust.service';
import {
  registryLinks,
  toEventDto,
  toFirmLink,
  toHolds,
} from './trust-presenter';

/** app_config key ↔ settings DTO field. */
const SETTING_KEYS = {
  enabled: 'trust.enabled',
  manualReview: 'trust.manual_review',
  requireRegistry: 'trust.require_registry',
  requireIdentity: 'trust.require_identity',
  requireDocuments: 'trust.require_documents',
  bidsRequireCleared: 'trust.bids_require_cleared',
  payoutDelayDays: 'trust.payout_delay_days',
  autoHoldOnComplaint: 'trust.auto_hold_on_complaint',
  complaintsToSuspend: 'trust.complaints_to_suspend',
  complaintWindowDays: 'trust.complaint_window_days',
  autoHoldOnNameMismatch: 'trust.auto_hold_on_name_mismatch',
  flagDuplicateClaims: 'trust.flag_duplicate_claims',
  firmLinkAutoRegistry: 'trust.firm_link_auto_registry',
  firmLinkAutoEmail: 'trust.firm_link_auto_email',
} as const;

/** Admin → Верификация → «Уровни доверия». */
@Injectable()
export class AdminTrustService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trust: AttorneyTrustService,
    private readonly settings: AppSettingsService,
    private readonly config: AdminConfigService,
    private readonly audit: AuditLogService,
  ) {}

  async settingsDto(): Promise<TrustSettingsDto> {
    const s = this.settings;
    return {
      enabled: await s.boolean(SETTING_KEYS.enabled),
      manualReview: await s.boolean(SETTING_KEYS.manualReview),
      requireRegistry: await s.boolean(SETTING_KEYS.requireRegistry),
      requireIdentity: await s.boolean(SETTING_KEYS.requireIdentity),
      requireDocuments: await s.boolean(SETTING_KEYS.requireDocuments),
      bidsRequireCleared: await s.boolean(SETTING_KEYS.bidsRequireCleared),
      payoutDelayDays: await s.number(SETTING_KEYS.payoutDelayDays),
      autoHoldOnComplaint: await s.boolean(SETTING_KEYS.autoHoldOnComplaint),
      complaintsToSuspend: await s.number(SETTING_KEYS.complaintsToSuspend),
      complaintWindowDays: await s.number(SETTING_KEYS.complaintWindowDays),
      autoHoldOnNameMismatch: await s.boolean(
        SETTING_KEYS.autoHoldOnNameMismatch,
      ),
      flagDuplicateClaims: await s.boolean(SETTING_KEYS.flagDuplicateClaims),
      firmLinkAutoRegistry: await s.boolean(SETTING_KEYS.firmLinkAutoRegistry),
      firmLinkAutoEmail: await s.boolean(SETTING_KEYS.firmLinkAutoEmail),
    };
  }

  /** Writes each key through the validated, audited app_config path; a
   * changed badge / gate level recomputes everyone (background). */
  async updateSettings(
    admin: AdminActor,
    dto: TrustSettingsDto,
  ): Promise<TrustSettingsDto> {
    const before = await this.settingsDto();
    for (const [field, key] of Object.entries(SETTING_KEYS) as [
      keyof TrustSettingsDto,
      string,
    ][]) {
      if (dto[field] !== before[field]) {
        await this.config.updateConfig(admin, key, dto[field]);
      }
    }
    const gatesChanged = (
      [
        'enabled',
        'manualReview',
        'requireRegistry',
        'requireIdentity',
        'requireDocuments',
      ] as const
    ).some((f) => dto[f] !== before[f]);
    if (gatesChanged) {
      // Owner 2026-10-05 06:07: rules apply at once; attorneys who now
      // miss something are told.
      void this.trust.recomputeAll(200, { notifyNewlyRequired: true });
    }
    return this.settingsDto();
  }

  /**
   * One-click presets (owner 2026-10-05 06:07). `off` = «Выключить всё»:
   * the pre-trust mode. `all` = «Включить всё»: every check and staff
   * review on. The rest are graded sets; every key stays editable after.
   */
  async applyPreset(
    admin: AdminActor,
    preset: TrustPreset,
  ): Promise<TrustSettingsDto> {
    const before = await this.settingsDto();
    const next = presetSettings(preset, before);
    const after = await this.updateSettings(admin, next);
    await this.audit.record({
      adminId: admin.id,
      action: TRUST_AUDIT_ACTION.preset,
      targetType: 'app_config',
      targetId: null,
      before: { ...before },
      after: { preset, ...after },
      ip: admin.ip,
    });
    return after;
  }

  async stats(): Promise<TrustStatsDto> {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [byLevel, held, withBadge, verified, complaints30d, inQueue] =
      await Promise.all([
        this.prisma.attorneyProfile.groupBy({
          by: ['trust_level'],
          where: { verification_status: 'verified' },
          _count: { _all: true },
        }),
        this.prisma.attorneyTrust.count({
          where: {
            OR: [
              { payments_hold: { not: null } },
              { bids_hold: { not: null } },
            ],
          },
        }),
        this.prisma.attorneyProfile.count({ where: { trust_badge: true } }),
        this.prisma.attorneyProfile.count({
          where: { verification_status: 'verified' },
        }),
        this.prisma.report.count({
          where: {
            target_type: 'user',
            reason: { in: [...COMPLAINT_REASONS] },
            created_at: { gte: since },
          },
        }),
        this.trust.queue({ limit: 1000 }).then((q) => q.length),
      ]);
    const [rules, byStatus] = await Promise.all([
      this.trust.rules(),
      this.trust.countByStatus(),
    ]);
    const counts = new Map(byLevel.map((r) => [r.trust_level, r._count._all]));
    return {
      byLevel: TRUST_LEVELS.map((level) => ({
        level,
        attorneys: counts.get(level) ?? 0,
      })),
      held,
      withBadge,
      verified,
      complaints30d,
      // The badge follows clearance, so this is the cleared count.
      cleared: withBadge,
      inQueue,
      enabled: rules.enabled,
      manualReview: rules.manualReview,
      byStatus: BADGE_STATUSES.map((status) => ({
        status,
        attorneys: byStatus.get(status) ?? 0,
      })),
    };
  }

  /** «Галочки → Адвокаты»: every attorney with their badge status. */
  async list(opts: {
    status?: BadgeStatus | null;
    q?: string | null;
    limit?: number;
  }): Promise<TrustAttorneyListItemDto[]> {
    const snaps = await this.trust.list(opts);
    if (snaps.length === 0) return [];
    const [rows, admins] = await Promise.all([
      this.prisma.attorneyProfile.findMany({
        where: { user_id: { in: snaps.map((s) => s.attorneyId) } },
        select: {
          user_id: true,
          username: true,
          verification_status: true,
          user: { select: { first_name: true, last_name: true } },
        },
      }),
      this.admins(
        snaps
          .map((s) => s.staffClearedBy)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ]);
    const byId = new Map(rows.map((r) => [r.user_id, r]));
    const items: TrustAttorneyListItemDto[] = [];
    for (const snap of snaps) {
      const row = byId.get(snap.attorneyId);
      if (!row) continue;
      items.push({
        attorney: {
          id: row.user_id,
          firstName: row.user.first_name,
          lastName: row.user.last_name,
          username: row.username,
          verificationStatus: row.verification_status,
        },
        level: snap.level,
        badgeStatus: snap.badgeStatus,
        badge: snap.badge,
        missing: snap.missing,
        reasons: snap.queueReasons,
        holds: toHolds(snap),
        staffClearedAt: snap.staffClearedAt?.toISOString() ?? null,
        staffClearedBy: snap.staffClearedBy
          ? (admins.get(snap.staffClearedBy) ?? null)
          : null,
        documentsRequestedAt: snap.documentsRequestedAt?.toISOString() ?? null,
        complaintsTotal: snap.complaintsTotal,
      });
    }
    return items;
  }

  /**
   * Manual badge status (owner 2026-10-05): the same staff actions, chosen
   * by the status the admin wants, with a required reason; each one leaves
   * its own decision record and audit row.
   */
  async setStatus(
    admin: AdminActor,
    attorneyId: string,
    dto: TrustSetStatusDto,
  ): Promise<AdminTrustCardDto> {
    await this.exists(attorneyId);
    const before = await this.trust.snapshot(attorneyId);
    const actor = actorOf(admin);
    let after: TrustSnapshot | null;
    switch (dto.status) {
      case 'cleared':
        after = await this.trust.clearByStaff(attorneyId, actor, dto.note);
        break;
      case 'self_declared':
        after = await this.trust.unclearByStaff(attorneyId, actor, dto.note);
        break;
      case 'documents_requested':
        after = await this.trust.requestDocuments(
          attorneyId,
          actor,
          'custom',
          dto.note,
        );
        break;
      case 'rejected':
        after = await this.trust.rejectByStaff(attorneyId, actor, dto.note);
        break;
    }
    await this.audit.record({
      adminId: admin.id,
      action: TRUST_AUDIT_ACTION.setStatus,
      targetType: 'attorney_profile',
      targetId: attorneyId,
      before: { badgeStatus: before?.badgeStatus ?? null },
      after: {
        badgeStatus: after?.badgeStatus ?? null,
        requested: dto.status,
        note: dto.note,
      },
      ip: admin.ip,
    });
    return this.card(attorneyId);
  }

  /** The staff queue («Борьба с мошенниками»): who waits and why. */
  async queue(opts: {
    reason?: string | null;
    q?: string | null;
  }): Promise<TrustQueueItemDto[]> {
    const snaps = await this.trust.queue(opts);
    if (snaps.length === 0) return [];
    const rows = await this.prisma.attorneyProfile.findMany({
      where: { user_id: { in: snaps.map((s) => s.attorneyId) } },
      select: {
        user_id: true,
        username: true,
        verification_status: true,
        user: { select: { first_name: true, last_name: true } },
        licenses: {
          select: {
            state_code: true,
            bar_number: true,
            license_status: true,
            state: { select: { name: true } },
          },
          orderBy: { state_code: 'asc' },
        },
        verification_requests: {
          orderBy: { created_at: 'desc' },
          take: 1,
          select: {
            id: true,
            created_at: true,
            _count: { select: { documents: true } },
          },
        },
      },
    });
    const byId = new Map(rows.map((r) => [r.user_id, r]));
    const items: TrustQueueItemDto[] = [];
    for (const snap of snaps) {
      const row = byId.get(snap.attorneyId);
      if (!row) continue;
      const request = row.verification_requests[0];
      const since = [
        snap.holds.paymentsAt,
        snap.holds.bidsAt,
        snap.firmLink.at,
        snap.documentsRequestedAt,
        request?.created_at,
      ].filter((d): d is Date => d instanceof Date);
      items.push({
        attorney: {
          id: row.user_id,
          firstName: row.user.first_name,
          lastName: row.user.last_name,
          username: row.username,
          verificationStatus: row.verification_status,
        },
        level: snap.level,
        badgeStatus: snap.badgeStatus,
        reasons: snap.queueReasons,
        missing: snap.missing,
        signals: snap.signals,
        holds: toHolds(snap),
        stripeBusinessType: snap.stripe.businessType,
        stripeRepresentative: snap.stripe.representative,
        stripeCompanyName: snap.stripe.companyName,
        registryLinks: registryLinks(row.licenses),
        requestId: request?.id ?? null,
        documentsCount: request?._count.documents ?? 0,
        documentsRequestedAt: snap.documentsRequestedAt?.toISOString() ?? null,
        waitingSince: since.length
          ? new Date(Math.min(...since.map((d) => d.getTime()))).toISOString()
          : null,
      });
    }
    return items.sort((a, b) =>
      (a.waitingSince ?? '9').localeCompare(b.waitingSince ?? '9'),
    );
  }

  /** «Подтвердить»: staff vouch for the attorney; badge and payments open. */
  async clear(
    admin: AdminActor,
    attorneyId: string,
    note: string | null,
  ): Promise<AdminTrustCardDto> {
    await this.exists(attorneyId);
    const before = await this.trust.snapshot(attorneyId);
    const after = await this.trust.clearByStaff(
      attorneyId,
      actorOf(admin),
      note,
    );
    await this.record(
      admin,
      TRUST_AUDIT_ACTION.clear,
      attorneyId,
      before?.level,
      after?.level,
      note,
    );
    return this.card(attorneyId);
  }

  async unclear(
    admin: AdminActor,
    attorneyId: string,
    note: string | null,
  ): Promise<AdminTrustCardDto> {
    await this.exists(attorneyId);
    const before = await this.trust.snapshot(attorneyId);
    const after = await this.trust.unclearByStaff(
      attorneyId,
      actorOf(admin),
      note,
    );
    await this.record(
      admin,
      TRUST_AUDIT_ACTION.unclear,
      attorneyId,
      before?.level,
      after?.level,
      note,
    );
    return this.card(attorneyId);
  }

  /** «Запросить ещё»: a templated request for documents. */
  async requestDocuments(
    admin: AdminActor,
    attorneyId: string,
    dto: DocumentRequestDto,
  ): Promise<AdminTrustCardDto> {
    await this.exists(attorneyId);
    const before = await this.trust.snapshot(attorneyId);
    const after = await this.trust.requestDocuments(
      attorneyId,
      actorOf(admin),
      dto.template,
      dto.note ?? null,
    );
    await this.record(
      admin,
      TRUST_AUDIT_ACTION.requestDocuments,
      attorneyId,
      before?.level,
      after?.level,
      `${dto.template}${dto.note ? `: ${dto.note}` : ''}`,
    );
    return this.card(attorneyId);
  }

  /** «Отклонить»: the account is suspended, bids withdrawn. */
  async reject(
    admin: AdminActor,
    attorneyId: string,
    note: string | null,
  ): Promise<AdminTrustCardDto> {
    await this.exists(attorneyId);
    const before = await this.trust.snapshot(attorneyId);
    const after = await this.trust.rejectByStaff(
      attorneyId,
      actorOf(admin),
      note,
    );
    await this.record(
      admin,
      TRUST_AUDIT_ACTION.reject,
      attorneyId,
      before?.level,
      after?.level,
      note,
    );
    return this.card(attorneyId);
  }

  /** The same four actions on many attorneys at once (the queue's bulk bar). */
  async bulk(
    admin: AdminActor,
    dto: BulkTrustDto,
  ): Promise<BulkTrustResultDto> {
    const failed: string[] = [];
    let done = 0;
    const note = dto.note ?? null;
    for (const id of new Set(dto.attorneyIds)) {
      try {
        let snap: TrustSnapshot | null;
        switch (dto.action) {
          case 'clear':
            snap = await this.trust.clearByStaff(id, actorOf(admin), note);
            break;
          case 'request_documents':
            snap = await this.trust.requestDocuments(
              id,
              actorOf(admin),
              dto.template ?? 'custom',
              note,
            );
            break;
          case 'reject':
            snap = await this.trust.rejectByStaff(id, actorOf(admin), note);
            break;
          case 'release':
            snap = await this.trust.release(
              id,
              { payments: true, bids: true, note },
              actorOf(admin),
            );
            break;
        }
        if (!snap) {
          failed.push(id);
          continue;
        }
        done += 1;
      } catch {
        failed.push(id);
      }
    }
    await this.audit.record({
      adminId: admin.id,
      action: TRUST_AUDIT_ACTION.bulk,
      targetType: 'attorney_profile',
      targetId: null,
      before: { attorneyIds: dto.attorneyIds },
      after: {
        action: dto.action,
        template: dto.template ?? null,
        done,
        failed,
        note,
      },
      ip: admin.ip,
    });
    return { done, failed };
  }

  /** Attorneys with a hold, oldest hold first. */
  async holds(limit = 100): Promise<TrustHoldListItemDto[]> {
    const rows = await this.prisma.attorneyTrust.findMany({
      where: {
        OR: [{ payments_hold: { not: null } }, { bids_hold: { not: null } }],
      },
      take: limit,
      include: {
        attorney: {
          select: {
            user_id: true,
            username: true,
            verification_status: true,
            user: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });
    const items = rows.map((t) => {
      const times = [t.payments_hold_at, t.bids_hold_at].filter(
        (d): d is Date => d !== null,
      );
      const heldSince = times.length
        ? new Date(Math.min(...times.map((d) => d.getTime())))
        : t.updated_at;
      return {
        attorney: {
          id: t.attorney.user_id,
          firstName: t.attorney.user.first_name,
          lastName: t.attorney.user.last_name,
          username: t.attorney.username,
          verificationStatus: t.attorney.verification_status,
        },
        level: t.level,
        holds: {
          payments: t.payments_hold,
          paymentsAt: t.payments_hold_at?.toISOString() ?? null,
          bids: t.bids_hold,
          bidsAt: t.bids_hold_at?.toISOString() ?? null,
          note: t.hold_note,
        },
        complaintsTotal: t.complaints_total,
        heldSince: heldSince.toISOString(),
      };
    });
    return items.sort((a, b) => a.heldSince.localeCompare(b.heldSince));
  }

  async card(attorneyId: string): Promise<AdminTrustCardDto> {
    const row = await this.prisma.attorneyProfile.findUnique({
      where: { user_id: attorneyId },
      select: {
        user_id: true,
        username: true,
        verification_status: true,
        user: { select: { first_name: true, last_name: true } },
        licenses: {
          select: {
            state_code: true,
            bar_number: true,
            license_status: true,
            state: { select: { name: true } },
          },
          orderBy: { state_code: 'asc' },
        },
        verification_requests: {
          orderBy: { created_at: 'desc' },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!row) throw attorneyNotFound();
    const snap = await this.trust.recompute(attorneyId);
    if (!snap) throw attorneyNotFound();
    const events = await this.trust.events(attorneyId);
    return {
      attorney: {
        id: row.user_id,
        firstName: row.user.first_name,
        lastName: row.user.last_name,
        username: row.username,
        verificationStatus: row.verification_status,
      },
      level: snap.level,
      badgeStatus: snap.badgeStatus,
      badge: snap.badge,
      signals: snap.signals,
      holds: toHolds(snap),
      bidsGate: snap.gates.bids,
      paymentsGate: snap.gates.payments,
      cleared: snap.cleared,
      clearedBy: snap.clearedBy,
      staffClearedAt: snap.staffClearedAt?.toISOString() ?? null,
      staffClearedBy: snap.staffClearedBy
        ? ((await this.admins([snap.staffClearedBy])).get(
            snap.staffClearedBy,
          ) ?? null)
        : null,
      staffStatus: snap.staffStatus,
      queueReasons: snap.queueReasons,
      missing: snap.missing,
      requirements: snap.requirements,
      documentsRequestedAt: snap.documentsRequestedAt?.toISOString() ?? null,
      documentsRequestedTemplate: snap.documentsRequestedTemplate,
      stripeLegalName: snap.stripeLegalName,
      stripeBusinessType: snap.stripe.businessType,
      stripeCompanyName: snap.stripe.companyName,
      stripeCompanyDomain: snap.stripe.companyDomain,
      stripeRepresentative: snap.stripe.representative,
      firmLink: toFirmLink(snap),
      firmLinkNote: snap.firmLink.note,
      payoutDelayDays: snap.payoutDelayDays,
      complaintsTotal: snap.complaintsTotal,
      duplicateClaims: snap.duplicateClaims,
      registryLinks: registryLinks(row.licenses),
      latestRequestId: row.verification_requests[0]?.id ?? null,
      events: events.map(toEventDto),
    };
  }

  async confirmLicense(
    admin: AdminActor,
    attorneyId: string,
    note: string | null,
  ): Promise<AdminTrustCardDto> {
    await this.exists(attorneyId);
    const before = await this.trust.snapshot(attorneyId);
    const after = await this.trust.confirmLicenseByStaff(
      attorneyId,
      actorOf(admin),
      note,
    );
    await this.record(
      admin,
      TRUST_AUDIT_ACTION.confirmLicense,
      attorneyId,
      before?.level,
      after?.level,
      note,
    );
    return this.card(attorneyId);
  }

  async unconfirmLicense(
    admin: AdminActor,
    attorneyId: string,
    note: string | null,
  ): Promise<AdminTrustCardDto> {
    await this.exists(attorneyId);
    const before = await this.trust.snapshot(attorneyId);
    const after = await this.trust.unconfirmLicense(
      attorneyId,
      actorOf(admin),
      note,
    );
    await this.record(
      admin,
      TRUST_AUDIT_ACTION.unconfirmLicense,
      attorneyId,
      before?.level,
      after?.level,
      note,
    );
    return this.card(attorneyId);
  }

  async confirmDocuments(
    admin: AdminActor,
    attorneyId: string,
    note: string | null,
  ): Promise<AdminTrustCardDto> {
    await this.exists(attorneyId);
    const before = await this.trust.snapshot(attorneyId);
    const after = await this.trust.confirmDocuments(
      attorneyId,
      actorOf(admin),
      note,
    );
    await this.record(
      admin,
      TRUST_AUDIT_ACTION.confirmDocuments,
      attorneyId,
      before?.level,
      after?.level,
      note,
    );
    return this.card(attorneyId);
  }

  async confirmFirmLink(
    admin: AdminActor,
    attorneyId: string,
    note: string | null,
  ): Promise<AdminTrustCardDto> {
    await this.exists(attorneyId);
    const before = await this.trust.snapshot(attorneyId);
    const after = await this.trust.confirmFirmLink(
      attorneyId,
      actorOf(admin),
      note,
    );
    await this.record(
      admin,
      TRUST_AUDIT_ACTION.confirmFirmLink,
      attorneyId,
      before?.level,
      after?.level,
      note,
    );
    return this.card(attorneyId);
  }

  async hold(
    admin: AdminActor,
    attorneyId: string,
    dto: TrustHoldDto,
  ): Promise<AdminTrustCardDto> {
    await this.exists(attorneyId);
    const before = await this.trust.snapshot(attorneyId);
    await this.trust.hold(
      attorneyId,
      { payments: dto.payments, bids: dto.bids, note: dto.note ?? null },
      actorOf(admin),
    );
    await this.audit.record({
      adminId: admin.id,
      action: TRUST_AUDIT_ACTION.hold,
      targetType: 'attorney_profile',
      targetId: attorneyId,
      before: before ? { ...toHolds(before) } : null,
      after: { payments: dto.payments, bids: dto.bids, note: dto.note ?? null },
      ip: admin.ip,
    });
    return this.card(attorneyId);
  }

  async release(
    admin: AdminActor,
    attorneyId: string,
    dto: TrustHoldDto,
  ): Promise<AdminTrustCardDto> {
    await this.exists(attorneyId);
    const before = await this.trust.snapshot(attorneyId);
    await this.trust.release(
      attorneyId,
      { payments: dto.payments, bids: dto.bids, note: dto.note ?? null },
      actorOf(admin),
    );
    await this.audit.record({
      adminId: admin.id,
      action: TRUST_AUDIT_ACTION.release,
      targetType: 'attorney_profile',
      targetId: attorneyId,
      before: before ? { ...toHolds(before) } : null,
      after: { payments: dto.payments, bids: dto.bids, note: dto.note ?? null },
      ip: admin.ip,
    });
    return this.card(attorneyId);
  }

  async recompute(
    admin: AdminActor,
    attorneyId: string,
  ): Promise<AdminTrustCardDto> {
    await this.exists(attorneyId);
    await this.trust.recompute(attorneyId, actorOf(admin));
    return this.card(attorneyId);
  }

  async recomputeAll(admin: AdminActor): Promise<RecomputeAllResultDto> {
    const result = await this.trust.recomputeAll();
    await this.audit.record({
      adminId: admin.id,
      action: TRUST_AUDIT_ACTION.recompute,
      targetType: 'attorney_profile',
      targetId: null,
      after: result,
      ip: admin.ip,
    });
    return result;
  }

  /** Owner 2026-10-05: who approved whom, per admin. */
  async staffDecisions(period: {
    from?: string;
    to?: string;
  }): Promise<StaffDecisionStatsDto[]> {
    const rows = await this.trust.staffDecisions(datesOf(period));
    const admins = await this.admins(rows.map((r) => r.adminId));
    return rows.map((r) => ({
      admin: admins.get(r.adminId) ?? {
        id: r.adminId,
        name: null,
        email: null,
        role: null,
      },
      cleared: r.cleared,
      uncleared: r.uncleared,
      rejected: r.rejected,
      documentsRequested: r.documentsRequested,
      released: r.released,
      fastDecisions: r.fastDecisions,
      medianSecondsBetween: r.medianSecondsBetween,
      laterComplaints: r.laterComplaints,
      laterSuspended: r.laterSuspended,
      firstDecisionAt: r.firstDecisionAt.toISOString(),
      lastDecisionAt: r.lastDecisionAt.toISOString(),
    }));
  }

  /** The attorneys one admin cleared («кто одобрил» filter). */
  async clearedBy(
    adminId: string,
    period: { from?: string; to?: string } = {},
  ): Promise<ClearedByItemDto[]> {
    const rows = await this.trust.clearedBy(adminId, datesOf(period));
    return rows.map((r) => ({
      attorney: r.attorney,
      level: r.level,
      clearedAt: r.clearedAt.toISOString(),
      complaintsAfter: r.complaintsAfter,
      suspendedAfter: r.suspendedAfter,
      documentsSeen: r.documentsSeen,
    }));
  }

  private async admins(ids: string[]): Promise<Map<string, StaffAdminDto>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        admin_profile: { select: { admin_role: true } },
      },
    });
    return new Map(
      users.map((u) => [
        u.id,
        {
          id: u.id,
          name: [u.first_name, u.last_name].filter(Boolean).join(' ') || null,
          email: u.email,
          role: u.admin_profile?.admin_role ?? null,
        },
      ]),
    );
  }

  private async exists(attorneyId: string): Promise<void> {
    const row = await this.prisma.attorneyProfile.findUnique({
      where: { user_id: attorneyId },
      select: { user_id: true },
    });
    if (!row) throw attorneyNotFound();
  }

  private async record(
    admin: AdminActor,
    action: string,
    attorneyId: string,
    beforeLevel: number | undefined,
    afterLevel: number | undefined,
    note: string | null,
  ): Promise<void> {
    await this.audit.record({
      adminId: admin.id,
      action,
      targetType: 'attorney_profile',
      targetId: attorneyId,
      before: { level: beforeLevel ?? null },
      after: { level: afterLevel ?? null, note },
      ip: admin.ip,
    });
  }
}

/** ISO strings → Dates; an unparsable bound is ignored. */
function datesOf(p: { from?: string; to?: string }): {
  from?: Date;
  to?: Date;
} {
  const d = (v?: string) => {
    if (!v) return undefined;
    const t = new Date(v);
    return Number.isNaN(t.getTime()) ? undefined : t;
  };
  return { from: d(p.from), to: d(p.to) };
}

/** The settings a preset writes; everything else keeps its value. */
export function presetSettings(
  preset: TrustPreset,
  cur: TrustSettingsDto,
): TrustSettingsDto {
  switch (preset) {
    case 'off':
      return { ...cur, enabled: false };
    case 'soft':
      return {
        ...cur,
        enabled: true,
        manualReview: true,
        requireRegistry: true,
        requireIdentity: false,
        requireDocuments: false,
        bidsRequireCleared: false,
        payoutDelayDays: 0,
        autoHoldOnComplaint: true,
        complaintsToSuspend: 3,
        complaintWindowDays: 90,
        autoHoldOnNameMismatch: false,
        flagDuplicateClaims: true,
        firmLinkAutoRegistry: true,
        firmLinkAutoEmail: true,
      };
    case 'standard':
      return {
        ...cur,
        enabled: true,
        manualReview: true,
        requireRegistry: true,
        requireIdentity: true,
        requireDocuments: false,
        bidsRequireCleared: false,
        payoutDelayDays: 7,
        autoHoldOnComplaint: true,
        complaintsToSuspend: 2,
        complaintWindowDays: 90,
        autoHoldOnNameMismatch: true,
        flagDuplicateClaims: true,
        firmLinkAutoRegistry: true,
        firmLinkAutoEmail: true,
      };
    case 'strict':
      return {
        ...cur,
        enabled: true,
        manualReview: true,
        requireRegistry: true,
        requireIdentity: true,
        requireDocuments: true,
        bidsRequireCleared: true,
        payoutDelayDays: 14,
        autoHoldOnComplaint: true,
        complaintsToSuspend: 1,
        complaintWindowDays: 180,
        autoHoldOnNameMismatch: true,
        flagDuplicateClaims: true,
        firmLinkAutoRegistry: false,
        firmLinkAutoEmail: false,
      };
    case 'all':
      return {
        ...cur,
        enabled: true,
        manualReview: true,
        requireRegistry: true,
        requireIdentity: true,
        requireDocuments: true,
        bidsRequireCleared: true,
        payoutDelayDays: 14,
        autoHoldOnComplaint: true,
        complaintsToSuspend: 2,
        complaintWindowDays: 90,
        autoHoldOnNameMismatch: true,
        flagDuplicateClaims: true,
        firmLinkAutoRegistry: true,
        firmLinkAutoEmail: true,
      };
  }
}

function actorOf(admin: AdminActor): TrustActor {
  return { type: TRUST_ACTOR.admin, id: admin.id, ip: admin.ip };
}

function attorneyNotFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Attorney not found.',
  });
}
