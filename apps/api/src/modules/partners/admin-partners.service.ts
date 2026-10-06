import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Partner, type PartnerCommission } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import {
  normalizeReferralCode,
  REFERRAL_CODE_PATTERN,
} from '../referrals/referral-code.util';
import type {
  AdminPartnerAdjustmentDto,
  AdminPartnerCommissionRowDto,
  AdminPartnerCommissionsQueryDto,
  AdminPartnerDetailDto,
  AdminPartnerPayDto,
  AdminPartnerPayResultDto,
  AdminPartnerRowDto,
  AdminPartnersQueryDto,
  AdminPartnerStatsDto,
  AdminPartnerUserDto,
  CreatePartnerDto,
  LinkPartnerUserDto,
  PartnerSettingsDto,
  UpdatePartnerDto,
} from './partners.dto';
import {
  commissionDto,
  isUniqueViolation,
  PartnersService,
} from './partners.service';
import {
  PARTNER_SETTINGS_KEY,
  periodOf,
  type ClientRule,
  type PartnerProgramSettings,
  type PartnerStatus,
} from './partners.settings';

const PAGE = 50;

export const PARTNER_AUDIT = {
  settings: 'partners.settings',
  create: 'partners.create',
  update: 'partners.update',
  adjust: 'partners.adjust',
  pay: 'partners.pay',
  approve: 'partners.commission.approve',
  hold: 'partners.commission.hold',
  reverse: 'partners.commission.reverse',
  markPaid: 'partners.commission.pay',
  export: 'partners.export',
} as const;

type Page<T> = { items: T[]; nextCursor: string | null };

function invalidState(message: string): ConflictException {
  return new ConflictException({
    code: ErrorCode.PARTNER_INVALID_STATE,
    message,
  });
}
function notFound(what = 'Partner not found.'): NotFoundException {
  return new NotFoundException({ code: ErrorCode.NOT_FOUND, message: what });
}

const toJson = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

/** Owner 2026-10-05: the admin side of the partner program (Деньги →
 * Партнёры): who is a partner, their rates, who they brought, accruals,
 * approve / hold / reverse / pay, CSV. */
