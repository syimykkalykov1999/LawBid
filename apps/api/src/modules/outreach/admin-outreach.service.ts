import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type OutreachTemplate, type Partner } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { leadsFromCsv, type ParsedLead } from './lead-csv';
import { leadsFromRegistry, NyRegistrySource } from './ny-registry.source';
import type {
  OutreachActivityInputDto,
  OutreachAssignDto,
  OutreachAssignResultDto,
  OutreachContextDto,
  OutreachImportQueryDto,
  OutreachImportReportDto,
  OutreachLeadDetailDto,
  OutreachLeadInputDto,
  OutreachLeadRowDto,
  OutreachLeadsQueryDto,
  OutreachPartnerStatsDto,
  OutreachRegistryImportDto,
  OutreachSendEmailDto,
  OutreachSendEmailResultDto,
  OutreachSettingsDto,
  OutreachStatsDto,
  OutreachStatsQueryDto,
  OutreachSuppressionsAddDto,
  OutreachSuppressionsAddResultDto,
  OutreachSuppressionsDto,
  OutreachTemplateDto,
  OutreachTemplateInputDto,
} from './outreach.dto';
import {
  blockMessage,
  clientsDisabled,
  contactBlocked,
  contactState,
  invalidState,
  newUnsubscribeToken,
  OutreachService,
  type LeadWithPartner,
  type OutreachScope,
} from './outreach.service';
import {
  normalizeEmail,
  normalizePhone,
  normalizeState,
  OUTREACH_SETTINGS_KEY,
  STATUS_AFTER_CALL,
  SYSTEM_STATUSES,
  type LeadStatus,
  type OutreachSettings,
} from './outreach.settings';

const PAGE = 50;

export const OUTREACH_AUDIT = {
  settings: 'outreach.settings',
  importCsv: 'outreach.import.csv',
  importRegistry: 'outreach.import.registry',
  assign: 'outreach.assign',
  leadCreate: 'outreach.lead.create',
  leadUpdate: 'outreach.lead.update',
  templateSave: 'outreach.template.save',
  export: 'outreach.export',
  suppressionsAdd: 'outreach.suppressions.add',
} as const;

/** Stop-list entry shown in the admin: all but the last 4 characters hidden. */
export function maskSuppression(value: string): string {
  const tail = value.slice(-4);
  return `${'•'.repeat(Math.max(0, Math.min(value.length - 4, 8)))}${tail}`;
}

type Page<T> = { items: T[]; nextCursor: string | null };
const toJson = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

function managerOnly(scope: OutreachScope): void {
  if (!scope.manager) {
    throw new ForbiddenException({
      code: ErrorCode.FORBIDDEN,
      message: 'Only a manager may do this; employees work their own leads.',
    });
  }
}

