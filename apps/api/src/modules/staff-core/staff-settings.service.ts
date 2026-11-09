import { Injectable, Optional } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  parseSwitchMode,
  type SwitchMode,
} from '../../common/app-settings/switch-mode';
import { PrismaService } from '../../prisma/prisma.service';
import {
  OWNER_STAFF_SETTINGS,
  STAFF_MODE_KEYS,
  STAFF_NUMBER_DEFS,
  STAFF_NUMBER_KEYS,
  STAFF_SWITCH_KEYS,
  type StaffModeKey,
  type StaffNumberKey,
  type StaffSwitchKey,
} from './staff-settings.defaults';

/**
 * The cheap facts «Авто» decides on (owner rule 5c). One count each, over
 * two tiny tables (admin_profiles, staff_rates), cached with the settings.
 */
export interface StaffAutoSignals {
  /** Admins besides the owner (super_admin). */
  staff: number;
  /** Piecework rates valid right now. */
  activeRates: number;
}

export const NO_SIGNALS: StaffAutoSignals = { staff: 0, activeRates: 0 };

export interface StaffSettings {
  /**
   * A switch «exists» for the reader: a plain switch stored / defaulted on,
   * or a three-state switch not in «Выкл». Pages and read routes answer
   * while this is true (the page is never hidden behind «Авто»).
   */
  switches: Record<StaffSwitchKey, boolean>;
  /** Position of each three-state switch. */
  modes: Record<StaffModeKey, SwitchMode>;
  /**
   * A three-state switch really runs (its job computes, money moves): «Вкл»,
   * or «Авто» with its signal holding (`STAFF_MODE_AUTO_RULE`).
   */
  active: Record<StaffModeKey, boolean>;
  numbers: Record<StaffNumberKey, number>;
}

/** AI sub-features work only under the master switch (plan D1). */
const AI_SUB: readonly StaffSwitchKey[] = [
  'staff.ai_qa_enabled',
  'staff.ai_hint_enabled',
  'staff.ai_summary_enabled',
];

/** Per-queue lease switches work only under `staff.lease_enabled`. */
const LEASE_SUB: readonly StaffSwitchKey[] = [
  'staff.lease_support_enabled',
  'staff.lease_verification_enabled',
  'staff.lease_report_enabled',
  'staff.lease_appeal_enabled',
  'staff.lease_finance_enabled',
];

const CACHE_MS = 60_000;

/**
 * Staff package T1 (plan part D): the ONE typed reader of the staff
 * switches and numbers. Every staff module and job reads its thresholds
 * here, never a number in code.
 *  - a plain switch is on when an admin stored `true`, or nothing is stored
 *    and its default is on (owner 2026-11-08: the owner's pages default on);
 *    a stored `false` turns it off. The AI sub-switches also need
 *    `staff.ai_enabled`, the per-queue lease switches `staff.lease_enabled`;
 *  - a three-state switch (`STAFF_MODE_KEYS`) is read with `isOn()` for
 *    «may the page / route answer» (anything but «Выкл») and with
 *    `isActive()` for «does the job run / does money move» («Вкл», or
 *    «Авто» with its signal holding);
 *  - a number outside its [min, max] (or not a number) is clamped / falls
 *    back to the default, so a bad stored value cannot break a job;
 *  - one read of the cached app_config per 60 s (no DB query: app_config is
 *    cached in memory + Redis by AppConfigService) plus, only while some
 *    switch stands on «Авто», two counts over tiny tables, cached as long.
 */
@Injectable()
export class StaffSettingsService {
  private cache: { at: number; value: StaffSettings } | null = null;