@Injectable()
export class AdminPartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partners: PartnersService,
    private readonly audit: AuditLogService,
  ) {}

  // ---- settings ---------------------------------------------------------

  getSettings(): Promise<PartnerProgramSettings> {
    return this.partners.settings();
  }

  async updateSettings(
    admin: AdminActor,
    dto: PartnerSettingsDto,
  ): Promise<PartnerProgramSettings> {
    const current = await this.partners.settings();
    const next: PartnerProgramSettings = {
      enabled: dto.enabled,
      joinMode: dto.joinMode ?? current.joinMode,
      attorneyRateCents: dto.attorneyRateCents,
      clientRateCents: dto.clientRateCents,
      clientRule: dto.clientRule,
      holdDays: dto.holdDays,
      requireW9: dto.requireW9 ?? current.requireW9,
      texts: { en: { ...dto.texts.en }, ru: { ...dto.texts.ru } },
    };
    const value = toJson(next);
    await withTxRetry(this.prisma, async (tx) => {
      const before = await tx.appConfig.findUnique({
        where: { key: PARTNER_SETTINGS_KEY },
      });
      await tx.appConfig.upsert({
        where: { key: PARTNER_SETTINGS_KEY },
        create: { key: PARTNER_SETTINGS_KEY, value },
        update: { value },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: PARTNER_AUDIT.settings,
          targetType: 'app_config',
          targetId: null,
          before: before?.value ?? null,
          after: value,
          ip: admin.ip,
        },
        tx,
      );
    });
    return next;
  }

  // ---- partners -----------------------------------------------------------

  async stats(): Promise<AdminPartnerStatsDto> {
    const [partners, active, pending, totals] = await Promise.all([
      this.prisma.partner.count(),
      this.prisma.partner.count({ where: { status: 'active' } }),
      this.prisma.partner.count({ where: { status: 'pending' } }),
      this.partners.totals(),
    ]);
    return {
      partners,
      active,
      pending,
      referredCount: totals.referredCount,
      heldCents: totals.heldCents,
      approvedCents: totals.approvedCents,
      paidCents: totals.paidCents,
      thisMonthCents: totals.thisMonthCents,
    };
  }

  async list(q: AdminPartnersQueryDto): Promise<Page<AdminPartnerRowDto>> {
    const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
    let userIds: string[] | undefined;
    if (q.q) {
      const needle = q.q.trim();
      const code = normalizeReferralCode(needle);
      const [users, codes] = await Promise.all([
        this.prisma.user.findMany({
          where: {
            OR: [
              { first_name: { contains: needle, mode: 'insensitive' } },
              { last_name: { contains: needle, mode: 'insensitive' } },
              { email: { contains: needle, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
          take: 200,
        }),
        REFERRAL_CODE_PATTERN.test(code)
          ? this.prisma.referralCode.findMany({
              where: { code: { contains: code } },
              select: { user_id: true },
              take: 50,
            })
          : Promise.resolve([]),
      ]);
      userIds = [
        ...new Set([...users.map((u) => u.id), ...codes.map((c) => c.user_id)]),
      ];
    }
    const filters: Prisma.PartnerWhereInput[] = [];
    if (q.status) filters.push({ status: q.status });
    if (q.q) {
      filters.push({
        OR: [
          { user_id: { in: userIds ?? [] } },
          { label: { contains: q.q, mode: 'insensitive' } },
        ],
      });
    }
    if (cursor) {
      filters.push({
        OR: [
          { created_at: { lt: cursor.createdAt } },
          { created_at: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }
    const rows = await this.prisma.partner.findMany({
      where: { AND: filters },
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

  async detail(id: string): Promise<AdminPartnerDetailDto> {
    const partner = await this.mustFind(id);
    const [row, referred, commissions] = await Promise.all([
      this.present([partner]),
      this.partners.referredOf(partner),
      this.prisma.partnerCommission.findMany({
        where: { partner_id: partner.id },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: 500,
      }),
    ]);
    return {
      partner: row[0],
      referred,
      commissions: await this.presentCommissions(commissions),
    };
  }

  async create(
    admin: AdminActor,
    dto: CreatePartnerDto,
  ): Promise<AdminPartnerRowDto> {
    // Owner 2026-10-05: a blogger without an app account gets a
    // placeholder user row (cannot sign in, hidden from the people lists)
    // so the code, the referrals and the commissions have an owner; the
    // real account is attached later with linkUser().
    const external = !dto.userId;
    if (external && !dto.externalName) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Give a user or the name of the partner without an account.',
        details: { field: 'externalName' },
      });
    }
    const userId =
      dto.userId ??
      (
        await this.prisma.user.create({
          data: {
            role: null,
            status: 'active',
            first_name: dto.externalName!.slice(0, 120),
            last_name: null,
            placeholder_kind: 'external_partner',
          },
          select: { id: true },
        })
      ).id;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, deleted_at: true },
    });
    if (!user || user.deleted_at || user.status === 'deleted') {
      throw notFound('User not found.');
    }
    const existing = await this.prisma.partner.findUnique({
      where: { user_id: userId },
    });
    if (existing && existing.status !== 'ended') {
      throw invalidState('This user is already a partner.');
    }
    const code = dto.code ? normalizeReferralCode(dto.code) : null;
    if (code && !REFERRAL_CODE_PATTERN.test(code)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'A code is 4–24 letters or digits.',
        details: { field: 'code' },
      });
    }
    const partner = await withTxRetry(this.prisma, async (tx) => {
      const data = {
        status: 'active',
        label: dto.label ?? null,
        note: dto.note ?? null,
        attorney_rate_cents: dto.attorneyRateCents ?? null,
        client_rate_cents: dto.clientRateCents ?? null,
        monthly_base_cents: dto.monthlyBaseCents ?? 0,
        client_rule: dto.clientRule ?? null,
        hold_days: dto.holdDays ?? null,
        created_by: admin.id,
        ended_at: null,
        external_name: external ? (dto.externalName ?? null) : null,
        external_contact: external ? (dto.externalContact ?? null) : null,
      };
      const row = existing
        ? await tx.partner.update({ where: { id: existing.id }, data })
        : await tx.partner.create({ data: { ...data, user_id: userId } });
      if (code) await this.setCode(tx, userId, code);
      await this.audit.record(
        {
          adminId: admin.id,
          action: PARTNER_AUDIT.create,
          targetType: 'partner',
          targetId: row.id,
          before: existing ? toJson(existing) : null,
          after: toJson({ ...row, code }),
          ip: admin.ip,
          justification: dto.reason,
        },
        tx,
      );
      return row;
    });
    return (await this.present([partner]))[0];
  }

  async update(
    admin: AdminActor,
    id: string,
    dto: UpdatePartnerDto,
  ): Promise<AdminPartnerRowDto> {
    const before = await this.mustFind(id);
    const data: Prisma.PartnerUpdateInput = {};
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.attorneyRateCents !== undefined)
      data.attorney_rate_cents = dto.attorneyRateCents;
    if (dto.clientRateCents !== undefined)
      data.client_rate_cents = dto.clientRateCents;
    if (dto.monthlyBaseCents !== undefined)
      data.monthly_base_cents = dto.monthlyBaseCents;
    if (dto.clientRule !== undefined) data.client_rule = dto.clientRule;
    if (dto.holdDays !== undefined) data.hold_days = dto.holdDays;
    // Owner 2026-10-05 (legal): the tax form arrived (or was cleared).
    if (dto.w9Received !== undefined) {
      data.w9_received_at = dto.w9Received
        ? (before.w9_received_at ?? new Date())
        : null;
    }
    if (dto.demoAccess !== undefined) data.demo_access = dto.demoAccess;
    if (dto.externalName !== undefined && before.external_name !== null) {
      data.external_name = dto.externalName;
    }
    if (dto.externalContact !== undefined && before.external_name !== null) {
      data.external_contact = dto.externalContact;
    }
    if (dto.status !== undefined && dto.status !== before.status) {
      data.status = dto.status;
      data.ended_at = dto.status === 'ended' ? new Date() : null;
    }
    const after = await withTxRetry(this.prisma, async (tx) => {
      const row = await tx.partner.update({ where: { id }, data });
      await this.audit.record(
        {
          adminId: admin.id,
          action: PARTNER_AUDIT.update,
          targetType: 'partner',
          targetId: id,
          before: toJson(before),
          after: toJson(row),
          ip: admin.ip,
          justification: dto.reason,
        },
        tx,
      );
      return row;
    });
    // A request answered: tell the person (approved → their link now works;
    // ended straight from pending → declined).
    if (before.status === 'pending' && after.status !== 'pending') {
      await this.partners.notifyJoinDecision(
        after,
        after.status === 'active' ? 'approved' : 'declined',
      );
    }
    return (await this.present([after]))[0];
  }

  /** A one-off bonus or deduction, approved at once. */
  async adjust(
    admin: AdminActor,
    id: string,
    dto: AdminPartnerAdjustmentDto,
  ): Promise<AdminPartnerCommissionRowDto> {
    const partner = await this.mustFind(id);
    if (dto.amountCents === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'The amount cannot be zero.',
        details: { field: 'amountCents' },
      });
    }
    const now = new Date();
    const row = await withTxRetry(this.prisma, async (tx) => {
      const c = await tx.partnerCommission.create({
        data: {
          partner_id: partner.id,
          partner_user_id: partner.user_id,
          kind: 'adjustment',
          amount_cents: dto.amountCents,
          status: 'approved',
          event_ref: `adjust:${partner.id}:${now.getTime()}:${admin.id.slice(0, 8)}`,
          period: periodOf(now),
          approved_at: now,
          approved_by: admin.id,
          note: dto.note,
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: PARTNER_AUDIT.adjust,
          targetType: 'partner_commission',
          targetId: c.id,
          before: null,
          after: toJson(c),
          ip: admin.ip,
          justification: dto.reason,
        },
        tx,
      );
      return c;
    });
    return (await this.presentCommissions([row]))[0];
  }

  /** Pays everything approved for one partner (optionally one period). */
  async pay(
    admin: AdminActor,
    id: string,
    dto: AdminPartnerPayDto,
  ): Promise<AdminPartnerPayResultDto> {
    const partner = await this.mustFind(id);
    const payable = await this.partners.listPayable(partner.id, dto.period);
    if (payable.length === 0) throw invalidState('Nothing approved to pay.');
    const total = payable.reduce((s, c) => s + c.amount_cents, 0);
    if (total <= 0) {
      throw invalidState(
        'The approved total is not positive (deductions outweigh accruals).',
      );
    }
    const res = await this.partners.markPaid(
      payable.map((c) => c.id),
      { payoutRef: dto.payoutRef ?? null, actorId: admin.id },
    );
    await this.audit.record({
      adminId: admin.id,
      action: PARTNER_AUDIT.pay,
      targetType: 'partner',
      targetId: partner.id,
      before: null,
      after: toJson({
        count: res.count,
        totalCents: res.totalCents,
        payoutRef: dto.payoutRef ?? null,
        period: dto.period ?? null,
        commissionIds: payable.map((c) => c.id),
      }),
      ip: admin.ip,
      justification: dto.reason,
    });
    return { count: res.count, totalCents: res.totalCents };
  }

  // ---- commissions ----------------------------------------------------------

  async listCommissions(
    q: AdminPartnerCommissionsQueryDto,
  ): Promise<Page<AdminPartnerCommissionRowDto>> {
    const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
    const rows = await this.prisma.partnerCommission.findMany({
      where: {
        ...(q.partnerId ? { partner_id: q.partnerId } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.kind ? { kind: q.kind } : {}),
        ...(q.period ? { period: q.period } : {}),
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
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    return {
      items: await this.presentCommissions(page),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async approve(
    admin: AdminActor,
    id: string,
    reason: string,
  ): Promise<AdminPartnerCommissionRowDto> {
    const before = await this.mustFindCommission(id);
    if (before.status !== 'held')
      throw invalidState('Only a held commission can be approved.');
    const now = new Date();
    return this.transition(admin, before, PARTNER_AUDIT.approve, reason, {
      status: 'approved',
      approved_at: now,
      approved_by: admin.id,
      hold_until: null,
    });
  }

  /** Puts an accrual on a manual hold (no automatic release). */
  async hold(
    admin: AdminActor,
    id: string,
    reason: string,
  ): Promise<AdminPartnerCommissionRowDto> {
    const before = await this.mustFindCommission(id);
    if (before.status !== 'approved' && before.status !== 'held')
      throw invalidState(
        'Only an approved or held commission can be put on hold.',
      );
    return this.transition(admin, before, PARTNER_AUDIT.hold, reason, {
      status: 'held',
      hold_until: null,
      approved_at: null,
      approved_by: null,
      note: reason.slice(0, 300),
    });
  }

  async reverse(
    admin: AdminActor,
    id: string,
    reason: string,
  ): Promise<AdminPartnerCommissionRowDto> {
    const before = await this.mustFindCommission(id);
    if (before.status === 'reversed')
      throw invalidState('This commission is already reversed.');
    const ok = await this.partners.reverseOne(id, reason, new Date(), admin.id);
    if (!ok) throw invalidState('The commission changed meanwhile.');
    const after = await this.mustFindCommission(id);
    await this.audit.record({
      adminId: admin.id,
      action: PARTNER_AUDIT.reverse,
      targetType: 'partner_commission',
      targetId: id,
      before: toJson(before),
      after: toJson(after),
      ip: admin.ip,
      justification: reason,
    });
    return (await this.presentCommissions([after]))[0];
  }

  async markPaid(
    admin: AdminActor,
    id: string,
    dto: AdminPartnerPayDto,
  ): Promise<AdminPartnerCommissionRowDto> {
    const before = await this.mustFindCommission(id);
    if (before.status !== 'approved')
      throw invalidState('Only an approved commission can be marked paid.');
    const res = await this.partners.markPaid([id], {
      payoutRef: dto.payoutRef ?? null,
      actorId: admin.id,
    });
    if (res.count === 0)
      throw invalidState('The commission changed meanwhile.');
    const after = await this.mustFindCommission(id);
    await this.audit.record({
      adminId: admin.id,
      action: PARTNER_AUDIT.markPaid,
      targetType: 'partner_commission',
      targetId: id,
      before: toJson(before),
      after: toJson(after),
      ip: admin.ip,
      justification: dto.reason,
    });
    return (await this.presentCommissions([after]))[0];
  }

  // ---- CSV ---------------------------------------------------------------

  async exportCsv(
    admin: AdminActor,
    q: AdminPartnerCommissionsQueryDto,
  ): Promise<string> {
    const rows = await this.prisma.partnerCommission.findMany({
      where: {
        ...(q.partnerId ? { partner_id: q.partnerId } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.kind ? { kind: q.kind } : {}),
        ...(q.period ? { period: q.period } : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 50_000,
    });
    const items = await this.presentCommissions(rows);
    const header = [
      'id',
      'period',
      'partner_id',
      'partner_name',
      'partner_email',
      'kind',
      'status',
      'amount_cents',
      'referred_user_id',
      'referred_name',
      'referred_role',
      'event_ref',
      'hold_until',
      'approved_at',
      'paid_at',
      'payout_ref',
      'reversed_at',
      'reversed_reason',
      'note',
      'created_at',
    ];
    const lines = [header.join(',')];
    for (const c of items) {
      lines.push(
        [
          c.id,
          c.period,
          c.partnerId,
          c.partner.name,
          c.partner.email,
          c.kind,
          c.status,
          c.amountCents,
          c.referredUserId,
          c.referredUser?.name ?? null,
          c.referredUser?.role ?? null,
          c.eventRef,
          c.holdUntil,
          c.approvedAt,
          c.paidAt,
          c.payoutRef,
          c.reversedAt,
          c.reversedReason,
          c.note,
          c.createdAt,
        ]
          .map(csvCell)
          .join(','),
      );
    }
    const csv = `${lines.join('\n')}\n`;
    await this.audit.record({
      adminId: admin.id,
      action: PARTNER_AUDIT.export,
      targetType: 'partner_commission',
      targetId: null,
      before: null,
      after: toJson({ rows: items.length, filters: q }),
      ip: admin.ip,
    });
    return csv;
  }

  // ---- helpers ------------------------------------------------------------

  private async mustFind(id: string): Promise<Partner> {
    const p = await this.prisma.partner.findUnique({ where: { id } });
    if (!p) throw notFound();
    return p;
  }

  private async mustFindCommission(id: string): Promise<PartnerCommission> {
    const c = await this.prisma.partnerCommission.findUnique({ where: { id } });
    if (!c) throw notFound('Commission not found.');
    return c;
  }

  private async transition(
    admin: AdminActor,
    before: PartnerCommission,
    action: string,
    reason: string,
    data: Prisma.PartnerCommissionUpdateManyMutationInput,
  ): Promise<AdminPartnerCommissionRowDto> {
    const after = await withTxRetry(this.prisma, async (tx) => {
      const res = await tx.partnerCommission.updateMany({
        where: { id: before.id, status: before.status },
        data,
      });
      if (res.count === 0)
        throw invalidState('The commission changed meanwhile.');
      const row = await tx.partnerCommission.findUniqueOrThrow({
        where: { id: before.id },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action,
          targetType: 'partner_commission',
          targetId: before.id,
          before: toJson(before),
          after: toJson(row),
          ip: admin.ip,
          justification: reason,
        },
        tx,
      );
      return row;
    });
    return (await this.presentCommissions([after]))[0];
  }

  /** Replaces the user's referral code with the admin's word. */
  private async setCode(
    tx: Prisma.TransactionClient,
    userId: string,
    code: string,
  ): Promise<void> {
    const taken = await tx.referralCode.findUnique({ where: { code } });
    if (taken && taken.user_id !== userId) {
      throw invalidState('This code belongs to someone else.');
    }
    try {
      await tx.referralCode.upsert({
        where: { user_id: userId },
        create: { user_id: userId, code },
        update: { code },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw invalidState('This code is taken.');
      throw e;
    }
  }

  private async users(
    ids: string[],
  ): Promise<Map<string, AdminPartnerUserDto>> {
    const unique = [...new Set(ids)];
    const rows = unique.length
      ? await this.prisma.user.findMany({
          where: { id: { in: unique } },
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            role: true,
          },
        })
      : [];
    const out = new Map<string, AdminPartnerUserDto>();
    for (const u of rows) {
      out.set(u.id, {
        id: u.id,
        name: [u.first_name, u.last_name].filter(Boolean).join(' ') || null,
        email: u.email,
        role: u.role,
      });
    }
    return out;
  }

  private async present(rows: Partner[]): Promise<AdminPartnerRowDto[]> {
    if (rows.length === 0) return [];
    const settings = await this.partners.settings();
    const users = await this.users(rows.map((r) => r.user_id));
    const codes = await this.prisma.referralCode.findMany({
      where: { user_id: { in: rows.map((r) => r.user_id) } },
    });
    const codeOf = new Map(codes.map((c) => [c.user_id, c.code]));
    const out: AdminPartnerRowDto[] = [];
    for (const p of rows) {
      const code =
        codeOf.get(p.user_id) ?? (await this.partners.ensureCode(p.user_id));
      out.push({
        id: p.id,
        user: users.get(p.user_id) ?? {
          id: p.user_id,
          name: null,
          email: null,
          role: null,
        },
        status: p.status as PartnerStatus,
        label: p.label,
        note: p.note,
        code,
        shareUrl: this.partners.shareUrl(code),
        rates: this.partners.rates(settings, p),
        attorneyRateCents: p.attorney_rate_cents,
        clientRateCents: p.client_rate_cents,
        clientRule: p.client_rule as ClientRule | null,
        holdDays: p.hold_days,
        totals: await this.partners.totals(p.id),
        createdAt: p.created_at.toISOString(),
        endedAt: p.ended_at?.toISOString() ?? null,
        termsAcceptedAt: p.terms_accepted_at?.toISOString() ?? null,
        termsVersion: p.terms_version,
        w9ReceivedAt: p.w9_received_at?.toISOString() ?? null,
        demoAccess: p.demo_access,
        external: p.external_name
          ? { name: p.external_name, contact: p.external_contact }
          : null,
      });
    }
    return out;
  }

  /** Owner 2026-10-05: the blogger registered — move the partner, the
   * code, the referrals and the commissions from the placeholder user to
   * the real account and retire the placeholder. */
  async linkUser(
    admin: AdminActor,
    id: string,
    dto: LinkPartnerUserDto,
  ): Promise<AdminPartnerRowDto> {
    const before = await this.prisma.partner.findUnique({ where: { id } });
    if (!before) throw notFound('Partner not found.');
    if (!before.external_name) {
      throw invalidState('This partner already has an account.');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: {
        id: true,
        status: true,
        deleted_at: true,
        placeholder_kind: true,
      },
    });
    if (
      !target ||
      target.deleted_at ||
      target.status === 'deleted' ||
      target.placeholder_kind
    ) {
      throw notFound('User not found.');
    }
    const taken = await this.prisma.partner.findUnique({
      where: { user_id: dto.userId },
    });
    if (taken && taken.id !== id) {
      throw invalidState('This user is already a partner.');
    }
    const placeholderId = before.user_id;
    const partner = await withTxRetry(this.prisma, async (tx) => {
      if (taken) await tx.partner.delete({ where: { id: taken.id } });
      await tx.referralCode.deleteMany({ where: { user_id: dto.userId } });
      await tx.referralCode.updateMany({
        where: { user_id: placeholderId },
        data: { user_id: dto.userId },
      });
      await tx.referral.updateMany({
        where: { referrer_id: placeholderId },
        data: { referrer_id: dto.userId },
      });
      await tx.partnerCommission.updateMany({
        where: { partner_user_id: placeholderId },
        data: { partner_user_id: dto.userId },
      });
      const row = await tx.partner.update({
        where: { id },
        data: {
          user_id: dto.userId,
          external_name: null,
          external_contact: null,
        },
      });
      await tx.user.update({
        where: { id: placeholderId },
        data: { status: 'deleted', deleted_at: new Date() },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: PARTNER_AUDIT.update,
          targetType: 'partner',
          targetId: row.id,
          before: toJson(before),
          after: toJson(row),
          ip: admin.ip,
          justification: dto.reason,
        },
        tx,
      );
      return row;
    });
    return (await this.present([partner]))[0];
  }

  private async presentCommissions(
    rows: PartnerCommission[],
  ): Promise<AdminPartnerCommissionRowDto[]> {
    if (rows.length === 0) return [];
    const users = await this.users(
      rows.flatMap((c) =>
        c.referred_user_id
          ? [c.partner_user_id, c.referred_user_id]
          : [c.partner_user_id],
      ),
    );
    const unknown = (id: string): AdminPartnerUserDto => ({
      id,
      name: null,
      email: null,
      role: null,
    });
    return rows.map((c) => ({
      ...commissionDto(c),
      partnerId: c.partner_id,
      partner: users.get(c.partner_user_id) ?? unknown(c.partner_user_id),
      referredUser: c.referred_user_id
        ? (users.get(c.referred_user_id) ?? unknown(c.referred_user_id))
        : null,
      eventRef: c.event_ref,
    }));
  }
}

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v) : v;
  // Neutralize spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
