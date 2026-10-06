import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import type {
  OutreachActivity,
  OutreachLead,
  OutreachTemplate,
  Partner,
  Prisma,
} from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestAdmin } from '../admin-auth/admin-auth.decorators';
import type {
  EmailMessage,
  EmailProvider,
} from '../auth/providers/email/email-provider.interface';
import {
  escapeHtml,
  renderTemplateString,
  textToHtml,
  wrapInBrandLayout,
} from '../auth/providers/email/email-template-render';
import { RateLimitService } from '../auth/services/rate-limit.service';
import { PartnersService } from '../partners/partners.service';
import type {
  OutreachActivityDto,
  OutreachLeadDetailDto,
  OutreachLeadRowDto,
  OutreachPartnerDto,
  OutreachSendEmailResultDto,
} from './outreach.dto';
import {
  advance,
  dayOf,
  normalizeEmail,
  normalizePhone,
  OUTREACH_SETTINGS_KEY,
  parseOutreachSettings,
  type ActivityKind,
  type ContactBlockReason,
  type DoNotContactReason,
  type LeadKind,
  type LeadSource,
  type LeadStatus,
  type OutreachSettings,
} from './outreach.settings';
import {
  callWindow,
  describeCallWindow,
  hhmm,
  type CallWindow,
} from './state-timezones';

/** Email provider without the admin-template override hook (the content
 * of a cold email is final; it is not one of the transactional emails). */
export const OUTREACH_EMAIL = Symbol('OUTREACH_EMAIL');

type Db = PrismaService | Prisma.TransactionClient;
export type LeadWithPartner = OutreachLead & { partner: Partner | null };

/** Who an admin is in the outreach module: a manager sees everything, an
 * employee (an admin who is also a partner) only their own leads. */
export interface OutreachScope {
  partner: Partner | null;
  manager: boolean;
}

export function invalidState(message: string): ConflictException {
  return new ConflictException({
    code: ErrorCode.OUTREACH_INVALID_STATE,
    message,
  });
}

export function newUnsubscribeToken(): string {
  return randomBytes(24).toString('base64url');
}

/** 409 OUTREACH_CONTACT_BLOCKED: a call/email is not allowed right now. */
export function contactBlocked(message: string): ConflictException {
  return new ConflictException({
    code: ErrorCode.OUTREACH_CONTACT_BLOCKED,
    message,
  });
}

/** 409 OUTREACH_CLIENTS_DISABLED: consumer leads are switched off. */
export function clientsDisabled(): ConflictException {
  return new ConflictException({
    code: ErrorCode.OUTREACH_CLIENTS_DISABLED,
    message:
      'Client (consumer) leads are switched off: enable them in Outreach → Settings after the Do-Not-Call check (TCPA).',
  });
}

export interface ContactState {
  /** Why a call is blocked now; null = allowed. */
  callBlocked: ContactBlockReason | null;
  /** Why an email is blocked now; null = allowed. */
  emailBlocked: ContactBlockReason | null;
  /** "08:00–21:00 America/New_York, now 22:15". */
  callWindow: string;
  window: CallWindow;
}

/**
 * Owner 2026-10-05 (legal): what may be done with a lead right now.
 * Calls: do-not-contact → clients switched off → outside the local call
 * window (TCPA 8–21 local). Emails: do-not-contact → clients switched
 * off → unsubscribed → per-lead cap → cooldown between emails.
 */
export function contactState(
  lead: Pick<
    OutreachLead,
    | 'kind'
    | 'state_code'
    | 'do_not_contact_at'
    | 'unsubscribed_at'
    | 'emails_sent'
    | 'last_email_at'
  >,
  settings: OutreachSettings,
  now = new Date(),
): ContactState {
  const window = callWindow(lead.state_code, settings, now);
  const dnc = !!lead.do_not_contact_at;
  const clientOff = lead.kind === 'client' && !settings.clientLeadsEnabled;
  const callBlocked: ContactBlockReason | null = dnc
    ? 'dnc'
    : clientOff
      ? 'client_disabled'
      : window.allowed
        ? null
        : 'hours';
  const cooldownMs = settings.emailCooldownDays * 86_400_000;
  const emailBlocked: ContactBlockReason | null = dnc
    ? 'dnc'
    : clientOff
      ? 'client_disabled'
      : lead.unsubscribed_at
        ? 'unsubscribed'
        : settings.maxEmailsPerLead > 0 &&
            lead.emails_sent >= settings.maxEmailsPerLead
          ? 'email_limit'
          : lead.last_email_at &&
              cooldownMs > 0 &&
              now.getTime() - lead.last_email_at.getTime() < cooldownMs
            ? 'email_cooldown'
            : null;
  return {
    callBlocked,
    emailBlocked,
    callWindow: describeCallWindow(window),
    window,
  };
}