  constructor(
    private readonly settings: AppSettingsService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async get(): Promise<StaffSettings> {
    const memo = process.env.NODE_ENV !== 'test';
    if (memo && this.cache && Date.now() - this.cache.at < CACHE_MS) {
      return this.cache.value;
    }
    const stored = await this.settings.all();
    const needSignals = STAFF_MODE_KEYS.some(
      (k) => parseSwitchMode(stored[k] ?? OWNER_STAFF_SETTINGS[k]) === 'auto',
    );
    const signals = needSignals ? await this.signals() : NO_SIGNALS;
    const value = resolveStaffSettings(stored, signals);
    if (memo) this.cache = { at: Date.now(), value };
    return value;
  }

  /** The switch exists for the reader (plain on, or three-state not «Выкл»). */
  async isOn(key: StaffSwitchKey): Promise<boolean> {
    return (await this.get()).switches[key];
  }

  /** The three-state switch really runs («Вкл», or «Авто» with its signal). */
  async isActive(key: StaffModeKey): Promise<boolean> {
    return (await this.get()).active[key];
  }

  async number(key: StaffNumberKey): Promise<number> {
    return (await this.get()).numbers[key];
  }

  /** Forget the cached reading (after an admin saved a staff setting). */
  invalidate(): void {
    this.cache = null;
  }

  /** The «Авто» facts; without a database (unit tests) nothing holds. */
  private async signals(): Promise<StaffAutoSignals> {
    if (!this.prisma) return NO_SIGNALS;
    try {
      const [staff, activeRates] = await Promise.all([
        this.prisma.adminProfile.count({
          where: { admin_role: { not: 'super_admin' } },
        }),
        this.prisma.staffRate.count({
          where: {
            OR: [{ valid_to: null }, { valid_to: { gt: new Date() } }],
          },
        }),
      ]);
      return { staff, activeRates };
    } catch {
      // A failed count never turns a page off: Авто simply does not run.
      return NO_SIGNALS;
    }
  }
}

/** Owner rule 5c, per three-state switch: does the «Авто» signal hold? */
export function staffAutoSignalHolds(
  key: StaffModeKey,
  s: StaffAutoSignals,
): boolean {
  switch (key) {
    case 'staff.rating_enabled':
      return s.staff >= 1;
    case 'staff.piecework_enabled':
      return s.activeRates >= 1;
    case 'staff.anomalies_enabled':
      return s.staff >= 2;
    default:
      return false;
  }
}

/** Stored app_config (+ Авто signals) → typed, clamped staff settings (pure; unit-tested). */
export function resolveStaffSettings(
  stored: Readonly<Record<string, unknown>>,
  signals: StaffAutoSignals = NO_SIGNALS,
): StaffSettings {
  const modes = {} as Record<StaffModeKey, SwitchMode>;
  const active = {} as Record<StaffModeKey, boolean>;
  for (const k of STAFF_MODE_KEYS) {
    modes[k] = parseSwitchMode(stored[k] ?? OWNER_STAFF_SETTINGS[k]);
    active[k] =
      modes[k] === 'on' ||
      (modes[k] === 'auto' && staffAutoSignalHolds(k, signals));
  }
  const switches = {} as Record<StaffSwitchKey, boolean>;
  for (const k of STAFF_SWITCH_KEYS) {
    if (k in modes) {
      switches[k] = modes[k as StaffModeKey] !== 'off';
      continue;
    }
    const v = stored[k];
    switches[k] =
      v === undefined ? OWNER_STAFF_SETTINGS[k] === true : v === true;
  }
  for (const k of AI_SUB) switches[k] &&= switches['staff.ai_enabled'];
  for (const k of LEASE_SUB) switches[k] &&= switches['staff.lease_enabled'];
  const numbers = {} as Record<StaffNumberKey, number>;
  for (const k of STAFF_NUMBER_KEYS) {
    const def = STAFF_NUMBER_DEFS[k];
    const v = stored[k];
    numbers[k] =
      typeof v === 'number' && Number.isFinite(v)
        ? Math.min(def.max, Math.max(def.min, Math.round(v)))
        : OWNER_STAFF_SETTINGS[k];
  }
  return { switches, modes, active, numbers };
}
