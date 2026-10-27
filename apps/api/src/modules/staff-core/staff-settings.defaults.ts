/**
 * Staff package T1: the defaults and bounds of every staff setting. They
 * live with the other app settings (common/app-settings/staff-settings.ts,
 * so APP_SETTINGS and the admin config schema know them); this file is the
 * module's own entry point to them.
 */
export {
  OWNER_STAFF_SETTINGS,
  STAFF_NUMBER_DEFS,
  STAFF_NUMBER_KEYS,
  STAFF_SWITCH_KEYS,
  STAFF_SWITCH_LABELS,
  type StaffNumberDef,
  type StaffNumberKey,
  type StaffSettingKey,
  type StaffSwitchKey,
} from '../../common/app-settings/staff-settings';
