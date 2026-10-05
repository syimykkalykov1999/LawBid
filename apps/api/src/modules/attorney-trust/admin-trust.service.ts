import { Injectable, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import { AdminConfigService } from '../admin-config/admin-config.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import {
  COMPLAINT_REASONS,
  TRUST_ACTOR,
  TRUST_AUDIT_ACTION,
  TRUST_LEVELS,
} from './attorney-trust.constants';
import type {
  AdminTrustCardDto,
  RecomputeAllResultDto,
  TrustHoldDto,
  TrustHoldListItemDto,
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
  minLevelBids: 'trust.min_level_bids',
  minLevelPayments: 'trust.min_level_payments',
  minLevelBadge: 'trust.min_level_badge',
  payoutDelayDays: 'trust.payout_delay_days',
  payoutDelayUntilLevel: 'trust.payout_delay_until_level',
  autoHoldOnComplaint: 'trust.auto_hold_on_complaint',
  complaintsToSuspend: 'trust.complaints_to_suspend',
  complaintWindowDays: 'trust.complaint_window_days',
  autoHoldOnNameMismatch: 'trust.auto_hold_on_name_mismatch',
  flagDuplicateClaims: 'trust.flag_duplicate_claims',
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
      minLevelBids: await s.number(SETTING_KEYS.minLevelBids),
      minLevelPayments: await s.number(SETTING_KEYS.minLevelPayments),
      minLevelBadge: await s.number(SETTING_KEYS.minLevelBadge),
      payoutDelayDays: await s.number(SETTING_KEYS.payoutDelayDays),
      payoutDelayUntilLevel: await s.number(SETTING_KEYS.payoutDelayUntilLevel),
      autoHoldOnComplaint: await s.boolean(SETTING_KEYS.autoHoldOnComplaint),
      complaintsToSuspend: await s.number(SETTING_KEYS.complaintsToSuspend),
      complaintWindowDays: await s.number(SETTING_KEYS.complaintWindowDays),
      autoHoldOnNameMismatch: await s.boolean(
        SETTING_KEYS.autoHoldOnNameMismatch,
      ),
      flagDuplicateClaims: await s.boolean(SETTING_KEYS.flagDuplicateClaims),
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
    if (dto.minLevelBadge !== before.minLevelBadge) {
      void this.trust.recomputeAll();
    }
    return this.settingsDto();
  }

  async stats(): Promise<TrustStatsDto> {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [byLevel, held, withBadge, verified, complaints30d] =
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
    };
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
      badge: snap.badge,
      signals: snap.signals,
      holds: toHolds(snap),
      bidsGate: snap.gates.bids,
      paymentsGate: snap.gates.payments,
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

function actorOf(admin: AdminActor): TrustActor {
  return { type: TRUST_ACTOR.admin, id: admin.id };
}

function attorneyNotFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Attorney not found.',
  });
}