/** Plain-English reason for a 409 message. */
export function blockMessage(
  reason: ContactBlockReason,
  state: ContactState,
  settings: OutreachSettings,
): string {
  switch (reason) {
    case 'dnc':
      return 'This lead is on the do-not-contact list.';
    case 'client_disabled':
      return 'Client (consumer) leads are switched off in Outreach → Settings (TCPA / Do-Not-Call).';
    case 'hours': {
      const w = state.window;
      return `Calls to this lead are not allowed now: local time ${w.localTime}, window ${hhmm(w.start)}–${hhmm(w.end)} (${w.zone ?? 'US, state unknown'}).`;
    }
    case 'unsubscribed':
      return 'This person unsubscribed from emails.';
    case 'email_limit':
      return `This lead already received ${settings.maxEmailsPerLead} cold email(s), the maximum.`;
    case 'email_cooldown':
      return `The last email went out less than ${settings.emailCooldownDays} day(s) ago.`;
  }
}

/**
 * Owner 2026-10-05: outreach (Привлечение). Leads are lawyers and
 * prospective clients the team cold-calls and emails; each is assigned to
 * a partner (employee) whose referral link goes into every email, so the
 * moment the person registers with that code the lead turns
 * `registered`, and when the partner's commission accrues it turns
 * `paid`. The owner then sees per employee: calls, emails, answers,
 * registrations, payments.
 */
@Injectable()
export class OutreachService {
  private readonly logger = new Logger(OutreachService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly partners: PartnersService,
    private readonly rateLimit: RateLimitService,
    @Optional() @Inject(OUTREACH_EMAIL) private readonly email?: EmailProvider,
  ) {}

  // ---- settings & scope ---------------------------------------------------

  async settings(db: Db = this.prisma): Promise<OutreachSettings> {
    const row = await db.appConfig.findUnique({
      where: { key: OUTREACH_SETTINGS_KEY },
    });
    return parseOutreachSettings(row?.value);
  }

  /** The super admin and admins who are not partners manage everything;
   * an admin who is an active partner is an employee: own leads only. */
  async scopeFor(
    admin: Pick<RequestAdmin, 'id' | 'adminRole'>,
  ): Promise<OutreachScope> {
    if (admin.adminRole === 'super_admin')
      return { partner: null, manager: true };
    const partner = await this.partners.activePartnerOf(admin.id);
    return partner
      ? { partner, manager: false }
      : { partner: null, manager: true };
  }

  /** Lead filter an admin may see. */
  scopeWhere(scope: OutreachScope): Prisma.OutreachLeadWhereInput {
    return scope.partner ? { partner_id: scope.partner.id } : {};
  }

  /** The lead, or 404/403-as-404 when outside the admin's scope. */
  async leadFor(scope: OutreachScope, id: string): Promise<LeadWithPartner> {
    const lead = await this.prisma.outreachLead.findFirst({
      where: { id, ...this.scopeWhere(scope) },
      include: { partner: true },
    });
    if (!lead) {
      throw new HttpException(
        { code: ErrorCode.NOT_FOUND, message: 'Lead not found.' },
        HttpStatus.NOT_FOUND,
      );
    }
    return lead;
  }

  // ---- presenters -----------------------------------------------------------

