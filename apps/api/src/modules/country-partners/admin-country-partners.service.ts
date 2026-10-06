import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CountryPartner, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AdminSessionService } from '../admin-auth/admin-session.service';
import {
  PARTNER_TEAM_MAX,
  parsePermissions,
  readPartner,
  storePermissions,
} from '../admin-auth/admin-permissions';
import {
  contractEnded,
  COUNTRY_PARTNERS_SETTINGS_KEY,
  percentToBps,
  readCountryPartnerSettings,
  readGoals,
} from './country-partners.rules';
import { CountryPartnersService } from './country-partners.service';
import type {
  CountryPartnerContractDto,
  CountryPartnerDetailDto,
  CountryPartnerGoalDto,
  CountryPartnerPortalDto,
  CountryPartnerRowDto,
  CountryPartnerStatus,
  CountryPartnerTeamMemberDto,
  CreateCountryPartnerDto,
  UpdateCountryPartnerDto,
} from './country-partners.dto';

export const COUNTRY_PARTNERS_AUDIT = {
  create: 'country_partners.create',
  update: 'country_partners.update',
  share: 'country_partners.set_share',
  payouts: 'country_partners.set_payouts',
  status: 'country_partners.set_status',
  contract: 'country_partners.contract_update',
  accept: 'country_partners.contract_accept',
} as const;

const TEAM_SELECT = {
  id: true,
  email: true,
  status: true,
  admin_profile: { select: { admin_role: true, permissions: true } },
  admin_credential: { select: { last_login_at: true } },
} as const;
type TeamRow = Prisma.UserGetPayload<{ select: typeof TEAM_SELECT }>;

/**
 * Owner 2026-10-06: Деньги → Партнёры стран (super admin only) and the
 * partner team's own page. Everything about money (share, payouts, turning
 * a partner back on) needs a fresh 2FA step-up in the controller; turning
 * off never waits for one. Every change is in the audit log.
 */