/** Owner 2026-10-05: the admin side of outreach (Привлечение). */
@Injectable()
export class AdminOutreachService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: OutreachService,
    private readonly audit: AuditLogService,
    private readonly registry: NyRegistrySource,
  ) {}

  // ---- context & settings ---------------------------------------------------

  async context(admin: AdminActor): Promise<OutreachContextDto> {
    const scope = await this.core.scopeFor(admin);
    const partners = await this.prisma.partner.findMany({
      where: { status: 'active' },
      orderBy: { created_at: 'asc' },
      take: 500,
    });
    const dtos = await this.core.partnerDtos(
      scope.partner ? [...partners, scope.partner] : partners,
    );
    const settings = await this.core.settings();
    return {
      scope: scope.partner ? (dtos.get(scope.partner.id) ?? null) : null,
      manager: scope.manager,
      partners: partners.map((p) => dtos.get(p.id)!).filter(Boolean),
      settings,
      emailsLeftToday: await this.core.emailsLeftToday(scope, admin.id),
    };
  }

  async updateSettings(
    admin: AdminActor,
    dto: OutreachSettingsDto,
  ): Promise<OutreachSettings> {
    // Owner 2026-10-05 (legal): the compliance fields are optional on PUT
    // (omitted = keep the stored value); consumer leads only after the
    // owner has confirmed the Do-Not-Call scrub; the call window must be
    // a range.
    const current = await this.core.settings();
    const pick = <K extends keyof OutreachSettings>(
      k: K,
    ): OutreachSettings[K] => (dto[k] ?? current[k]) as OutreachSettings[K];
    const next: OutreachSettings = {
      dailyEmailLimit: dto.dailyEmailLimit,
      fromName: dto.fromName,
      footerAddress: dto.footerAddress,
      apiPublicUrl: dto.apiPublicUrl.replace(/\/+$/, ''),
      clientLeadsEnabled: pick('clientLeadsEnabled'),
      dncConfirmed: pick('dncConfirmed'),
      dncSan: pick('dncSan'),
      callHoursStart: pick('callHoursStart'),
      callHoursEnd: pick('callHoursEnd'),
      maxEmailsPerLead: pick('maxEmailsPerLead'),
      emailCooldownDays: pick('emailCooldownDays'),
      leadRetentionDays: pick('leadRetentionDays'),
    };
    if (next.clientLeadsEnabled && !next.dncConfirmed) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          'clientLeadsEnabled requires dncConfirmed: confirm the National Do-Not-Call check first.',
      });
    }
    if (next.callHoursStart >= next.callHoursEnd) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'callHoursStart must be before callHoursEnd.',
      });
    }
    const value = toJson(next);
    await withTxRetry(this.prisma, async (tx) => {
      const before = await tx.appConfig.findUnique({
        where: { key: OUTREACH_SETTINGS_KEY },
      });
      await tx.appConfig.upsert({
        where: { key: OUTREACH_SETTINGS_KEY },
        create: { key: OUTREACH_SETTINGS_KEY, value },
        update: { value },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: OUTREACH_AUDIT.settings,
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

  // ---- leads ----------------------------------------------------------------

  /** The same filters for the list and the CSV export. */
  private leadFilters(
    scope: OutreachScope,
    q: OutreachLeadsQueryDto,
  ): Prisma.OutreachLeadWhereInput[] {
    const filters: Prisma.OutreachLeadWhereInput[] = [
      this.core.scopeWhere(scope),
    ];
    if (q.status) filters.push({ status: q.status });
    if (q.kind) filters.push({ kind: q.kind });
    if (q.partnerId && scope.manager) filters.push({ partner_id: q.partnerId });
    if (q.assigned === 'none' && scope.manager)
      filters.push({ partner_id: null });
    if (q.state) filters.push({ state_code: q.state.toUpperCase() });
    if (q.due)
      filters.push({
        next_action_at: { lte: new Date() },
        status: { notIn: ['paid', 'lost'] },
      });
    if (q.q) {
      const needle = q.q.trim();
      const digits = needle.replace(/\D/g, '');
      filters.push({
        OR: [
          { first_name: { contains: needle, mode: 'insensitive' } },
          { last_name: { contains: needle, mode: 'insensitive' } },
          { company: { contains: needle, mode: 'insensitive' } },
          { email: { contains: needle.toLowerCase() } },
          ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
        ],
      });
    }
    return filters;
  }

  async list(
    admin: AdminActor,
    q: OutreachLeadsQueryDto,
  ): Promise<Page<OutreachLeadRowDto>> {
    const scope = await this.core.scopeFor(admin);
    const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
    const filters = this.leadFilters(scope, q);
    if (cursor) {
      filters.push({
        OR: [
          { created_at: { lt: cursor.createdAt } },
          { created_at: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }
    const rows = await this.prisma.outreachLead.findMany({
      where: { AND: filters },
      include: { partner: true },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    return {
      items: await this.core.presentLeads(page),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async detail(admin: AdminActor, id: string): Promise<OutreachLeadDetailDto> {
    const scope = await this.core.scopeFor(admin);
    return this.core.presentDetail(await this.core.leadFor(scope, id));
  }

  private async partnerOrThrow(id: string): Promise<Partner> {
    const p = await this.prisma.partner.findUnique({ where: { id } });
    if (!p || p.status === 'ended') {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Partner not found or ended.',
      });
    }
    return p;
  }

  private contactOf(dto: { email?: string | null; phone?: string | null }) {
    const email =
      dto.email === undefined ? undefined : normalizeEmail(dto.email);
    const phone =
      dto.phone === undefined ? undefined : normalizePhone(dto.phone);
    if (dto.email && email === null) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'email is not an address.',
      });
    }
    if (dto.phone && phone === null) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'phone is not a phone number.',
      });
    }
    return { email, phone };
  }

  async create(
    admin: AdminActor,
    dto: OutreachLeadInputDto,
  ): Promise<OutreachLeadDetailDto> {
    const scope = await this.core.scopeFor(admin);
    const { email, phone } = this.contactOf(dto);
    if (!email && !phone) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'A lead needs an email or a phone.',
      });
    }
    const kind = dto.kind ?? 'attorney';
    // Owner 2026-10-05 (legal): consumers only when switched on, and
    // always with a note of where the contact came from / the consent.
    if (kind === 'client') {
      const settings = await this.core.settings();
      if (!settings.clientLeadsEnabled) throw clientsDisabled();
      if (!dto.sourceNote) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message:
            'sourceNote is required for a client lead: where the contact came from and why we may write.',
        });
      }
    }
    if (await this.isSuppressed(email ?? null, phone ?? null)) {
      throw contactBlocked(
        'This email or phone is on the stop-list (do not contact).',
      );
    }
    // An employee's lead is their own; a manager picks the partner.
    const partnerId = scope.partner
      ? scope.partner.id
      : dto.partnerId
        ? (await this.partnerOrThrow(dto.partnerId)).id
        : null;
    const dup = await this.prisma.outreachLead.findFirst({
      where: {
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
      select: { id: true },
    });
    if (dup)
      throw invalidState('A lead with this email or phone already exists.');
    const now = new Date();
    const row = await this.prisma.outreachLead.create({
      data: {
        kind,
        first_name: dto.firstName ?? null,
        last_name: dto.lastName ?? null,
        company: dto.company ?? null,
        state_code: dto.stateCode ? normalizeState(dto.stateCode) : null,
        city: dto.city ?? null,
        practice: dto.practice ?? null,
        phone: phone ?? null,
        email: email ?? null,
        source: 'manual',
        status: 'new',
        partner_id: partnerId,
        unsubscribe_token: newUnsubscribeToken(),
        note: dto.note ?? null,
        source_note: dto.sourceNote ?? null,
        next_action_at: dto.nextActionAt ? new Date(dto.nextActionAt) : null,
        created_by: admin.id,
        ...(dto.doNotContact
          ? { do_not_contact_at: now, do_not_contact_reason: 'manual' }
          : {}),
      },
      include: { partner: true },
    });
    if (dto.doNotContact) {
      await this.core.log(this.prisma, row, {
        kind: 'system',
        outcome: 'do_not_contact',
        body: 'Marked do-not-contact (manual)',
        actorAdminId: admin.id,
        now,
      });
    }
    await this.audit.record({
      adminId: admin.id,
      action: OUTREACH_AUDIT.leadCreate,
      targetType: 'outreach_lead',
      targetId: row.id,
      before: null,
      after: toJson({ id: row.id, email, phone, partnerId }),
      ip: admin.ip,
    });
    return this.core.presentDetail(row);
  }

  async update(
    admin: AdminActor,
    id: string,
    dto: OutreachLeadInputDto,
  ): Promise<OutreachLeadDetailDto> {
    const scope = await this.core.scopeFor(admin);
    const lead = await this.core.leadFor(scope, id);
    const { email, phone } = this.contactOf(dto);
    const data: Prisma.OutreachLeadUpdateInput = {};
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.firstName !== undefined) data.first_name = dto.firstName;
    if (dto.lastName !== undefined) data.last_name = dto.lastName;
    if (dto.company !== undefined) data.company = dto.company;
    if (dto.stateCode !== undefined)
      data.state_code = dto.stateCode ? normalizeState(dto.stateCode) : null;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.practice !== undefined) data.practice = dto.practice;
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.sourceNote !== undefined) data.source_note = dto.sourceNote;
    if (dto.nextActionAt !== undefined)
      data.next_action_at = dto.nextActionAt
        ? new Date(dto.nextActionAt)
        : null;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = phone;
    if (dto.kind === 'client' && lead.kind !== 'client') {
      const settings = await this.core.settings();
      if (!settings.clientLeadsEnabled) throw clientsDisabled();
    }
    // Owner 2026-10-05 (legal): do-not-contact is never cleared by a
    // plain edit; only an explicit `doNotContact: false` by a manager.
    if (dto.doNotContact === false && lead.do_not_contact_at)
      managerOnly(scope);
    if (dto.partnerId !== undefined) {
      managerOnly(scope);
      const partner = dto.partnerId
        ? await this.partnerOrThrow(dto.partnerId)
        : null;
      data.partner = partner
        ? { connect: { id: partner.id } }
        : { disconnect: true };
    }
    const after = await withTxRetry(this.prisma, async (tx) => {
      try {
        await tx.outreachLead.update({ where: { id }, data });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw invalidState('Another lead already has this email or phone.');
        }
        throw e;
      }
      if (dto.partnerId !== undefined && dto.partnerId !== lead.partner_id) {
        await this.core.log(
          tx,
          { id, partner_id: dto.partnerId },
          {
            kind: 'assign',
            outcome: dto.partnerId ? 'assigned' : 'unassigned',
            actorAdminId: admin.id,
          },
        );
      }
      if (dto.doNotContact === true) {
        await this.core.markDoNotContact(tx, lead, 'manual', {
          actorAdminId: admin.id,
        });
      } else if (dto.doNotContact === false && lead.do_not_contact_at) {
        await tx.outreachLead.update({
          where: { id },
          data: { do_not_contact_at: null, do_not_contact_reason: null },
        });
        await this.core.log(tx, lead, {
          kind: 'system',
          outcome: 'contact_allowed',
          body: `Do-not-contact removed (was: ${lead.do_not_contact_reason ?? 'manual'})`,
          actorAdminId: admin.id,
        });
      }
      if (dto.status && dto.status !== lead.status) {
        if (SYSTEM_STATUSES.includes(dto.status)) {
          throw invalidState(
            'registered and paid are set by the system from the referral code.',
          );
        }
        const fresh = await tx.outreachLead.findUniqueOrThrow({
          where: { id },
        });
        // The admin may set any manual status, including backwards.
        await tx.outreachLead.update({
          where: { id },
          data: { status: dto.status },
        });
        await this.core.log(tx, fresh, {
          kind: 'status',
          outcome: dto.status,
          body: `${fresh.status} → ${dto.status}`,
          actorAdminId: admin.id,
        });
      }
      await this.audit.record(
        {
          adminId: admin.id,
          action: OUTREACH_AUDIT.leadUpdate,
          targetType: 'outreach_lead',
          targetId: id,
          before: toJson({
            status: lead.status,
            partnerId: lead.partner_id,
            email: lead.email,
            phone: lead.phone,
            doNotContact: !!lead.do_not_contact_at,
            sourceNote: lead.source_note,
          }),
          after: toJson({ ...dto }),
          ip: admin.ip,
        },
        tx,
      );
      return tx.outreachLead.findUniqueOrThrow({
        where: { id },
        include: { partner: true },
      });
    });
    return this.core.presentDetail(after);
  }

  async assign(
    admin: AdminActor,
    dto: OutreachAssignDto,
  ): Promise<OutreachAssignResultDto> {
    const scope = await this.core.scopeFor(admin);
    managerOnly(scope);
    const partner = dto.partnerId
      ? await this.partnerOrThrow(dto.partnerId)
      : null;
    const updated = await withTxRetry(this.prisma, async (tx) => {
      const leads = await tx.outreachLead.findMany({
        where: { id: { in: dto.leadIds } },
        select: { id: true, partner_id: true },
      });
      const changed = leads.filter(
        (l) => l.partner_id !== (partner?.id ?? null),
      );
      if (changed.length === 0) return 0;
      await tx.outreachLead.updateMany({
        where: { id: { in: changed.map((l) => l.id) } },
        data: { partner_id: partner?.id ?? null },
      });
      const now = new Date();
      await tx.outreachActivity.createMany({
        data: changed.map((l) => ({
          lead_id: l.id,
          partner_id: partner?.id ?? null,
          actor_admin_id: admin.id,
          kind: 'assign',
          outcome: partner ? 'assigned' : 'unassigned',
          created_at: now,
        })),
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: OUTREACH_AUDIT.assign,
          targetType: 'outreach_lead',
          targetId: null,
          before: null,
          after: toJson({
            partnerId: partner?.id ?? null,
            leadIds: changed.map((l) => l.id),
          }),
          ip: admin.ip,
        },
        tx,
      );
      return changed.length;
    });
    return { updated };
  }

  async addActivity(
    admin: AdminActor,
    id: string,
    dto: OutreachActivityInputDto,
  ): Promise<OutreachLeadDetailDto> {
    const scope = await this.core.scopeFor(admin);
    const lead = await this.core.leadFor(scope, id);
    if (dto.kind === 'call' && !dto.outcome) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'A call needs an outcome.',
      });
    }
    if (dto.kind === 'call') {
      // Owner 2026-10-05 (legal): no call log outside the rules — the
      // number is hidden in the UI for the same reasons.
      const settings = await this.core.settings();
      const state = contactState(lead, settings);
      if (state.callBlocked) {
        throw contactBlocked(blockMessage(state.callBlocked, state, settings));
      }
    }
    await withTxRetry(this.prisma, async (tx) => {
      // An employee who works an unassigned lead takes it.
      if (!lead.partner_id && scope.partner) {
        await tx.outreachLead.update({
          where: { id },
          data: { partner_id: scope.partner.id },
        });
        lead.partner_id = scope.partner.id;
      }
      await this.core.log(tx, lead, {
        kind: dto.kind,
        outcome: dto.outcome ?? null,
        body: dto.body ?? null,
        actorAdminId: admin.id,
      });
      if (dto.nextActionAt !== undefined) {
        await tx.outreachLead.update({
          where: { id },
          data: {
            next_action_at: dto.nextActionAt
              ? new Date(dto.nextActionAt)
              : null,
          },
        });
      }
      if (dto.kind === 'call' && dto.outcome) {
        const next = STATUS_AFTER_CALL[dto.outcome];
        await this.core.moveStatus(
          tx,
          lead,
          next ?? (lead.status as LeadStatus),
          { actorAdminId: admin.id },
        );
        // "Not interested" / "wrong number" is a do-not-contact request.
        if (
          dto.outcome === 'not_interested' ||
          dto.outcome === 'wrong_number'
        ) {
          await this.core.markDoNotContact(tx, lead, dto.outcome, {
            actorAdminId: admin.id,
          });
        }
      }
    });
    return this.core.presentDetail(await this.core.leadFor(scope, id));
  }

  async sendEmail(
    admin: AdminActor,
    id: string,
    dto: OutreachSendEmailDto,
  ): Promise<OutreachSendEmailResultDto> {
    const scope = await this.core.scopeFor(admin);
    const lead = await this.core.leadFor(scope, id);
    const template = await this.prisma.outreachTemplate.findUnique({
      where: { id: dto.templateId },
    });
    if (!template)
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Template not found.',
      });
    return this.core.sendEmail(admin, scope, lead, template);
  }

  // ---- imports ----------------------------------------------------------------

  /** Is this email or phone on the stop-list? */
  private async isSuppressed(
    email: string | null,
    phone: string | null,
  ): Promise<boolean> {
    if (!email && !phone) return false;
    const hit = await this.prisma.outreachSuppression.findFirst({
      where: {
        OR: [
          ...(email ? [{ kind: 'email', value: email }] : []),
          ...(phone ? [{ kind: 'phone', value: phone }] : []),
        ],
      },
      select: { id: true },
    });
    return !!hit;
  }

  /** Creates leads that are not in the base yet (by email or phone) and
   * not on the stop-list. */
  private async insertLeads(
    admin: AdminActor,
    parsed: ParsedLead[],
    input: {
      source: 'csv' | 'ny_registry';
      partnerId: string | null;
      apply: boolean;
      sourceNote: string | null;
    },
  ): Promise<{ created: number; duplicates: number; suppressed: number }> {
    const emails = parsed.map((l) => l.email).filter((x): x is string => !!x);
    const phones = parsed.map((l) => l.phone).filter((x): x is string => !!x);
    const [existing, stopList] = await Promise.all([
      this.prisma.outreachLead.findMany({
        where: { OR: [{ email: { in: emails } }, { phone: { in: phones } }] },
        select: { email: true, phone: true },
      }),
      this.prisma.outreachSuppression.findMany({
        where: {
          OR: [
            { kind: 'email', value: { in: emails } },
            { kind: 'phone', value: { in: phones } },
          ],
        },
        select: { kind: true, value: true },
      }),
    ]);
    const seenEmail = new Set(existing.map((e) => e.email).filter(Boolean));
    const seenPhone = new Set(existing.map((e) => e.phone).filter(Boolean));
    const stopped = new Set(stopList.map((s) => `${s.kind}:${s.value}`));
    const fresh: ParsedLead[] = [];
    let duplicates = 0;
    let suppressed = 0;
    for (const l of parsed) {
      if (
        (l.email && stopped.has(`email:${l.email}`)) ||
        (l.phone && stopped.has(`phone:${l.phone}`))
      ) {
        suppressed += 1;
        continue;
      }
      if (
        (l.email && seenEmail.has(l.email)) ||
        (l.phone && seenPhone.has(l.phone))
      ) {
        duplicates += 1;
        continue;
      }
      if (l.email) seenEmail.add(l.email);
      if (l.phone) seenPhone.add(l.phone);
      fresh.push(l);
    }
    if (!input.apply || fresh.length === 0)
      return { created: fresh.length, duplicates, suppressed };
    const now = new Date();
    let created = 0;
    for (let i = 0; i < fresh.length; i += 200) {
      const chunk = fresh.slice(i, i + 200);
      const res = await this.prisma.outreachLead.createMany({
        data: chunk.map((l) => ({
          kind: l.kind ?? 'attorney',
          first_name: l.firstName,
          last_name: l.lastName,
          company: l.company,
          state_code: l.stateCode,
          city: l.city,
          practice: l.practice,
          phone: l.phone,
          email: l.email,
          source: input.source,
          status: 'new',
          partner_id: input.partnerId,
          unsubscribe_token: newUnsubscribeToken(),
          note: l.note,
          source_note: input.sourceNote,
          created_by: admin.id,
          created_at: now,
        })),
        skipDuplicates: true,
      });
      created += res.count;
    }
    return {
      created,
      duplicates: duplicates + (fresh.length - created),
      suppressed,
    };
  }

  async importCsv(
    admin: AdminActor,
    file: Buffer,
    q: OutreachImportQueryDto,
  ): Promise<OutreachImportReportDto> {
    const scope = await this.core.scopeFor(admin);
    managerOnly(scope);
    if (q.partnerId) await this.partnerOrThrow(q.partnerId);
    // Owner 2026-10-05 (legal): every imported contact carries where it
    // came from and on what basis we may write (CAN-SPAM / TCPA records).
    if (!q.sourceNote) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          'sourceNote is required: where the contacts come from and why we may write to them.',
      });
    }
    if ((q.kind ?? 'attorney') === 'client') {
      const settings = await this.core.settings();
      if (!settings.clientLeadsEnabled) throw clientsDisabled();
    }
    const text = file.toString('utf8');
    let parsed;
    try {
      parsed = leadsFromCsv(text, q.kind ?? 'attorney');
    } catch (e) {
      throw new BadRequestException({
        code: ErrorCode.OUTREACH_IMPORT_INVALID,
        message: String(e).includes('no_contact_column')
          ? 'The file has no "email" or "phone" column.'
          : 'The file could not be read as CSV.',
      });
    }
    if (parsed.leads.length === 0) {
      throw new BadRequestException({
        code: ErrorCode.OUTREACH_IMPORT_INVALID,
        message: 'No rows with an email or a phone were found.',
      });
    }
    const apply = q.mode === 'apply';
    const { created, duplicates, suppressed } = await this.insertLeads(
      admin,
      parsed.leads,
      {
        source: 'csv',
        partnerId: q.partnerId ?? null,
        apply,
        sourceNote: q.sourceNote,
      },
    );
    if (apply) {
      await this.audit.record({
        adminId: admin.id,
        action: OUTREACH_AUDIT.importCsv,
        targetType: 'outreach_lead',
        targetId: null,
        before: null,
        after: toJson({
          rows: parsed.leads.length,
          created,
          duplicates,
          suppressed,
          partnerId: q.partnerId ?? null,
          sourceNote: q.sourceNote,
        }),
        ip: admin.ip,
      });
    }
    return {
      mode: apply ? 'apply' : 'dry-run',
      rows: parsed.leads.length,
      created,
      duplicates,
      suppressed,
      skipped: parsed.skipped.length,
      columns: parsed.columns,
      problems: parsed.skipped
        .slice(0, 20)
        .map((s) => `row ${s.row}: ${s.reason}`),
    };
  }

  async importRegistry(
    admin: AdminActor,
    dto: OutreachRegistryImportDto,
  ): Promise<OutreachImportReportDto> {
    const scope = await this.core.scopeFor(admin);
    managerOnly(scope);
    if (dto.partnerId) await this.partnerOrThrow(dto.partnerId);
    let rows;
    try {
      ({ rows } = await this.registry.fetch({
        county: dto.county ?? undefined,
        city: dto.city ?? undefined,
        admittedFrom: dto.admittedFrom,
        limit: dto.limit ?? 100,
        offset: dto.offset ?? 0,
      }));
    } catch (e) {
      throw new BadRequestException({
        code: ErrorCode.OUTREACH_IMPORT_INVALID,
        message: `The NY registry did not answer: ${String(e).slice(0, 160)}`,
      });
    }
    const parsed = leadsFromRegistry(rows);
    const apply = dto.mode === 'apply';
    const { created, duplicates, suppressed } = await this.insertLeads(
      admin,
      parsed,
      {
        source: 'ny_registry',
        partnerId: dto.partnerId ?? null,
        apply,
        sourceNote: `NY attorney registry (data.ny.gov, public record), imported ${new Date().toISOString().slice(0, 10)}`,
      },
    );
    if (apply) {
      await this.audit.record({
        adminId: admin.id,
        action: OUTREACH_AUDIT.importRegistry,
        targetType: 'outreach_lead',
        targetId: null,
        before: null,
        after: toJson({
          state: dto.state,
          county: dto.county,
          city: dto.city,
          rows: parsed.length,
          created,
          duplicates,
          suppressed,
        }),
        ip: admin.ip,
      });
    }
    return {
      mode: apply ? 'apply' : 'dry-run',
      rows: parsed.length,
      created,
      duplicates,
      suppressed,
      skipped: rows.length - parsed.length,
      columns: [
        'registration_number',
        'first_name',
        'last_name',
        'company_name',
        'city',
        'phone_number',
      ],
      problems:
        rows.length === 0
          ? ['The registry returned no rows for these filters.']
          : [],
    };
  }

  // ---- stop-list (do not contact) -----------------------------------------------

  /**
   * Owner 2026-10-05 (legal): managers paste phones / e-mails that must
   * never be contacted (DNC complaints, opt-outs by phone, lawyers'
   * requests). Existing leads with these contacts are marked
   * do-not-contact; future imports skip them.
   */
  async addSuppressions(
    admin: AdminActor,
    dto: OutreachSuppressionsAddDto,
  ): Promise<OutreachSuppressionsAddResultDto> {
    const scope = await this.core.scopeFor(admin);
    managerOnly(scope);
    const entries = new Map<
      string,
      { kind: 'phone' | 'email'; value: string }
    >();
    let invalid = 0;
    for (const raw of dto.values) {
      const email = normalizeEmail(raw);
      const phone = email ? null : normalizePhone(raw);
      if (email) entries.set(`email:${email}`, { kind: 'email', value: email });
      else if (phone)
        entries.set(`phone:${phone}`, { kind: 'phone', value: phone });
      else invalid += 1;
    }
    const list = [...entries.values()];
    if (list.length === 0) return { added: 0, leadsMarked: 0, invalid };
    const emails = list.filter((e) => e.kind === 'email').map((e) => e.value);
    const phones = list.filter((e) => e.kind === 'phone').map((e) => e.value);
    const now = new Date();
    const { added, leadsMarked } = await withTxRetry(
      this.prisma,
      async (tx) => {
        let added = 0;
        for (let i = 0; i < list.length; i += 500) {
          const res = await tx.outreachSuppression.createMany({
            data: list.slice(i, i + 500).map((e) => ({
              kind: e.kind,
              value: e.value,
              note: dto.note ?? null,
              created_by: admin.id,
              created_at: now,
            })),
            skipDuplicates: true,
          });
          added += res.count;
        }
        const leads = await tx.outreachLead.findMany({
          where: {
            do_not_contact_at: null,
            OR: [
              ...(emails.length ? [{ email: { in: emails } }] : []),
              ...(phones.length ? [{ phone: { in: phones } }] : []),
            ],
          },
          select: { id: true, partner_id: true, do_not_contact_at: true },
        });
        for (const lead of leads) {
          await this.core.markDoNotContact(tx, lead, 'suppression', {
            actorAdminId: admin.id,
            now,
          });
        }
        await this.audit.record(
          {
            adminId: admin.id,
            action: OUTREACH_AUDIT.suppressionsAdd,
            targetType: 'outreach_suppression',
            targetId: null,
            before: null,
            after: toJson({
              values: list.length,
              added,
              leadsMarked: leads.length,
              invalid,
              note: dto.note ?? null,
            }),
            ip: admin.ip,
          },
          tx,
        );
        return { added, leadsMarked: leads.length };
      },
    );
    return { added, leadsMarked, invalid };
  }

  async suppressions(admin: AdminActor): Promise<OutreachSuppressionsDto> {
    const scope = await this.core.scopeFor(admin);
    managerOnly(scope);
    const [count, latest] = await Promise.all([
      this.prisma.outreachSuppression.count(),
      this.prisma.outreachSuppression.findMany({
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
    ]);
    return {
      count,
      latest: latest.map((s) => ({
        kind: s.kind as 'phone' | 'email',
        value: maskSuppression(s.value),
        note: s.note,
        createdAt: s.created_at.toISOString(),
      })),
    };
  }

  // ---- templates --------------------------------------------------------------

  async templates(): Promise<OutreachTemplateDto[]> {
    const rows = await this.prisma.outreachTemplate.findMany({
      orderBy: [{ active: 'desc' }, { updated_at: 'desc' }],
      take: 200,
    });
    return rows.map(templateDto);
  }

  async saveTemplate(
    admin: AdminActor,
    dto: OutreachTemplateInputDto,
    id?: string,
  ): Promise<OutreachTemplateDto> {
    const scope = await this.core.scopeFor(admin);
    managerOnly(scope);
    const data = {
      name: dto.name,
      kind: dto.kind ?? 'any',
      subject: dto.subject,
      body: dto.body,
      active: dto.active ?? true,
    };
    const row = await withTxRetry(this.prisma, async (tx) => {
      const before = id
        ? await tx.outreachTemplate.findUnique({ where: { id } })
        : null;
      if (id && !before)
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Template not found.',
        });
      const saved = before
        ? await tx.outreachTemplate.update({ where: { id: before.id }, data })
        : await tx.outreachTemplate.create({
            data: { ...data, created_by: admin.id },
          });
      await this.audit.record(
        {
          adminId: admin.id,
          action: OUTREACH_AUDIT.templateSave,
          targetType: 'outreach_template',
          targetId: saved.id,
          before: before ? toJson(before) : null,
          after: toJson(saved),
          ip: admin.ip,
        },
        tx,
      );
      return saved;
    });
    return templateDto(row);
  }

  // ---- stats --------------------------------------------------------------------

  async stats(
    admin: AdminActor,
    q: OutreachStatsQueryDto,
  ): Promise<OutreachStatsDto> {
    const scope = await this.core.scopeFor(admin);
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from
      ? new Date(q.from)
      : new Date(to.getTime() - 30 * 86_400_000);
    const inPeriod = { gte: from, lte: to };
    const partnerFilter = scope.partner ? { partner_id: scope.partner.id } : {};
    const [leads, acts, statusMoves, commissions, byStatus] = await Promise.all(
      [
        this.prisma.outreachLead.groupBy({
          by: ['partner_id'],
          where: partnerFilter,
          _count: { _all: true },
          _max: { last_activity_at: true },
        }),
        this.prisma.outreachActivity.groupBy({
          by: ['partner_id', 'kind', 'outcome'],
          where: {
            ...partnerFilter,
            created_at: inPeriod,
            kind: { in: ['call', 'email'] },
          },
          _count: { _all: true },
        }),
        this.prisma.outreachActivity.groupBy({
          by: ['partner_id', 'outcome'],
          where: {
            ...partnerFilter,
            created_at: inPeriod,
            kind: { in: ['status', 'system'] },
            outcome: { in: ['replied', 'registered', 'paid'] },
          },
          _count: { _all: true },
        }),
        this.prisma.partnerCommission.groupBy({
          by: ['partner_id'],
          where: {
            ...(scope.partner ? { partner_id: scope.partner.id } : {}),
            created_at: inPeriod,
            status: { not: 'reversed' },
          },
          _sum: { amount_cents: true },
        }),
        this.prisma.outreachLead.groupBy({
          by: ['status'],
          where: partnerFilter,
          _count: { _all: true },
        }),
      ],
    );
    const ids = new Set<string | null>([
      ...leads.map((l) => l.partner_id),
      ...acts.map((a) => a.partner_id),
      ...statusMoves.map((s) => s.partner_id),
    ]);
    const partnerRows = await this.prisma.partner.findMany({
      where: { id: { in: [...ids].filter((x): x is string => !!x) } },
    });
    const dtos = await this.core.partnerDtos(partnerRows);
    const commissionByPartner = new Map(
      commissions.map((c) => [c.partner_id, c._sum.amount_cents ?? 0]),
    );
    const empty = (): Omit<OutreachPartnerStatsDto, 'partner'> => ({
      leads: 0,
      calls: 0,
      emails: 0,
      replied: 0,
      registered: 0,
      paid: 0,
      commissionCents: 0,
      lastActivityAt: null,
    });
    const rows = new Map<string | null, OutreachPartnerStatsDto>();
    const rowFor = (pid: string | null) => {
      let r = rows.get(pid);
      if (!r) {
        r = { partner: pid ? (dtos.get(pid) ?? null) : null, ...empty() };
        rows.set(pid, r);
      }
      return r;
    };
    for (const l of leads) {
      const r = rowFor(l.partner_id);
      r.leads += l._count._all;
      r.lastActivityAt = l._max.last_activity_at?.toISOString() ?? null;
    }
    for (const a of acts) {
      const r = rowFor(a.partner_id);
      if (a.kind === 'call') r.calls += a._count._all;
      if (a.kind === 'email' && a.outcome === 'sent') r.emails += a._count._all;
    }
    for (const s of statusMoves) {
      const r = rowFor(s.partner_id);
      if (s.outcome === 'replied') r.replied += s._count._all;
      if (s.outcome === 'registered') r.registered += s._count._all;
      if (s.outcome === 'paid') r.paid += s._count._all;
    }
    for (const [pid, cents] of commissionByPartner) {
      if (rows.has(pid) || scope.partner) rowFor(pid).commissionCents += cents;
    }
    const partners = [...rows.values()].sort(
      (a, b) =>
        b.paid - a.paid || b.registered - a.registered || b.calls - a.calls,
    );
    const totals: OutreachPartnerStatsDto = { partner: null, ...empty() };
    for (const p of partners) {
      totals.leads += p.leads;
      totals.calls += p.calls;
      totals.emails += p.emails;
      totals.replied += p.replied;
      totals.registered += p.registered;
      totals.paid += p.paid;
      totals.commissionCents += p.commissionCents;
    }
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      partners,
      totals,
      byStatus: Object.fromEntries(
        byStatus.map((b) => [b.status, b._count._all]),
      ),
    };
  }

  // ---- export -----------------------------------------------------------------------

  async exportCsv(
    admin: AdminActor,
    q: OutreachLeadsQueryDto,
  ): Promise<string> {
    const scope = await this.core.scopeFor(admin);
    managerOnly(scope);
    const rows: LeadWithPartner[] = await this.prisma.outreachLead.findMany({
      where: { AND: this.leadFilters(scope, q) },
      include: { partner: true },
      orderBy: { created_at: 'desc' },
      take: 50_000,
    });
    const items = await this.core.presentLeads(rows);
    await this.audit.record({
      adminId: admin.id,
      action: OUTREACH_AUDIT.export,
      targetType: 'outreach_lead',
      targetId: null,
      before: null,
      after: toJson({ count: items.length, filters: q }),
      ip: admin.ip,
    });
    const header = [
      'id',
      'kind',
      'first_name',
      'last_name',
      'company',
      'state',
      'city',
      'practice',
      'phone',
      'email',
      'source',
      'status',
      'partner',
      'partner_code',
      'unsubscribed',
      'do_not_contact',
      'source_note',
      'last_activity_at',
      'created_at',
    ];
    const lines = items.map((l) =>
      [
        l.id,
        l.kind,
        l.firstName,
        l.lastName,
        l.company,
        l.stateCode,
        l.city,
        l.practice,
        l.phone,
        l.email,
        l.source,
        l.status,
        l.partner?.name ?? l.partner?.label ?? '',
        l.partner?.code ?? '',
        l.unsubscribed ? 'yes' : 'no',
        // phone/email above are already null for do-not-contact leads.
        l.doNotContact ? (l.doNotContactReason ?? 'yes') : 'no',
        l.sourceNote,
        l.lastActivityAt,
        l.createdAt,
      ]
        .map(csvCell)
        .join(','),
    );
    return [header.join(','), ...lines].join('\r\n') + '\r\n';
  }
}

export function templateDto(t: OutreachTemplate): OutreachTemplateDto {
  return {
    id: t.id,
    name: t.name,
    kind: t.kind as OutreachTemplateDto['kind'],
    subject: t.subject,
    body: t.body,
    active: t.active,
    updatedAt: t.updated_at.toISOString(),
  };
}

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v) : v;
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
