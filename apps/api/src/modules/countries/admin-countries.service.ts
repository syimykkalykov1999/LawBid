import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { AppSettingsWriter } from '../../common/app-settings/app-settings.writer';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { EmailProvider } from '../auth/providers/email/email-provider.interface';
import { EMAIL_PROVIDER } from '../auth/providers/provider.tokens';
import { CountriesService } from './countries.service';
import { FeatureFlagsService } from '../feature-flags/services/feature-flags.service';
import { emailFlowsOn } from '../feature-flags/email-flows';
import type {
  AddCountryRegionDto,
  BulkCountriesResultDto,
  CountriesAdminDto,
  CountryAdminDto,
  CountryRegionAdminDto,
} from './countries.dto';

export const COUNTRIES_AUDIT = {
  toggle: 'countries.toggle',
  bulk: 'countries.bulk',
  settings: 'countries.settings',
  addRegion: 'countries.add_region',
  region: 'countries.region',
} as const;

/** Waiting-list e-mails per batch (the rest go on the next switch-on or
 * the next batch of the same run). */
const WAITLIST_BATCH = 200;
const WAITLIST_MAX_PER_RUN = 5_000;

/**
 * Owner 2026-10-05 — Система → Страны. One switch per country, a master
 * switch for the owner, regions per country. Switching a country on
 * needs at least one region to pick (states, provinces): without one
 * nobody there could finish a profile or post a case.
 */