@Injectable()
export class AdminCountryPartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: CountryPartnersService,
    private readonly audit: AuditLogService,
    private readonly sessions: AdminSessionService,
  ) {}

  async list(): Promise<CountryPartnerRowDto[]> {
    const rows = await this.prisma.countryPartner.findMany({
      orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
      take: 200,
    });
    return Promise.all(rows.map((r) => this.row(r)));
  }

  async detail(id: string): Promise<CountryPartnerDetailDto> {
    const p = await this.load(id);
    const [row, goals, team, settlements, currentMonth] = await Promise.all([
      this.row(p),
      this.core.goals(p),
      this.team(p.id),
      this.core.settlements(p.id),
      this.core.currentMonth(p),
    ]);
    return {
      ...row,
      goals,
      team: team.map(member),
      settlements,
      currentMonth,
    };
  }

  /** New partner + their admin account (the lead) in one go. */
  async create(
    actor: AdminActor,
    dto: CreateCountryPartnerDto,
  ): Promise<CountryPartnerDetailDto> {
    if (dto.countryCode === 'US') {
      throw invalid('The United States stays with LawBid.');
    }
    const country = await this.prisma.country.findUnique({
      where: { code: dto.countryCode },
      select: { code: true },
    });
    if (!country) throw invalid('Unknown country.');
    const busy = await this.prisma.countryPartner.count({
      where: {
        country_code: dto.countryCode,
        status: { in: ['active', 'paused'] },
      },
    });
    if (busy > 0) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          'This country already has a partner. Disable them first to hand the country over.',
      });
    }
    const settings = await this.core.settings();
    const email = dto.email.trim().toLowerCase();
    const partnerId = randomUUID();
    const perms = storePermissions(PARTNER_TEAM_MAX, false, [dto.countryCode], {
      partnerId,
      lead: true,
    });
    await withTxRetry(this.prisma, async (tx) => {
      const taken = await tx.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException({
          code: ErrorCode.ADMIN_EMAIL_TAKEN,
          message: 'An account with this email already exists.',
        });
      }
      const lead = await tx.user.create({
        data: {
          role: 'admin',
          status: 'active',
          email,
          email_verified_at: new Date(),
          ui_language: 'en',
          country_code: dto.countryCode,
          admin_profile: {
            create: { admin_role: 'support', permissions: perms },
          },
        },
        select: { id: true },
      });
      await tx.countryPartner.create({
        data: {
          id: partnerId,
          country_code: dto.countryCode,
          name: dto.name,
          contact: dto.contact ?? null,
          lead_admin_id: lead.id,
          share_bps: percentToBps(dto.sharePercent),
          max_admins: dto.maxAdmins ?? settings.defaultMaxAdmins,
          contract_starts_at: dto.contractStartsAt ?? null,
          contract_ends_at: dto.contractEndsAt ?? null,
          goals: goalsJson(dto.goals ?? []),
          note: dto.note ?? null,
          created_by: actor.id,
        },
      });
      await this.audit.record(
        {
          adminId: actor.id,
          action: COUNTRY_PARTNERS_AUDIT.create,
          targetType: 'country_partner',
          targetId: partnerId,
          after: {
            country: dto.countryCode,
            name: dto.name,
            leadEmail: email,
            sharePercent: dto.sharePercent,
            maxAdmins: dto.maxAdmins ?? settings.defaultMaxAdmins,
          },
          ip: actor.ip,
        },
        tx,
      );
    });
    return this.detail(partnerId);
  }

  async update(
    actor: AdminActor,
    id: string,
    dto: UpdateCountryPartnerDto,
  ): Promise<CountryPartnerDetailDto> {
    const before = await this.load(id);
    const data: Prisma.CountryPartnerUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.contact !== undefined) data.contact = dto.contact;
    if (dto.maxAdmins !== undefined) data.max_admins = dto.maxAdmins;
    if (dto.contractStartsAt !== undefined)
      data.contract_starts_at = dto.contractStartsAt;
    if (dto.contractEndsAt !== undefined)
      data.contract_ends_at = dto.contractEndsAt;
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.goals !== undefined) {
      // Keep «already alerted» on goals that did not change.
      const old = readGoals(before.goals);
      data.goals = goalsJson(
        dto.goals.map((g) => ({
          ...g,
          alerted: old.some(
            (o) =>
              o.alerted &&
              o.metric === g.metric &&
              o.target === g.target &&
              o.deadline === g.deadline,
          ),
        })),
      );
    }
    await this.prisma.countryPartner.update({ where: { id }, data });
    await this.audit.record({
      adminId: actor.id,
      action: COUNTRY_PARTNERS_AUDIT.update,
      targetType: 'country_partner',
      targetId: id,
      before: {
        name: before.name,
        maxAdmins: before.max_admins,
        goals: before.goals,
        contractEndsAt: before.contract_ends_at?.toISOString() ?? null,
      },
      after: dto as unknown as Prisma.InputJsonValue,
      ip: actor.ip,
    });
    return this.detail(id);
  }

  /** Needs step-up (controller). Applies from the next settled month. */
  async setShare(
    actor: AdminActor,
    id: string,
    percent: number,
  ): Promise<CountryPartnerDetailDto> {
    const before = await this.load(id);
    const bps = percentToBps(percent);
    await this.prisma.countryPartner.update({
      where: { id },
      data: { share_bps: bps },
    });
    await this.audit.record({
      adminId: actor.id,
      action: COUNTRY_PARTNERS_AUDIT.share,
      targetType: 'country_partner',
      targetId: id,
      before: { sharePercent: before.share_bps / 100 },
      after: { sharePercent: bps / 100 },
      ip: actor.ip,
    });
    return this.detail(id);
  }

  /** On needs step-up (controller); off is immediate. */
  async setPayouts(
    actor: AdminActor,
    id: string,
    enabled: boolean,
  ): Promise<CountryPartnerDetailDto> {
    const before = await this.load(id);
    const after = await this.prisma.countryPartner.update({
      where: { id },
      data: { payouts_enabled: enabled },
    });
    if (enabled) await this.core.release(after);
    else await this.core.hold(id);
    await this.audit.record({
      adminId: actor.id,
      action: COUNTRY_PARTNERS_AUDIT.payouts,
      targetType: 'country_partner',
      targetId: id,
      before: { payoutsEnabled: before.payouts_enabled },
      after: { payoutsEnabled: enabled },
      ip: actor.ip,
    });
    return this.detail(id);
  }

  /**
   * active ↔ paused ↔ disabled. Paused: payouts wait, the team works.
   * Disabled: every team account is suspended and signed out at once,
   * payouts stop; the country and its people stay with LawBid. Back to
   * active brings back exactly the accounts this switch suspended.
   */
  async setStatus(
    actor: AdminActor,
    id: string,
    status: CountryPartnerStatus,
  ): Promise<CountryPartnerDetailDto> {
    const before = await this.load(id);
    if (before.status === status) return this.detail(id);
    // Owner 2026-10-06: an ended contract switches the partner off; it
    // comes back only after «Договор до» is moved forward.
    if (
      status !== 'disabled' &&
      contractEnded(before.contract_ends_at, new Date())
    ) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          'The contract has ended. Move «Договор до» forward first, then switch the partner on.',
      });
    }
    if (status !== 'disabled' && before.status === 'disabled') {
      const other = await this.prisma.countryPartner.count({
        where: {
          id: { not: id },
          country_code: before.country_code,
          status: { in: ['active', 'paused'] },
        },
      });
      if (other > 0) {
        throw new ConflictException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Another partner already runs this country.',
        });
      }
    }
    let suspended = before.suspended_admin_ids;
    if (status === 'disabled') {
      const team = await this.team(id);
      const active = team.filter((t) => t.status === 'active').map((t) => t.id);
      await this.prisma.user.updateMany({
        where: { id: { in: active } },
        data: { status: 'suspended' },
      });
      for (const a of active) await this.sessions.revokeAllForUser(a);
      suspended = [...new Set([...suspended, ...active])];
    } else if (before.status === 'disabled') {
      await this.prisma.user.updateMany({
        where: {
          id: { in: suspended },
          deleted_at: null,
          status: 'suspended',
        },
        data: { status: 'active' },
      });
      suspended = [];
    }
    const after = await this.prisma.countryPartner.update({
      where: { id },
      data: {
        status,
        suspended_admin_ids: suspended,
        ...(status !== 'disabled' ? { contract_expired_at: null } : {}),
        disabled_at:
          status === 'disabled'
            ? new Date()
            : before.status === 'disabled'
              ? null
              : before.disabled_at,
      },
    });
    if (status === 'active') await this.core.release(after);
    else await this.core.hold(id);
    await this.audit.record({
      adminId: actor.id,
      action: COUNTRY_PARTNERS_AUDIT.status,
      targetType: 'country_partner',
      targetId: id,
      before: { status: before.status },
      after: { status, signedOut: status === 'disabled' ? suspended : [] },
      ip: actor.ip,
    });
    return this.detail(id);
  }

  async contract(): Promise<CountryPartnerContractDto> {
    return (await this.core.settings()).contract;
  }

  /** A new text is a new version: every lead accepts it again. */
  async setContract(
    actor: AdminActor,
    text: string,
  ): Promise<CountryPartnerContractDto> {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: COUNTRY_PARTNERS_SETTINGS_KEY },
    });
    const cur = readCountryPartnerSettings(row?.value);
    const next = {
      ...cur,
      contract: {
        version: cur.contract.version + 1,
        text,
        updatedAt: new Date().toISOString(),
      },
    };
    await this.prisma.appConfig.upsert({
      where: { key: COUNTRY_PARTNERS_SETTINGS_KEY },
      update: { value: next },
      create: {
        key: COUNTRY_PARTNERS_SETTINGS_KEY,
        value: next,
      },
    });
    await this.audit.record({
      adminId: actor.id,
      action: COUNTRY_PARTNERS_AUDIT.contract,
      targetType: 'country_partner_contract',
      targetId: null,
      before: { version: cur.contract.version },
      after: { version: next.contract.version },
      ip: actor.ip,
    });
    return next.contract;
  }

  // ---- the partner's own page ------------------------------------------

  async portal(actor: AdminActor): Promise<CountryPartnerPortalDto> {
    const membership = actor.partner;
    if (!membership) throw notFound();
    const p = await this.load(membership.partnerId);
    const settings = await this.core.settings();
    const canSeeReport =
      membership.lead ||
      parsePermissions(
        (
          await this.prisma.adminProfile.findUnique({
            where: { user_id: actor.id },
            select: { permissions: true },
          })
        )?.permissions,
      ).partner_report !== undefined;
    const [row, goals, settlements, currentMonth] = await Promise.all([
      this.row(p),
      this.core.goals(p),
      canSeeReport ? this.core.settlements(p.id) : Promise.resolve([]),
      canSeeReport ? this.core.currentMonth(p) : Promise.resolve([]),
    ]);
    return {
      id: p.id,
      countryCode: p.country_code,
      countryName: row.countryName,
      name: p.name,
      status: p.status as CountryPartnerStatus,
      lead: membership.lead,
      sharePercent: p.share_bps / 100,
      maxAdmins: p.max_admins,
      teamSize: row.teamSize,
      payoutsEnabled: p.payouts_enabled,
      contractEndsAt: p.contract_ends_at?.toISOString() ?? null,
      contractPending: p.contract_version !== settings.contract.version,
      contract: settings.contract,
      goals,
      canSeeReport,
      settlements,
      currentMonth,
    };
  }

  async acceptContract(
    actor: AdminActor,
    version: number,
  ): Promise<CountryPartnerPortalDto> {
    if (!actor.partner?.lead) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the partner accepts the contract.',
      });
    }
    const settings = await this.core.settings();
    if (version !== settings.contract.version) {
      throw invalid('The contract has changed; reload the page.');
    }
    await this.prisma.countryPartner.update({
      where: { id: actor.partner.partnerId },
      data: {
        contract_version: version,
        contract_accepted_at: new Date(),
        contract_accepted_ip: actor.ip?.slice(0, 64) ?? null,
      },
    });
    await this.audit.record({
      adminId: actor.id,
      action: COUNTRY_PARTNERS_AUDIT.accept,
      targetType: 'country_partner',
      targetId: actor.partner.partnerId,
      after: { version },
      ip: actor.ip,
    });
    return this.portal(actor);
  }

  // ---- helpers ----------------------------------------------------------

  private async load(id: string): Promise<CountryPartner> {
    const p = await this.prisma.countryPartner.findUnique({ where: { id } });
    if (!p) throw notFound();
    return p;
  }

  private team(partnerId: string): Promise<TeamRow[]> {
    return this.prisma.user.findMany({
      where: {
        role: 'admin',
        deleted_at: null,
        admin_profile: {
          permissions: { path: ['country_partner'], equals: partnerId },
        },
      },
      select: TEAM_SELECT,
      orderBy: { created_at: 'asc' },
      take: 200,
    });
  }

  private async row(p: CountryPartner): Promise<CountryPartnerRowDto> {
    const [country, lead, team] = await Promise.all([
      this.prisma.country.findUnique({
        where: { code: p.country_code },
        select: { name: true },
      }),
      this.prisma.user.findUnique({
        where: { id: p.lead_admin_id },
        select: { email: true },
      }),
      this.team(p.id),
    ]);
    return {
      id: p.id,
      countryCode: p.country_code,
      countryName: country?.name ?? p.country_code,
      name: p.name,
      contact: p.contact,
      leadAdminId: p.lead_admin_id,
      leadEmail: lead?.email ?? '',
      sharePercent: p.share_bps / 100,
      status: p.status as CountryPartnerStatus,
      maxAdmins: p.max_admins,
      teamSize: team.filter(
        (t) => !readPartner(t.admin_profile?.permissions)?.lead,
      ).length,
      payoutsEnabled: p.payouts_enabled,
      contractStartsAt: p.contract_starts_at?.toISOString() ?? null,
      contractEndsAt: p.contract_ends_at?.toISOString() ?? null,
      contractVersion: p.contract_version,
      contractAcceptedAt: p.contract_accepted_at?.toISOString() ?? null,
      note: p.note,
      createdAt: p.created_at.toISOString(),
    };
  }
}

function member(t: TeamRow): CountryPartnerTeamMemberDto {
  return {
    id: t.id,
    email: t.email ?? '',
    role: t.admin_profile?.admin_role ?? 'support',
    status: t.status === 'active' ? 'active' : 'disabled',
    lead: readPartner(t.admin_profile?.permissions)?.lead ?? false,
    permissions: parsePermissions(t.admin_profile?.permissions),
    lastLoginAt: t.admin_credential?.last_login_at?.toISOString() ?? null,
  };
}

function goalsJson(
  goals: (CountryPartnerGoalDto & { alerted?: boolean })[],
): Prisma.InputJsonValue {
  return readGoals(goals) as unknown as Prisma.InputJsonValue;
}

const invalid = (message: string) =>
  new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message });

const notFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Not found.' });
