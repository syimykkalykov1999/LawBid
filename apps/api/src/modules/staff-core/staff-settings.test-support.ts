import {
  STAFF_SWITCH_KEYS,
  type StaffSwitchKey,
} from './staff-settings.defaults';

/**
 * Test-only. Since owner 2026-11-07 the staff switches default to ON; most
 * specs describe the old "everything off" world and turn on what they need,
 * so their stored config starts from this all-off base.
 */
export const STAFF_ALL_OFF: Readonly<Record<StaffSwitchKey, boolean>> =
  Object.fromEntries(STAFF_SWITCH_KEYS.map((k) => [k, false])) as Record<
    StaffSwitchKey,
    boolean
  >;
