import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import type Redis from 'ioredis';
import type { Request } from 'express';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { ck } from '../../redis/redis-cluster-safe';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { RequestAdmin } from '../admin-auth/admin-auth.decorators';
import { canAccess, routeArea } from '../admin-auth/admin-permissions';
import {
  AdminSessionService,
  deviceFingerprint,
} from '../admin-auth/admin-session.service';
import { requestCountry } from '../auth/request-country.util';
import type {
  StaffMaskMode,
  StaffSecurityPort,
} from '../staff-core/staff-security.port';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { StaffCardWatch } from './staff-card-watch';
import type { RevealPiiDto, RevealPiiResultDto } from './staff-security.dto';
import {
  isExportRequest,
  openedCard,
  sameNetwork,
  utcDay,
} from './staff-security.util';

export const SECURITY_AUDIT = {
  reveal: 'admin.pii_reveal',
  exportBlocked: 'admin.export_blocked',
  countryDenied: 'admin.session_country_denied',
  deviceChanged: 'admin.session_device_changed',
  ipChanged: 'admin.session_ip_changed',
} as const;

/** Mass-work staff: not the owner, not the deputy, not a partner's team. */
export function isMassStaff(admin: RequestAdmin): boolean {
  return (
    admin.adminRole !== 'super_admin' &&
    admin.workspace === 'mass' &&
    !admin.partner &&
    !admin.manageAdmins
  );
}

/** Mass-work AND finance staff: the people the session rules watch. */
export function isWorkspaceStaff(admin: RequestAdmin): boolean {
  return (
    admin.adminRole !== 'super_admin' &&
    (admin.workspace === 'mass' || admin.workspace === 'finance') &&
    !admin.partner &&
    !admin.manageAdmins
  );
}

/**
 * Staff package T11 (plan C4, owner decision: one admin, no four-eyes):
 * data protection of the admin API, every part behind its own
 * `staff.*` switch (all OFF = nothing changes, no query, no Redis call).
 *  - partial mask of phone / e-mail / document numbers for the mass-work
 *    workspace and the audited, capped «show in full» (reveal);
 *  - CSV / bulk exports closed for that workspace (403 + audit);
 *  - session rules recorded at sign-in become enforced: the owner's country
 *    list, the device pin (new device = sign in again) and a changed
 *    network address (sign in again) — the owner never meets them;
 *  - the opened-card counter that feeds the daily snooping report.
 */
@Injectable()
export class StaffSecurityService implements StaffSecurityPort {
  private readonly logger = new Logger(StaffSecurityService.name);