@Injectable()
export class AdminCountriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly countries: CountriesService,
    private readonly audit: AuditLogService,
    private readonly settings: AppSettingsService,
    private readonly writer: AppSettingsWriter,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @InjectPinoLogger(AdminCountriesService.name)
    private readonly logger: PinoLogger,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  async list(admin: AdminActor): Promise<CountriesAdminDto> {
    const [rows, regions, people, waiting, notifyWaitlist] = await Promise.all([
      this.prisma.country.findMany({ orderBy: { sort: 'asc' } }),
      this.prisma.state.groupBy({
        by: ['country_code'],
        where: { is_active: true },
        _count: { _all: true },
      }),
      this.prisma.user.groupBy({
        by: ['country_code', 'role'],
        where: { deleted_at: null, role: { in: ['client', 'attorney'] } },
        _count: { _all: true },
      }),
      this.prisma.countryWaitlist.groupBy({
        by: ['country_code'],
        where: { notified_at: null },
        _count: { _all: true },
      }),
      this.settings.boolean('countries.notify_waitlist'),
    ]);
    const regionCount = new Map(
      regions.map((r) => [r.country_code, r._count._all]),
    );
    const waitCount = new Map(
      waiting.map((r) => [r.country_code, r._count._all]),
    );
    const count = (code: string, role: 'client' | 'attorney') =>
      people.find((p) => p.country_code === code && p.role === role)?._count
        ._all ?? 0;
    // A country-limited employee sees only their countries.
    const scope = admin.countries ?? null;
    const visible = scope ? rows.filter((r) => scope.includes(r.code)) : rows;
    return {
      countries: visible.map((c): CountryAdminDto => ({
        code: c.code,
        name: c.name,
        isEnabled: c.is_enabled,
        callingCode: c.calling_code,
        currency: c.currency,
        language: c.language,
        regionKind: c.region_kind,
        timezone: c.timezone,
        stripeSupported: c.stripe_supported,
        sort: c.sort,
        enabledAt: c.enabled_at?.toISOString() ?? null,
        regions: regionCount.get(c.code) ?? 0,
        clients: count(c.code, 'client'),
        attorneys: count(c.code, 'attorney'),
        waiting: waitCount.get(c.code) ?? 0,
        ready: (regionCount.get(c.code) ?? 0) > 0,
      })),
      notifyWaitlist,
      canBulk: admin.adminRole === 'super_admin',
    };
  }

  async setEnabled(
    admin: AdminActor,
    code: string,
    enabled: boolean,
  ): Promise<CountryAdminDto> {
    this.assertInScope(admin, code);
    const before = await this.prisma.country.findUnique({ where: { code } });
    if (!before) throw notFound('Country');
    if (enabled && !(await this.hasRegions(code))) throw noRegions(code);
    if (before.is_enabled !== enabled) {
      await withTxRetry(this.prisma, async (tx) => {
        await tx.country.update({
          where: { code },
          data: {
            is_enabled: enabled,
            ...(enabled ? { enabled_at: new Date() } : {}),
          },
        });
        await this.audit.record(
          {
            adminId: admin.id,
            action: COUNTRIES_AUDIT.toggle,
            targetType: 'country',
            targetId: null,
            before: { code, isEnabled: before.is_enabled },
            after: { code, isEnabled: enabled },
            ip: admin.ip,
          },
          tx,
        );
      });
      this.countries.invalidate();
      if (enabled) this.notifyLater([code]);
    }
    return this.one(admin, code);
  }

  /** The owner's master switch: every country (or the ones given) on or
   * off in one go. Switching on skips countries without regions. */
  async bulk(
    admin: AdminActor,
    enabled: boolean,
    codes?: string[],
  ): Promise<BulkCountriesResultDto> {
    if (admin.adminRole !== 'super_admin') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the owner can switch countries in bulk.',
      });
    }
    const rows = await this.prisma.country.findMany({
      where: codes?.length ? { code: { in: codes } } : {},
      select: { code: true, is_enabled: true },
    });
    const withRegions = new Set(
      (
        await this.prisma.state.groupBy({
          by: ['country_code'],
          where: { is_active: true },
        })
      ).map((r) => r.country_code),
    );
    const skipped = enabled
      ? rows.filter((r) => !withRegions.has(r.code)).map((r) => r.code)
      : [];
    const changed = rows
      .filter((r) => r.is_enabled !== enabled && !skipped.includes(r.code))
      .map((r) => r.code);
    if (changed.length > 0) {
      await withTxRetry(this.prisma, async (tx) => {
        await tx.country.updateMany({
          where: { code: { in: changed } },
          data: {
            is_enabled: enabled,
            ...(enabled ? { enabled_at: new Date() } : {}),
          },
        });
        await this.audit.record(
          {
            adminId: admin.id,
            action: COUNTRIES_AUDIT.bulk,
            targetType: 'country',
            targetId: null,
            before: { enabled: !enabled, codes: changed },
            after: { enabled, codes: changed, skipped },
            ip: admin.ip,
          },
          tx,
        );
      });
      this.countries.invalidate();
      if (enabled) this.notifyLater(changed);
    }
    return { changed: changed.sort(), skipped: skipped.sort() };
  }

  async updateSettings(
    admin: AdminActor,
    notifyWaitlist: boolean | undefined,
  ): Promise<CountriesAdminDto> {
    await this.writer.write(admin.id, COUNTRIES_AUDIT.settings, {
      'countries.notify_waitlist': notifyWaitlist,
    });
    return this.list(admin);
  }

  async regions(
    admin: AdminActor,
    code: string,
  ): Promise<CountryRegionAdminDto[]> {
    this.assertInScope(admin, code);
    const rows = await this.prisma.state.findMany({
      where: { country_code: code },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      isoCode: r.iso_code,
      isActive: r.is_active,
    }));
  }

  /** A region for a country that has none yet (or a missing one). The
   * code is the key everywhere (profiles, cases, licenses), so it must be
   * free in every country. */
  async addRegion(
    admin: AdminActor,
    code: string,
    dto: AddCountryRegionDto,
  ): Promise<CountryRegionAdminDto> {
    this.assertInScope(admin, code);
    const country = await this.prisma.country.findUnique({ where: { code } });
    if (!country) throw notFound('Country');
    const taken = await this.prisma.state.findUnique({
      where: { code: dto.code },
      select: { country_code: true, name: true },
    });
    if (taken) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Code ${dto.code} is already used by ${taken.name} (${taken.country_code}).`,
        details: { field: 'code', countryCode: taken.country_code },
      });
    }
    const row = await withTxRetry(this.prisma, async (tx) => {
      const created = await tx.state.create({
        data: {
          code: dto.code,
          name: dto.name,
          country_code: code,
          iso_code: dto.isoCode ?? null,
        },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: COUNTRIES_AUDIT.addRegion,
          targetType: 'country',
          targetId: null,
          after: { country: code, region: dto.code, name: dto.name },
          ip: admin.ip,
        },
        tx,
      );
      return created;
    });
    this.countries.invalidate();
    return {
      code: row.code,
      name: row.name,
      isoCode: row.iso_code,
      isActive: row.is_active,
    };
  }

  async setRegionActive(
    admin: AdminActor,
    code: string,
    region: string,
    isActive: boolean,
  ): Promise<CountryRegionAdminDto> {
    this.assertInScope(admin, code);
    const before = await this.prisma.state.findUnique({
      where: { code: region },
    });
    if (!before || before.country_code !== code) throw notFound('Region');
    const row = await withTxRetry(this.prisma, async (tx) => {
      const after = await tx.state.update({
        where: { code: region },
        data: { is_active: isActive },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: COUNTRIES_AUDIT.region,
          targetType: 'country',
          targetId: null,
          before: { country: code, region, isActive: before.is_active },
          after: { country: code, region, isActive },
          ip: admin.ip,
        },
        tx,
      );
      return after;
    });
    this.countries.invalidate();
    return {
      code: row.code,
      name: row.name,
      isoCode: row.iso_code,
      isActive: row.is_active,
    };
  }

  /** E-mails everyone waiting for these countries, unless the owner
   * turned it off. Runs after the response; failures are logged. */
  private notifyLater(codes: string[]): void {
    void (async () => {
      if (!(await this.settings.boolean('countries.notify_waitlist'))) return;
      for (const code of codes) await this.notifyWaitlist(code);
    })().catch((err: unknown) =>
      this.logger.warn({ err }, 'country waitlist e-mails failed'),
    );
  }

  async notifyWaitlist(code: string): Promise<number> {
    // Admin «Вход и письма по почте» off: nobody is marked notified, so
    // the waiting list gets its e-mail once the switch is back on and the
    // country is switched on again.
    if (!(await emailFlowsOn(this.flags))) return 0;
    const country = await this.prisma.country.findUnique({ where: { code } });
    if (!country?.is_enabled) return 0;
    let sent = 0;
    while (sent < WAITLIST_MAX_PER_RUN) {
      const batch = await this.prisma.countryWaitlist.findMany({
        where: { country_code: code, notified_at: null },
        take: WAITLIST_BATCH,
        orderBy: { created_at: 'asc' },
      });
      if (batch.length === 0) break;
      for (const row of batch) {
        const text = waitlistText(row.locale, country.name);
        try {
          await this.email.sendEmail({
            to: row.email,
            subject: text.subject,
            text: text.body,
          });
        } catch (err) {
          this.logger.warn({ err, code }, 'waitlist e-mail not sent');
        }
        // Marked either way: one attempt per person, never a loop.
        await this.prisma.countryWaitlist.update({
          where: { id: row.id },
          data: { notified_at: new Date() },
        });
        sent++;
      }
    }
    return sent;
  }

  private async one(admin: AdminActor, code: string): Promise<CountryAdminDto> {
    const all = await this.list({ ...admin, countries: [code] });
    const row = all.countries.find((c) => c.code === code);
    if (!row) throw notFound('Country');
    return row;
  }

  private async hasRegions(code: string): Promise<boolean> {
    return (
      (await this.prisma.state.count({
        where: { country_code: code, is_active: true },
      })) > 0
    );
  }

  private assertInScope(admin: AdminActor, code: string): void {
    const scope = admin.assignedCountries ?? [];
    if (admin.adminRole !== 'super_admin' && scope.length > 0) {
      if (!scope.includes(code)) throw notFound('Country');
    }
  }
}

function waitlistText(
  locale: string,
  country: string,
): { subject: string; body: string } {
  const lang = locale.slice(0, 2);
  if (lang === 'ru') {
    return {
      subject: `LawBid теперь работает: ${country}`,
      body: `Хорошие новости: LawBid теперь работает в стране ${country}. Откройте приложение, чтобы зарегистрироваться. Вы получили это письмо, потому что просили сообщить об открытии.`,
    };
  }
  if (lang === 'es') {
    return {
      subject: `LawBid ya está disponible: ${country}`,
      body: `Buenas noticias: LawBid ya funciona en ${country}. Abra la aplicación para registrarse. Recibe este correo porque pidió que le avisáramos.`,
    };
  }
  if (lang === 'fr') {
    return {
      subject: `LawBid est maintenant disponible : ${country}`,
      body: `Bonne nouvelle : LawBid fonctionne maintenant dans ce pays : ${country}. Ouvrez l’application pour vous inscrire. Vous recevez ce message parce que vous avez demandé à être prévenu.`,
    };
  }
  return {
    subject: `LawBid is now open in ${country}`,
    body: `Good news: LawBid now works in ${country}. Open the app to sign up. You get this e-mail because you asked to be told when it opens.`,
  };
}

const notFound = (what: string) =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: `${what} not found.`,
  });

const noRegions = (code: string) =>
  new ConflictException({
    code: ErrorCode.VALIDATION_ERROR,
    message:
      'Add at least one region (state / province) before switching this country on.',
    details: { reason: 'no_regions', countryCode: code },
  });
