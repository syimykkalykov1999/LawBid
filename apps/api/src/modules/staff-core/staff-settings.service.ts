import { Injectable } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  OWNER_STAFF_SETTINGS,
  STAFF_NUMBER_DEFS,
  STAFF_NUMBER_KEYS,
  STAFF_SWITCH_KEYS,
  type StaffNumberKey,
  type StaffSwitchKey,
} from './staff-settings.defaults';

export interface StaffSettings {
  switches: Record<StaffSwitchKey, boolean>;
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
 *  - a switch is on only when an admin stored `true` (default: all off);
 *    the AI sub-switches also need `staff.ai_enabled`, the per-queue lease
 *    switches also need `staff.lease_enabled`;
 *  - a number outside its [min, max] (or not a number) is clamped / falls
 *    back to the default, so a bad stored value cannot break a job;
 *  - one read of the cached app_config per 60 s (no DB query: app_config is
 *    cached in memory + Redis by AppConfigService).
 */
@Injectable()
export class StaffSettingsService {
  private cache: { at: number; value: StaffSettings } | null = null;

  constructor(private readonly settings: AppSettingsService) {}

  async get(): Promise<StaffSettings> {
    const memo = process.env.NODE_ENV !== 'test';
    if (memo && this.cache && Date.now() - this.cache.at < CACHE_MS) {
      return this.cache.value;
    }
    const value = resolveStaffSettings(await this.settings.all());
    if (memo) this.cache = { at: Date.now(), value };
    return value;
  }

  async isOn(key: StaffSwitchKey): Promise<boolean> {
    return (await this.get()).switches[key];
  }

  async number(key: StaffNumberKey): Promise<number> {
    return (await this.get()).numbers[key];
  }
}

/** Stored app_config → typed, clamped staff settings (pure; unit-tested). */
export function resolveStaffSettings(
  stored: Readonly<Record<string, unknown>>,
): StaffSettings {
  const switches = {} as Record<StaffSwitchKey, boolean>;
  for (const k of STAFF_SWITCH_KEYS) switches[k] = stored[k] === true;
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
  return { switches, numbers };
}