  async partnerDtos(
    partners: Partner[],
  ): Promise<Map<string, OutreachPartnerDto>> {
    const out = new Map<string, OutreachPartnerDto>();
    if (partners.length === 0) return out;
    const userIds = [...new Set(partners.map((p) => p.user_id))];
    const [users, codes] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, first_name: true, last_name: true },
      }),
      this.prisma.referralCode.findMany({
        where: { user_id: { in: userIds } },
        select: { user_id: true, code: true },
      }),
    ]);
    const name = new Map(
      users.map((u) => [
        u.id,
        [u.first_name, u.last_name].filter(Boolean).join(' ') || null,
      ]),
    );
    const code = new Map(codes.map((c) => [c.user_id, c.code]));
    for (const p of partners) {
      out.set(p.id, {
        id: p.id,
        userId: p.user_id,
        name: name.get(p.user_id) ?? null,
        label: p.label,
        code: code.get(p.user_id) ?? '',
        status: p.status,
      });
    }
    return out;
  }

  async presentLeads(leads: LeadWithPartner[]): Promise<OutreachLeadRowDto[]> {
    const partners = await this.partnerDtos(
      leads.map((l) => l.partner).filter((p): p is Partner => p !== null),
    );
    return leads.map((l) =>
      leadRow(l, l.partner ? (partners.get(l.partner.id) ?? null) : null),
    );
  }

  async presentDetail(
    lead: LeadWithPartner,
    now = new Date(),
  ): Promise<OutreachLeadDetailDto> {
    const [row] = await this.presentLeads([lead]);
    const settings = await this.settings();
    const state = contactState(lead, settings, now);
    const acts = await this.prisma.outreachActivity.findMany({
      where: { lead_id: lead.id },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    const actorIds = [
      ...new Set(
        acts.map((a) => a.actor_admin_id).filter((x): x is string => !!x),
      ),
    ];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, first_name: true, last_name: true, email: true },
        })
      : [];
    const actorName = new Map(
      actors.map((u) => [
        u.id,
        [u.first_name, u.last_name].filter(Boolean).join(' ') ||
          u.email ||
          null,
      ]),
    );
    // Owner 2026-10-05 (legal): the number is withheld whenever a call is
    // not allowed, so nobody dials it "by hand" outside the rules.
    const phone = state.callBlocked ? null : row.phone;
    return {
      ...row,
      phone,
      phoneHidden: !!lead.phone && phone === null,
      activities: acts.map((a) =>
        activityDto(a, actorName.get(a.actor_admin_id ?? '') ?? null),
      ),
      canEmail: !!lead.email && state.emailBlocked === null,
      callAllowed: state.callBlocked === null,
      callWindow: state.callWindow,
      callBlocked: state.callBlocked,
      emailBlocked: state.emailBlocked,
    };
  }

  /**
   * Marks a lead do-not-contact (idempotent) and logs a system activity.
   * Returns false when it already was.
   */
  async markDoNotContact(
    db: Db,
    lead: Pick<OutreachLead, 'id' | 'partner_id' | 'do_not_contact_at'>,
    reason: DoNotContactReason,
    input: { actorAdminId?: string | null; now?: Date } = {},
  ): Promise<boolean> {
    if (lead.do_not_contact_at) return false;
    const now = input.now ?? new Date();
    await db.outreachLead.update({
      where: { id: lead.id },
      data: { do_not_contact_at: now, do_not_contact_reason: reason },
    });
    await this.log(db, lead, {
      kind: 'system',
      outcome: 'do_not_contact',
      body: `Marked do-not-contact (${reason})`,
      actorAdminId: input.actorAdminId ?? null,
      now,
    });
    return true;
  }

  // ---- activities & status --------------------------------------------------

  async log(
    db: Db,
    lead: Pick<OutreachLead, 'id' | 'partner_id'>,
    input: {
      kind: ActivityKind;
      outcome?: string | null;
      body?: string | null;
      meta?: Record<string, unknown>;
      actorAdminId?: string | null;
      now?: Date;
    },
  ): Promise<OutreachActivity> {
    const now = input.now ?? new Date();
    const act = await db.outreachActivity.create({
      data: {
        lead_id: lead.id,
        partner_id: lead.partner_id,
        actor_admin_id: input.actorAdminId ?? null,
        kind: input.kind,
        outcome: input.outcome ?? null,
        body: input.body ?? null,
        meta: input.meta
          ? (JSON.parse(JSON.stringify(input.meta)) as Prisma.InputJsonValue)
          : undefined,
        created_at: now,
      },
    });
    await db.outreachLead.update({
      where: { id: lead.id },
      data: { last_activity_at: now },
    });
    return act;
  }

  /** Moves the lead forward (never back past a system status); logs it. */
  async moveStatus(
    db: Db,
    lead: OutreachLead,
    next: LeadStatus,
    input: {
      actorAdminId?: string | null;
      body?: string | null;
      system?: boolean;
      now?: Date;
    },
  ): Promise<LeadStatus> {
    const current = lead.status as LeadStatus;
    const target = input.system ? next : advance(current, next);
    if (target === current) return current;
    await db.outreachLead.update({
      where: { id: lead.id },
      data: { status: target },
    });
    await this.log(db, lead, {
      kind: input.system ? 'system' : 'status',
      outcome: target,
      body: input.body ?? `${current} → ${target}`,
      actorAdminId: input.actorAdminId ?? null,
      now: input.now,
    });
    return target;
  }

  // ---- conversion hooks (never throw) ---------------------------------------

  /**
   * ReferralsService.apply: a new user entered a partner's code. A lead
   * with that user's email or phone turns `registered`; an unassigned
   * lead is assigned to that partner.
   */
  async onReferralApplied(
    refereeUserId: string,
    referrerUserId: string,
  ): Promise<void> {
    try {
      const partner = await this.prisma.partner.findUnique({
        where: { user_id: referrerUserId },
      });
      if (!partner) return;
      const user = await this.prisma.user.findUnique({
        where: { id: refereeUserId },
        select: { id: true, email: true, phone_e164: true, role: true },
      });
      if (!user) return;
      const email = normalizeEmail(user.email);
      const phone = normalizePhone(user.phone_e164);
      if (!email && !phone) return;
      const lead = await this.prisma.outreachLead.findFirst({
        where: {
          converted_user_id: null,
          OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
        },
      });
      if (!lead) return;
      await this.prisma.outreachLead.update({
        where: { id: lead.id },
        data: {
          converted_user_id: user.id,
          partner_id: lead.partner_id ?? partner.id,
          ...(user.role === 'attorney' || user.role === 'client'
            ? { kind: user.role }
            : {}),
        },
      });
      await this.moveStatus(
        this.prisma,
        { ...lead, partner_id: lead.partner_id ?? partner.id },
        'registered',
        { system: true, body: 'Signed up with the partner link' },
      );
    } catch (e) {
      this.logger.warn(
        { refereeUserId, err: String(e) },
        'outreach: referral hook failed',
      );
    }
  }

  /** PartnersService: a commission accrued for this referred user → paid. */
  async onCommission(
    referredUserId: string | null,
    kind: string,
  ): Promise<void> {
    if (!referredUserId) return;
    try {
      const lead = await this.prisma.outreachLead.findFirst({
        where: { converted_user_id: referredUserId },
      });
      if (!lead || lead.status === 'paid') return;
      await this.moveStatus(this.prisma, lead, 'paid', {
        system: true,
        body:
          kind === 'attorney_subscription'
            ? 'Bought a subscription'
            : 'Hired an attorney',
      });
    } catch (e) {
      this.logger.warn(
        { referredUserId, err: String(e) },
        'outreach: commission hook failed',
      );
    }
  }

  // ---- unsubscribe ------------------------------------------------------------

  /** Public link in every cold email. Idempotent; false = unknown token. */
  async unsubscribe(token: string): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{16,48}$/.test(token)) return false;
    const lead = await this.prisma.outreachLead.findUnique({
      where: { unsubscribe_token: token },
    });
    if (!lead) return false;
    if (!lead.unsubscribed_at) {
      await this.prisma.outreachLead.update({
        where: { id: lead.id },
        data: { unsubscribed_at: new Date() },
      });
      await this.log(this.prisma, lead, {
        kind: 'system',
        outcome: 'unsubscribed',
        body: 'Unsubscribed from emails',
      });
    }
    // Owner 2026-10-05 (legal): an unsubscribe is a do-not-contact for
    // calls as well — the person said no.
    await this.markDoNotContact(this.prisma, lead, 'unsubscribed');
    return true;
  }

  // ---- cold email -------------------------------------------------------------

  /** Daily budget left for this employee (partner) or manager. */
  async emailsLeftToday(
    scope: OutreachScope,
    adminId: string,
    now = new Date(),
  ): Promise<number> {
    const settings = await this.settings();
    const used = await this.prisma.outreachActivity.count({
      where: {
        kind: 'email',
        outcome: 'sent',
        created_at: { gte: new Date(`${dayOf(now)}T00:00:00.000Z`) },
        ...(scope.partner
          ? { partner_id: scope.partner.id }
          : { actor_admin_id: adminId }),
      },
    });
    return Math.max(0, settings.dailyEmailLimit - used);
  }

  renderEmail(input: {
    template: Pick<OutreachTemplate, 'subject' | 'body'>;
    lead: Pick<
      OutreachLead,
      'first_name' | 'last_name' | 'company' | 'unsubscribe_token'
    >;
    senderName: string;
    link: string;
    settings: OutreachSettings;
  }): { subject: string; text: string; html: string } {
    const vars = {
      first_name: input.lead.first_name ?? '',
      last_name: input.lead.last_name ?? '',
      company: input.lead.company ?? '',
      sender_name: input.senderName,
      link: input.link,
    };
    const subject = renderTemplateString(input.template.subject, vars)
      .replace(/[\r\n]+/g, ' ')
      .trim();
    const unsubscribeUrl = `${input.settings.apiPublicUrl}/api/v1/outreach/unsubscribe/${input.lead.unsubscribe_token}`;
    const bodyText = renderTemplateString(input.template.body, vars).trim();
    const footerText = [
      `${input.settings.fromName} · ${input.settings.footerAddress}`,
      `You received this one-time message because your professional contact details are publicly listed. Unsubscribe: ${unsubscribeUrl}`,
    ].join('\n');
    const text = `${bodyText}\n\n--\n${footerText}`;
    const html = wrapInBrandLayout(
      `${textToHtml(bodyText)}<hr style="border:none;border-top:1px solid #ddd;margin:24px 0">` +
        `<p style="font-size:12px;color:#777">${escapeHtml(input.settings.fromName)} · ${escapeHtml(input.settings.footerAddress)}<br>` +
        `You received this one-time message because your professional contact details are publicly listed. ` +
        `<a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a></p>`,
    );
    return { subject, text, html };
  }

  /**
   * Sends one cold email to a lead with the assigned partner's link,
   * within the sender's daily budget; logs the activity and moves the
   * lead to `contacted`. 409 when the lead cannot be emailed, 429 when
   * the budget is spent.
   */
  async sendEmail(
    admin: Pick<RequestAdmin, 'id' | 'adminRole'>,
    scope: OutreachScope,
    lead: LeadWithPartner,
    template: OutreachTemplate,
    now = new Date(),
  ): Promise<OutreachSendEmailResultDto> {
    const settings = await this.settings();
    if (!lead.email) throw invalidState('This lead has no email address.');
    // Owner 2026-10-05 (legal): do-not-contact, clients switched off,
    // unsubscribed, per-lead cap, cooldown — in that order.
    const state = contactState(lead, settings, now);
    if (state.emailBlocked)
      throw invalidState(blockMessage(state.emailBlocked, state, settings));
    if (!template.active) throw invalidState('This template is switched off.');
    if (template.kind !== 'any' && template.kind !== lead.kind) {
      throw invalidState(`This template is for ${template.kind} leads.`);
    }
    if (!settings.footerAddress || !settings.apiPublicUrl) {
      throw invalidState(
        'Fill the postal address and the public API URL in Outreach → Settings before sending (CAN-SPAM).',
      );
    }
    if (!this.email) throw invalidState('Email sending is not configured.');
    // The link belongs to the lead's partner; an unassigned lead sent by an
    // employee becomes theirs, a manager's send uses the manager's own code.
    const partner = lead.partner ?? scope.partner;
    const linkUserId = partner?.user_id ?? admin.id;
    const code = await this.partners.ensureCode(linkUserId);
    const link = this.partners.shareUrl(code);
    const senderUser = await this.prisma.user.findUnique({
      where: { id: linkUserId },
      select: { first_name: true, last_name: true },
    });
    const senderName =
      [senderUser?.first_name, senderUser?.last_name]
        .filter(Boolean)
        .join(' ') || settings.fromName;
    const budgetKey = [
      'outreach',
      'email',
      partner?.id ?? admin.id,
      dayOf(now),
    ];
    const budget = await this.rateLimit.consumeFixedWindow(
      budgetKey,
      settings.dailyEmailLimit,
      86_400,
    );
    if (!budget.allowed) {
      throw new HttpException(
        {
          code: ErrorCode.OUTREACH_EMAIL_LIMIT,
          message: `The daily limit of ${settings.dailyEmailLimit} cold emails is spent.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const rendered = this.renderEmail({
      template,
      lead,
      senderName,
      link,
      settings,
    });
    const unsubscribeUrl = `${settings.apiPublicUrl}/api/v1/outreach/unsubscribe/${lead.unsubscribe_token}`;
    const message: EmailMessage = {
      to: lead.email,
      ...rendered,
      // RFC 8058 one-click unsubscribe (Gmail/Yahoo bulk-sender rules).
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    };
    try {
      await this.email.sendEmail(message);
    } catch (e) {
      await this.log(this.prisma, lead, {
        kind: 'email',
        outcome: 'failed',
        body: rendered.subject,
        meta: { templateId: template.id, error: String(e).slice(0, 300) },
        actorAdminId: admin.id,
        now,
      });
      throw invalidState(
        'The email provider refused the message; nothing was sent.',
      );
    }
    if (!lead.partner_id && partner) {
      await this.prisma.outreachLead.update({
        where: { id: lead.id },
        data: { partner_id: partner.id },
      });
      lead = { ...lead, partner_id: partner.id, partner };
    }
    await this.prisma.outreachLead.update({
      where: { id: lead.id },
      data: { emails_sent: { increment: 1 }, last_email_at: now },
    });
    await this.log(this.prisma, lead, {
      kind: 'email',
      outcome: 'sent',
      body: rendered.subject,
      meta: { templateId: template.id, to: lead.email },
      actorAdminId: admin.id,
      now,
    });
    await this.moveStatus(this.prisma, lead, 'contacted', {
      actorAdminId: admin.id,
      now,
    });
    return { subject: rendered.subject, remainingToday: budget.remaining };
  }
}

export function leadRow(
  l: OutreachLead,
  partner: OutreachPartnerDto | null,
): OutreachLeadRowDto {
  // Owner 2026-10-05 (legal): a do-not-contact lead shows no phone/email
  // anywhere (list, detail, CSV export).
  const dnc = !!l.do_not_contact_at;
  return {
    id: l.id,
    kind: l.kind as LeadKind,
    firstName: l.first_name,
    lastName: l.last_name,
    company: l.company,
    stateCode: l.state_code,
    city: l.city,
    practice: l.practice,
    phone: dnc ? null : l.phone,
    email: dnc ? null : l.email,
    source: l.source as LeadSource,
    status: l.status as LeadStatus,
    partner,
    convertedUserId: l.converted_user_id,
    unsubscribed: !!l.unsubscribed_at,
    lastActivityAt: l.last_activity_at?.toISOString() ?? null,
    nextActionAt: l.next_action_at?.toISOString() ?? null,
    note: l.note,
    doNotContact: dnc,
    doNotContactReason: l.do_not_contact_reason,
    sourceNote: l.source_note,
    emailsSent: l.emails_sent,
    createdAt: l.created_at.toISOString(),
  };
}

export function activityDto(
  a: OutreachActivity,
  actorName: string | null,
): OutreachActivityDto {
  return {
    id: a.id,
    kind: a.kind as ActivityKind,
    outcome: a.outcome,
    body: a.body,
    partnerId: a.partner_id,
    actorAdminId: a.actor_admin_id,
    actorName,
    createdAt: a.created_at.toISOString(),
  };
}
