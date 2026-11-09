/**
 * Staff package T1: the defaults and bounds of every staff setting. They
 * live with the other app settings (common/app-settings/staff-settings.ts,
 * so APP_SETTINGS and the admin config schema know them); this file is the
 * module's own entry point to them.
 */
export {
  OWNER_STAFF_SETTINGS,
  STAFF_MODE_AUTO_RULE,
  STAFF_MODE_KEYS,
  STAFF_NUMBER_DEFS,
  STAFF_NUMBER_KEYS,
  STAFF_SWITCH_KEYS,
  STAFF_SWITCH_LABELS,
  type StaffBoolKey,
  type StaffModeKey,
  type StaffNumberDef,
  type StaffNumberKey,
  type StaffSettingKey,
  type StaffSwitchKey,
} from '../../common/app-settings/staff-settings';
