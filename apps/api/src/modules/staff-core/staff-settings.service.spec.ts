import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  configSchema,
  validateConfigValue,
} from '../admin-config/config-schema';
import { StaffSettingsController } from './staff-settings.controller';
import {
  OWNER_STAFF_SETTINGS,
  STAFF_NUMBER_DEFS,
  STAFF_NUMBER_KEYS,
  STAFF_SWITCH_KEYS,
} from './staff-settings.defaults';
import {
  StaffSettingsService,
  resolveStaffSettings,
} from './staff-settings.service';
import { STAFF_ALL_OFF } from './staff-settings.test-support';

const service = (stored: Record<string, unknown> = {}) => {
  const all = jest.fn(() => Promise.resolve(stored));
  return {
    all,
    svc: new StaffSettingsService({ all } as unknown as AppSettingsService),
  };
};

describe('staff settings (staff package T1, plan part D)', () => {
  it('has every D1 switch; all ON by default except piecework pay and the AI switches (owner 2026-11-07)', async () => {
    expect(STAFF_SWITCH_KEYS).toHaveLength(36);
    const { svc } = service();
    const s = await svc.get();
    const offByDefault = (k: string) =>
      k === 'staff.piecework_enabled' || k.startsWith('staff.ai_');
    for (const k of STAFF_SWITCH_KEYS) {
      expect(s.switches[k]).toBe(!offByDefault(k));
      expect(APP_SETTINGS[k]).toBe(!offByDefault(k));
      expect(k).toMatch(/^staff\.[a-z_]+_enabled$/);
    }
  });

  it('starts at the plan numbers (30-day window, 30 decisions, 5 % / 20 %, 75 / 60, 3 warnings / 60 days, 15 s, lease TTLs, 90 days)', async () => {
    const { numbers } = await service().svc.get();
    expect(numbers).toMatchObject({
      'staff.rating.window_days': 30,
      'staff.rating.min_decisions': 30,
      'staff.sampling.pct': 5,
      'staff.sampling.newcomer_pct': 20,
      'staff.rating.yellow_below': 75,
      'staff.rating.red_below': 60,
      'staff.rating.norm': 85,
      'staff.warnings.for_replace': 3,
      'staff.warnings.window_days': 60,
      'staff.presence.heartbeat_sec': 15,
      'staff.presence.ttl_sec': 45,
      'staff.lease.ttl_verification_min': 20,
      'staff.lease.ttl_report_min': 10,
      'staff.lease.ttl_appeal_min': 15,
      'staff.lease.ttl_ticket_min': 30,
      'staff.lease.ttl_finance_min': 10,
      'staff.retaliation.window_days': 90,
      'staff.retaliation.hold_days': 14,
      'staff.pins_max': 7,
    });
  });

  it('every default number lies within its own bounds', () => {
    for (const k of STAFF_NUMBER_KEYS) {
      const d = STAFF_NUMBER_DEFS[k];
      expect(OWNER_STAFF_SETTINGS[k]).toBeGreaterThanOrEqual(d.min);
      expect(OWNER_STAFF_SETTINGS[k]).toBeLessThanOrEqual(d.max);
      expect(d.labelRu.length).toBeGreaterThan(3);
    }
  });

  it('clamps a stored number to its ceiling and floor, ignores non-numbers', () => {
    const s = resolveStaffSettings({
      'staff.sampling.pct': 500,
      'staff.rating.window_days': 1,
      'staff.pins_max': 'seven',
      'staff.lease.ttl_ticket_min': 12.6,
    });
    expect(s.numbers['staff.sampling.pct']).toBe(50);
    expect(s.numbers['staff.rating.window_days']).toBe(7);
    expect(s.numbers['staff.pins_max']).toBe(7);
    expect(s.numbers['staff.lease.ttl_ticket_min']).toBe(13);
  });

  it('a switch follows a stored boolean; "true" / 1 are not booleans and fall back to the default', () => {
    const s = resolveStaffSettings({
      'staff.rating_enabled': false,
      'staff.head_enabled': 'false',
      'staff.piecework_enabled': 1,
    });
    expect(s.switches['staff.rating_enabled']).toBe(false);
    expect(s.switches['staff.head_enabled']).toBe(true);
    expect(s.switches['staff.piecework_enabled']).toBe(false);
    expect(
      resolveStaffSettings({ 'staff.piecework_enabled': true }).switches[
        'staff.piecework_enabled'
      ],
    ).toBe(true);
  });

  it('AI sub-switches need the AI master switch; queue lease switches need staff.lease_enabled', () => {
    const subOnly = resolveStaffSettings({
      ...STAFF_ALL_OFF,
      'staff.ai_qa_enabled': true,
      'staff.ai_hint_enabled': true,
      'staff.lease_support_enabled': true,
    });
    expect(subOnly.switches['staff.ai_qa_enabled']).toBe(false);
    expect(subOnly.switches['staff.ai_hint_enabled']).toBe(false);
    expect(subOnly.switches['staff.lease_support_enabled']).toBe(false);
    const withMaster = resolveStaffSettings({
      ...STAFF_ALL_OFF,
      'staff.ai_enabled': true,
      'staff.ai_qa_enabled': true,
      'staff.lease_enabled': true,
      'staff.lease_support_enabled': true,
    });
    expect(withMaster.switches['staff.ai_qa_enabled']).toBe(true);
    expect(withMaster.switches['staff.ai_summary_enabled']).toBe(false);
    expect(withMaster.switches['staff.lease_support_enabled']).toBe(true);
  });

  it('the admin editor knows every key: switches are booleans, numbers are bounded integers with a Russian label', () => {
    const schema = configSchema();
    for (const k of STAFF_SWITCH_KEYS) {
      expect(schema[k]).toMatchObject({ type: 'boolean', defaultValue: false });
      expect(schema[k].description).toContain(k);
    }
    for (const k of STAFF_NUMBER_KEYS) {
      const d = STAFF_NUMBER_DEFS[k];
      expect(schema[k]).toMatchObject({
        type: 'integer',
        min: d.min,
        max: d.max,
      });
      expect(validateConfigValue(schema[k], d.max + 1)).not.toBeNull();
      expect(validateConfigValue(schema[k], d.min)).toBeNull();
    }
  });

  it('GET admin/staff/settings returns the resolved settings (defaults)', async () => {
    const { svc } = service();
    const out = await new StaffSettingsController(svc).getStaffSettings();
    expect(out.switches['staff.piecework_enabled']).toBe(false);
    expect(out.switches['staff.rating_enabled']).toBe(true);
    expect(out.numbers['staff.rating.window_days']).toBe(30);
  });
});
