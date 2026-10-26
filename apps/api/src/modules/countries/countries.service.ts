import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Country, Prisma } from '@prisma/client';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';

/** Every instance re-reads the switches at most this often, so a change
 * in the admin reaches all API instances within half a minute. */
const CACHE_MS = 30_000;

export interface CountryRegion {
  code: string;
  name: string;
  isoCode: string | null;
}

export interface EnabledCountry {
  code: string;
  name: string;
  callingCode: string;
  currency: string;
  language: string;
  regionKind: string;
  timezone: string | null;
  stripeSupported: boolean;
  regions: CountryRegion[];
}

/**
 * Owner 2026-10-05 — countries. One place answers "does LawBid work in
 * this country": sign-up (SMS codes), profiles and new cases accept only
 * regions of switched-on countries; Stripe payouts, invoice currency and
 * the regions the apps list come from here. The switches themselves are
 * flipped in the admin (Система → Страны, AdminCountriesService).
 */
@Injectable()
export class CountriesService {
  private cache: { at: number; list: EnabledCountry[] } | null = null;
  private withRegions: { at: number; codes: Set<string> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Switched-on countries with their usable regions (cached). */
  async enabled(): Promise<EnabledCountry[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_MS) return this.cache.list;
    const rows = await this.prisma.country.findMany({
      where: { is_enabled: true },
      orderBy: { sort: 'asc' },
      include: {
        states: {
          where: { is_active: true },
          orderBy: { name: 'asc' },
          select: { code: true, name: true, iso_code: true },
        },
      },
    });
    const list = rows.map((c) => ({
      ...present(c),
      regions: c.states.map((s) => ({
        code: s.code,
        name: s.name,
        isoCode: s.iso_code,
      })),
    }));
    this.cache = { at: now, list };
    return list;
  }

  /** Drops the cache of this instance (after an admin change). */
  invalidate(): void {
    this.cache = null;
    this.withRegions = null;
  }

  /**
   * Where SMS codes may go: the switched-on countries, plus extra
   * destinations from `sms.allowed_country_codes` (e.g. PR) that are not
   * full countries with their own regions — a country with regions
   * (US, Canada, Mexico...) follows its switch only.
   */
  async smsCountries(extra: readonly string[]): Promise<string[]> {
    const now = Date.now();
    if (!this.withRegions || now - this.withRegions.at >= CACHE_MS) {
      const rows = await this.prisma.state.groupBy({ by: ['country_code'] });
      this.withRegions = {
        at: now,
        codes: new Set(rows.map((r) => r.country_code)),
      };
    }
    const managed = this.withRegions.codes;
    const enabled = await this.enabledCodes();
    return [...new Set([...enabled, ...extra.filter((c) => !managed.has(c))])];
  }

  async enabledCodes(): Promise<string[]> {
    return (await this.enabled()).map((c) => c.code);
  }

  async isEnabled(code: string | null | undefined): Promise<boolean> {
    if (!code) return false;
    return (await this.enabledCodes()).includes(code.toUpperCase());
  }

  /** COUNTRY_NOT_AVAILABLE unless the country is switched on. */
  async assertAvailable(code: string): Promise<void> {
    if (await this.isEnabled(code)) return;
    throw notAvailable(code);
  }

  /** The country a phone number belongs to (libphonenumber resolves +1
   * area codes to US / CA / the Caribbean), or null. */
  countryOfPhone(e164: string | null | undefined): string | null {
    if (!e164) return null;
    return parsePhoneNumberFromString(e164)?.country ?? null;
  }

  /** The country of each region code given (unknown codes left out). */
  async countriesOfRegions(codes: string[]): Promise<Map<string, string>> {
    if (codes.length === 0) return new Map();
    const rows = await this.prisma.state.findMany({
      where: { code: { in: [...new Set(codes)] } },
      select: { code: true, country_code: true },
    });
    return new Map(rows.map((r) => [r.code, r.country_code]));
  }

  /** Regions usable right now: active and in a switched-on country. */
  usableRegionWhere(): Prisma.StateWhereInput {
    return { is_active: true, country: { is_enabled: true } };
  }

  /** Moves a person to the country of the region they picked (profile,
   * license). Only a region of a switched-on country gets this far. */
  async followRegion(
    userId: string,
    regionCode: string | null | undefined,
    db: Pick<Prisma.TransactionClient, 'state' | 'user'> = this.prisma,
  ): Promise<void> {
    if (!regionCode) return;
    const region = await db.state.findUnique({
      where: { code: regionCode },
      select: { country_code: true },
    });
    if (!region) return;
    await db.user.updateMany({
      where: { id: userId, NOT: { country_code: region.country_code } },
      data: { country_code: region.country_code },
    });
  }

  /** "Tell me when LawBid opens here" — one row per country + e-mail;
   * the admin's switch-on sends the e-mail (AdminCountriesService). */
  async joinWaitlist(
    countryCode: string,
    email: string,
    locale: string | undefined,
  ): Promise<{ countryCode: string; available: boolean }> {
    const code = countryCode.toUpperCase();
    const country = await this.prisma.country.findUnique({
      where: { code },
      select: { is_enabled: true },
    });
    if (!country) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Unknown country.',
      });
    }
    if (country.is_enabled) return { countryCode: code, available: true };
    const normalized = email.trim().toLowerCase();
    await this.prisma.countryWaitlist.upsert({
      where: {
        country_code_email: { country_code: code, email: normalized },
      },
      create: {
        country_code: code,
        email: normalized,
        locale: locale ?? 'en',
      },
      update: { locale: locale ?? 'en', notified_at: null },
    });
    return { countryCode: code, available: false };
  }

  /** The person's country row (US when unknown). */
  async ofUser(userId: string): Promise<Country | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { country: true },
    });
    return u?.country ?? null;
  }
}

export function present(c: Country): Omit<EnabledCountry, 'regions'> {
  return {
    code: c.code,
    name: c.name,
    callingCode: c.calling_code,
    currency: c.currency,
    language: c.language,
    regionKind: c.region_kind,
    timezone: c.timezone,
    stripeSupported: c.stripe_supported,
  };
}

export const notAvailable = (code: string) =>
  new ForbiddenException({
    code: ErrorCode.COUNTRY_NOT_AVAILABLE,
    message: 'LawBid is not available in this country yet.',
    details: { countryCode: code.toUpperCase() },
  });
