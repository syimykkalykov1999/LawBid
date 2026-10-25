import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { EmailProvider } from '../auth/providers/email/email-provider.interface';
import { EMAIL_PROVIDER } from '../auth/providers/provider.tokens';
import { ipAllowed, parseAllowlistEntry } from './admin-ip-allowlist';
import { AdminSessionService } from './admin-session.service';

export const SECURITY_AUDIT = {
  ipDenied: 'admin.ip_denied',
  sessionEvicted: 'admin.session_evicted',
  newContext: 'admin.login_new_context',
} as const;

/** How many earlier sign-ins are compared with a new one. */
const HISTORY = 300;

/**
 * Owner 2026-10-28 (admin hardening): the optional IP allowlist, the cap on
 * concurrent sessions and the alert to the owner for a sign-in from a new
 * device or address. Every switch is an app setting (OFF / today's behaviour
 * by default); the guide is docs/runbooks/ADMIN_HARDENING.md.
 */
@Injectable()
export class AdminSecurityService {
  private readonly logger = new Logger(AdminSecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: AdminSessionService,
    private readonly audit: AuditLogService,
    private readonly config: ConfigService,
    @Optional() private readonly settings?: AppSettingsService,
    @Optional()
    @Inject(EMAIL_PROVIDER)
    private readonly email?: EmailProvider,
  ) {}

  /** Emergency switch: ADMIN_IP_ALLOWLIST_BYPASS=1 on the API task. */
  private bypassed(): boolean {
    return this.config.get<string>('ADMIN_IP_ALLOWLIST_BYPASS') === '1';
  }

  /** 403 ADMIN_IP_NOT_ALLOWED when the allowlist is on and [ip] is not on it. */
  async assertIpAllowed(ip: string | null | undefined): Promise<void> {
    if (!this.settings || this.bypassed()) return;
    if (!(await this.settings.boolean('admin.ip_allowlist_enabled'))) return;
    const list = await this.settings.stringList('admin.ip_allowlist');
    if (ipAllowed(ip, list)) return;
    throw new ForbiddenException({
      code: ErrorCode.ADMIN_IP_NOT_ALLOWED,
      message: 'The admin panel is not available from this address.',
    });
  }

  /**
   * Called before `PUT /admin/config/:key` saves an allowlist setting: the
   * change must not lock the admin who makes it out of the panel.
   */
  async assertSafeToChange(
    key: string,
    value: unknown,
    ip: string | null | undefined,
  ): Promise<void> {
    if (!this.settings) return;
    let enabled: boolean;
    let list: string[];
    if (key === 'admin.ip_allowlist_enabled') {
      enabled = value === true;
      list = await this.settings.stringList('admin.ip_allowlist');
    } else if (key === 'admin.ip_allowlist') {
      enabled = await this.settings.boolean('admin.ip_allowlist_enabled');
      list = Array.isArray(value) ? (value as string[]) : [];
      const bad = list.find((l) => !parseAllowlistEntry(String(l)));
      if (bad !== undefined) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: `"${String(bad)}" is not an IP address or an IPv4 range.`,
        });
      }
    } else {
      return;
    }
    if (enabled && !ipAllowed(ip, list)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          'Your own address is not on the list: you would lock yourself out. Add it first.',
      });
    }
  }

  /** Ends the oldest sessions beyond the cap (0 = no cap). */
  async enforceSessionCap(adminId: string, keepJti: string): Promise<number> {
    if (!this.settings) return 0;
    const cap = await this.settings.number('admin.max_concurrent_sessions');
    if (cap <= 0) return 0;
    const live = await this.sessions.listForUsers([adminId]);
    if (live.length <= cap) return 0;
    const victims = live
      .filter((s) => s.sessionId !== keepJti)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, live.length - cap);
    for (const v of victims) {
      await this.sessions.revoke(v.sessionId, adminId);
      await this.audit.record({
        adminId,
        action: SECURITY_AUDIT.sessionEvicted,
        targetType: 'admin',
        targetId: adminId,
        after: { cap, device: v.device, ip: v.ip },
      });
    }
    return victims.length;
  }

  /**
   * Compares this sign-in with the earlier ones (audit rows `admin.login`
   * carry the device name; the row's ip is the address). Returns what is
   * new; the very first sign-in of an account is not an alert. When the
   * alert setting is on, the owner(s) get an e-mail (best effort).
   */
  async checkNewContext(
    adminId: string,
    ip: string | null,
    device: string | null,
  ): Promise<{ newIp: boolean; newDevice: boolean }> {
    const prior = await this.prisma.auditLog.findMany({
      where: { admin_id: adminId, action: 'admin.login' },
      orderBy: { created_at: 'desc' },
      take: HISTORY,
      select: { ip: true, after: true },
    });
    if (prior.length === 0) return { newIp: false, newDevice: false };
    const devices = new Set(
      prior.map((r) => (r.after as { device?: string } | null)?.device ?? ''),
    );
    const ips = new Set(prior.map((r) => r.ip ?? ''));
    return {
      newIp: !!ip && !ips.has(ip),
      newDevice: !!device && !devices.has(device),
    };
  }

  async alertOwners(
    adminId: string,
    ctx: { ip: string | null; device: string | null },
    what: { newIp: boolean; newDevice: boolean },
  ): Promise<void> {
    if (!what.newIp && !what.newDevice) return;
    try {
      if (this.settings && !(await this.settings.boolean('admin.login_alert_enabled'))) {
        return;
      }
      if (!this.email) return;
      const who = await this.prisma.user.findUnique({
        where: { id: adminId },
        select: { email: true },
      });
      const owners = await this.prisma.user.findMany({
        where: {
          role: 'admin',
          status: 'active',
          deleted_at: null,
          admin_profile: { admin_role: 'super_admin' },
          email: { not: null },
        },
        select: { email: true },
      });
      const to = [...new Set(owners.map((o) => o.email!).filter(Boolean))];
      const reasons = [
        what.newDevice ? 'a new device' : null,
        what.newIp ? 'a new IP address' : null,
      ]
        .filter(Boolean)
        .join(' and ');
      const text = `The admin account ${who?.email ?? adminId} just signed in to the LawBid admin panel from ${reasons}.\n\nDevice: ${ctx.device ?? 'unknown'}\nIP address: ${ctx.ip ?? 'unknown'}\nTime (UTC): ${new Date().toISOString()}\n\nIf this was not expected: open Administrators and end the sessions, then reset the password and the authenticator of that account.`;
      for (const address of to) {
        await this.email.sendEmail({
          to: address,
          subject: 'LawBid admin: sign-in from a new device or address',
          text,
        });
      }
    } catch (e) {
      // The alert is a safeguard, never a reason to refuse a sign-in.
      this.logger.warn(`admin login alert failed: ${String(e)}`);
    }
  }
}