  constructor(
    private readonly staff: StaffSettingsService,
    private readonly sessions: AdminSessionService,
    private readonly audit: AuditLogService,
    private readonly prisma: PrismaService,
    private readonly watch: StaffCardWatch,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  // --- masking -----------------------------------------------------------

  async maskMode(admin: RequestAdmin): Promise<StaffMaskMode> {
    if (!isMassStaff(admin)) return 'none';
    return (await this.staff.isOn('staff.masking_enabled'))
      ? 'partial'
      : 'none';
  }

  /** Whether the reveal endpoint applies to this admin (switch + workspace). */
  async revealApplies(admin: RequestAdmin): Promise<boolean> {
    return (await this.maskMode(admin)) === 'partial';
  }

  async reveal(
    admin: RequestAdmin & { ip: string | null },
    dto: RevealPiiDto,
  ): Promise<RevealPiiResultDto> {
    // An admin whose account is «без персональных данных» never gets a
    // contact back, whatever the switches say.
    if (admin.noPii || !(await this.staff.isOn('staff.masking_enabled'))) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Not found.',
      });
    }
    // The pair must make sense and the admin must already reach that
    // section: reveal never opens a door the list did not.
    const area = dto.targetType === 'user' ? 'users' : 'verification';
    const okField =
      dto.targetType === 'user'
        ? dto.field === 'phone' || dto.field === 'email'
        : dto.field === 'barNumber';
    if (
      !okField ||
      !canAccess(
        admin.adminRole,
        admin.permissions ?? {},
        `/api/v1/admin/${area}/x`,
        'GET',
        admin.manageAdmins ?? false,
        admin.partner ?? null,
        false,
        false,
      )
    ) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Not found.',
      });
    }

    const capped = isMassStaff(admin);
    let remaining: number | null = null;
    let counterKey: string | null = null;
    if (capped) {
      const cap = await this.staff.number('staff.reveal_per_day');
      counterKey = ck('adm', `staff:reveal:${admin.id}:${utcDay()}`);
      const used = await this.redis.incr(counterKey);
      if (used === 1) await this.redis.expire(counterKey, 2 * 86_400);
      if (used > cap) {
        await this.redis.decr(counterKey);
        throw new HttpException(
          {
            code: ErrorCode.STAFF_REVEAL_LIMIT,
            message: 'Daily limit of full reveals is used up.',
            details: { limit: cap },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      remaining = cap - used;
    }

    try {
      const value = await this.readValue(dto);
      if (!value) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Not found.',
        });
      }
      // The audit row comes BEFORE the value leaves (fail closed).
      await this.audit.record({
        adminId: admin.id,
        action: SECURITY_AUDIT.reveal,
        targetType: dto.targetType,
        targetId: dto.targetId,
        after: { field: dto.field, masked: capped },
        ip: admin.ip,
      });
      if (capped) void this.watch.noteReveal(admin.id);
      return { field: dto.field, value, remainingToday: remaining };
    } catch (e) {
      // A reveal that gave nothing does not use up the day.
      if (counterKey) await this.redis.decr(counterKey).catch(() => 0);
      throw e;
    }
  }

  private async readValue(dto: RevealPiiDto): Promise<string | null> {
    if (dto.targetType === 'user') {
      const u = await this.prisma.user.findUnique({
        where: { id: dto.targetId },
        select: { phone_e164: true, email: true },
      });
      return (dto.field === 'phone' ? u?.phone_e164 : u?.email) ?? null;
    }
    const l = await this.prisma.attorneyLicense.findUnique({
      where: { id: dto.targetId },
      select: { bar_number: true },
    });
    return l?.bar_number ?? null;
  }

  // --- exports and card counter -------------------------------------------

  async beforeHandler(req: Request, admin: RequestAdmin): Promise<void> {
    if (!isMassStaff(admin)) return;
    const path = req.originalUrl || req.url;
    if (
      isExportRequest(path) &&
      (await this.staff.isOn('staff.export_block_enabled'))
    ) {
      await this.audit
        .record({
          adminId: admin.id,
          action: SECURITY_AUDIT.exportBlocked,
          targetType: 'export',
          targetId: null,
          after: { method: req.method, path: path.split('?')[0] },
          ip: req.ip ?? null,
        })
        .catch((e: unknown) =>
          this.logger.warn(`export-block audit failed: ${String(e)}`),
        );
      throw new ForbiddenException({
        code: ErrorCode.STAFF_EXPORT_BLOCKED,
        message: 'Exports are closed for this workspace.',
      });
    }
    if (await this.staff.isOn('staff.anomalies_enabled')) {
      const card = openedCard(
        req.method,
        path,
        req.header('x-background') === '1',
      );
      if (card) void this.watch.noteOpened(admin.id, card);
    }
  }

  // --- session rules -------------------------------------------------------

  async checkSession(req: Request, admin: RequestAdmin): Promise<void> {
    if (!isWorkspaceStaff(admin)) return;
    if (!(await this.staff.isOn('staff.session_binding_enforce_enabled')))
      return;

    const countries = this.settings
      ? await this.settings.stringList('admin.country_allowlist')
      : [];
    if (countries.length > 0) {
      const country = requestCountry((n) => req.header(n));
      // An unknown country (no CDN header) is never a reason to refuse.
      if (country && !countries.includes(country)) {
        await this.note(admin, SECURITY_AUDIT.countryDenied, req, { country });
        throw new ForbiddenException({
          code: ErrorCode.ADMIN_COUNTRY_NOT_ALLOWED,
          message: 'Work from this country is closed by the owner.',
        });
      }
    }

    const bound = await this.sessions.binding(admin.sessionId);
    const fp = deviceFingerprint(req.header('user-agent'));
    if (bound.fp && fp && bound.fp !== fp) {
      await this.endSession(admin, SECURITY_AUDIT.deviceChanged, req, {});
      throw new UnauthorizedException({
        code: ErrorCode.ADMIN_DEVICE_CHANGED,
        message: 'The session was opened on another device: sign in again.',
      });
    }
    if (bound.ip && req.ip && !sameNetwork(bound.ip, req.ip)) {
      await this.endSession(admin, SECURITY_AUDIT.ipChanged, req, {
        was: bound.ip,
      });
      throw new UnauthorizedException({
        code: ErrorCode.ADMIN_IP_CHANGED,
        message: 'The network address changed: sign in again.',
      });
    }
  }

  private async endSession(
    admin: RequestAdmin,
    action: string,
    req: Request,
    extra: Record<string, string>,
  ): Promise<void> {
    await this.sessions.revoke(admin.sessionId, admin.id);
    await this.note(admin, action, req, extra);
  }

  private async note(
    admin: RequestAdmin,
    action: string,
    req: Request,
    extra: Record<string, string>,
  ): Promise<void> {
    // At most one row per kind per admin per minute (a page that polls must
    // not flood the log).
    const key = ck('adm', `staff:secnote:${admin.id}:${action}`);
    try {
      if ((await this.redis.set(key, '1', 'EX', 60, 'NX')) !== 'OK') return;
      await this.audit.record({
        adminId: admin.id,
        action,
        targetType: 'admin',
        targetId: admin.id,
        after: { area: routeArea(req.originalUrl || req.url), ...extra },
        ip: req.ip ?? null,
      });
    } catch (e) {
      this.logger.warn(`${action} audit failed: ${String(e)}`);
    }
  }
}
