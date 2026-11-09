import {
  STAFF_MODE_KEYS,
  STAFF_SWITCH_KEYS,
  type StaffSwitchKey,
} from './staff-settings.defaults';

/**
 * Test-only: a stored app_config in which EVERY staff switch is off
 * («Выкл» for the three-state ones), with `overrides` on top. The specs of
 * the staff package describe behaviour relative to «everything off»; since
 * 2026-11-08/09 the defaults are on / «Авто», so a spec that means «off»
 * says so explicitly through this helper instead of an empty object.
 */
export function staffAllOff(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of STAFF_SWITCH_KEYS) {
    out[k] = (STAFF_MODE_KEYS as readonly StaffSwitchKey[]).includes(k)
      ? 'off'
      : false;
  }
  return { ...out, ...overrides };
}
