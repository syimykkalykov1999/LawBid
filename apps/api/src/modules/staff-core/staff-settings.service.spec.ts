import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  configSchema,
  validateConfigValue,
} from '../admin-config/config-schema';
import { StaffSettingsController } from './staff-settings.controller';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  OWNER_STAFF_SETTINGS,
  STAFF_MODE_AUTO_RULE,
  STAFF_MODE_KEYS,
  STAFF_NUMBER_DEFS,
  STAFF_NUMBER_KEYS,
  STAFF_SWITCH_KEYS,
} from './staff-settings.defaults';
import {
  StaffSettingsService,
  resolveStaffSettings,
  staffAutoSignalHolds,
} from './staff-settings.service';

/** The six owner pages / rows that default ON (owner 2026-11-08, rule 5c). */
const DEFAULT_ON = [
  'staff.owner_home_enabled',
  'staff.suggestions_enabled',
  'staff.appeals_enabled',
  'staff.case_appeals_enabled',
  'staff.weekly_digest_enabled',
  'staff.worker_progress_enabled',
] as const;

const service = (
  stored: Record<string, unknown> = {},
  counts: { staff?: number; rates?: number } | null = null,
) => {
  const all = jest.fn(() => Promise.resolve(stored));
  const prisma = counts
    ? ({
        adminProfile: {
          count: jest.fn(() => Promise.resolve(counts.staff ?? 0)),
        },
        staffRate: { count: jest.fn(() => Promise.resolve(counts.rates ?? 0)) },
      } as unknown as PrismaService)
    : undefined;
  return {
    all,
    prisma,
    svc: new StaffSettingsService(
      { all } as unknown as AppSettingsService,
      prisma,
    ),
  };
};

describe('staff settings (staff package T1, plan part D)', () => {
  it('has every D1 switch; workflow switches are off, the owner pages are on, three are «Авто» (owner 2026-11-08)', async () => {
    expect(STAFF_SWITCH_KEYS).toHaveLength(36);
    expect(STAFF_MODE_KEYS.sort()).toEqual([
      'staff.anomalies_enabled',
      'staff.piecework_enabled',
      'staff.rating_enabled',
    ]);
    const { svc } = service();
    const s = await svc.get();
    for (const k of STAFF_SWITCH_KEYS) {
      expect(k).toMatch(/^staff\.[a-z_]+_enabled$/);
      if ((STAFF_MODE_KEYS as readonly string[]).includes(k)) {
        expect(APP_SETTINGS[k]).toBe('auto');
        // «Авто» never hides the page: the read side sees the switch as on.
        expect(s.switches[k]).toBe(true);
      } else if ((DEFAULT_ON as readonly string[]).includes(k)) {
        expect(APP_SETTINGS[k]).toBe(true);
        expect(s.switches[k]).toBe(true);
      } else {
        expect(APP_SETTINGS[k]).toBe(false);
        expect(s.switches[k]).toBe(false);
      }
    }
    expect(s.modes).toEqual({
      'staff.rating_enabled': 'auto',
      'staff.piecework_enabled': 'auto',
      'staff.anomalies_enabled': 'auto',
    });
    // Without a database (no signal) «Авто» does not run anything.
    expect(Object.values(s.active).every((v) => v === false)).toBe(true);
  });

  it('a stored false turns a default-on switch off; a stored true turns a default-off one on', () => {
    const s = resolveStaffSettings({
      'staff.owner_home_enabled': false,
      'staff.desk_enabled': true,
    });
    expect(s.switches['staff.owner_home_enabled']).toBe(false);
    expect(s.switches['staff.desk_enabled']).toBe(true);
  });

  describe('three-state switches: Выкл / Вкл / Авто (owner rule 5c)', () => {
    it('«Выкл» (off or an old stored false) hides the page and stops the job', () => {
      const s = resolveStaffSettings(
        { 'staff.rating_enabled': 'off', 'staff.piecework_enabled': false },
        { staff: 5, activeRates: 3 },
      );
      expect(s.modes['staff.rating_enabled']).toBe('off');
      expect(s.switches['staff.rating_enabled']).toBe(false);
      expect(s.active['staff.rating_enabled']).toBe(false);
      expect(s.modes['staff.piecework_enabled']).toBe('off');
      expect(s.switches['staff.piecework_enabled']).toBe(false);
      expect(s.active['staff.piecework_enabled']).toBe(false);
    });

    it('«Вкл» (on or an old stored true) runs even without the signal', () => {
      const s = resolveStaffSettings({
        'staff.rating_enabled': 'on',
        'staff.anomalies_enabled': true,
      });
      expect(s.active['staff.rating_enabled']).toBe(true);
      expect(s.active['staff.anomalies_enabled']).toBe(true);
      expect(s.switches['staff.anomalies_enabled']).toBe(true);
    });

    it('«Авто» (the default, also for a typo) follows the signal: staff besides the owner, an active rate, two staff', () => {
      const none = resolveStaffSettings({ 'staff.rating_enabled': 'maybe' });
      expect(none.modes['staff.rating_enabled']).toBe('auto');
      expect(none.switches['staff.rating_enabled']).toBe(true);
      expect(none.active['staff.rating_enabled']).toBe(false);

      const one = resolveStaffSettings({}, { staff: 1, activeRates: 0 });
      expect(one.active['staff.rating_enabled']).toBe(true);
      expect(one.active['staff.anomalies_enabled']).toBe(false);
      expect(one.active['staff.piecework_enabled']).toBe(false);

      const team = resolveStaffSettings({}, { staff: 2, activeRates: 1 });
      expect(team.active).toEqual({
        'staff.rating_enabled': true,
        'staff.piecework_enabled': true,
        'staff.anomalies_enabled': true,
      });
      expect(
        staffAutoSignalHolds('staff.piecework_enabled', {
          staff: 9,
          activeRates: 0,
        }),
      ).toBe(false);
    });

    it('every three-state switch says in Russian what «Авто» decides on', () => {
      for (const k of STAFF_MODE_KEYS) {
        expect(STAFF_MODE_AUTO_RULE[k]).toMatch(/^Авто: /);
      }
    });

    it('the service counts staff and active rates only while something stands on «Авто», and a failed count means «does not run», never «hidden»', async () => {
      const auto = service({}, { staff: 2, rates: 1 });
      const s = await auto.svc.get();
      expect(s.active['staff.rating_enabled']).toBe(true);
      expect(s.active['staff.piecework_enabled']).toBe(true);
      expect(await auto.svc.isActive('staff.anomalies_enabled')).toBe(true);
      expect(await auto.svc.isOn('staff.rating_enabled')).toBe(true);

      const fixed = service(
        {
          'staff.rating_enabled': 'on',
          'staff.piecework_enabled': 'off',
          'staff.anomalies_enabled': 'off',
        },
        { staff: 2, rates: 1 },
      );
      await fixed.svc.get();
      expect(
        (fixed.prisma as unknown as { adminProfile: { count: jest.Mock } })
          .adminProfile.count,
      ).not.toHaveBeenCalled();

      const broken = {
        adminProfile: { count: () => Promise.reject(new Error('db down')) },
        staffRate: { count: () => Promise.reject(new Error('db down')) },
      } as unknown as PrismaService;
      const svc = new StaffSettingsService(
        { all: () => Promise.resolve({}) } as unknown as AppSettingsService,
        broken,
      );
      expect(await svc.isOn('staff.rating_enabled')).toBe(true);
      expect(await svc.isActive('staff.rating_enabled')).toBe(false);
    });
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

  it('a switch is on only for a stored true (not "true", not 1)', () => {
    const s = resolveStaffSettings({
      'staff.rating_enabled': true,
      'staff.head_enabled': 'true',
      'staff.desk_enabled': 1,
    });
    expect(s.switches['staff.rating_enabled']).toBe(true);
    expect(s.switches['staff.head_enabled']).toBe(false);
    expect(s.switches['staff.desk_enabled']).toBe(false);
  });

  it('AI sub-switches need the AI master switch; queue lease switches need staff.lease_enabled', () => {
    const subOnly = resolveStaffSettings({
      'staff.ai_qa_enabled': true,
      'staff.ai_hint_enabled': true,
      'staff.lease_support_enabled': true,
    });
    expect(subOnly.switches['staff.ai_qa_enabled']).toBe(false);
    expect(subOnly.switches['staff.ai_hint_enabled']).toBe(false);
    expect(subOnly.switches['staff.lease_support_enabled']).toBe(false);
    const withMaster = resolveStaffSettings({
      'staff.ai_enabled': true,
      'staff.ai_qa_enabled': true,
      'staff.lease_enabled': true,
      'staff.lease_support_enabled': true,
    });
    expect(withMaster.switches['staff.ai_qa_enabled']).toBe(true);
    expect(withMaster.switches['staff.ai_summary_enabled']).toBe(false);
    expect(withMaster.switches['staff.lease_support_enabled']).toBe(true);
  });

  it('the admin editor knows every key: switches are booleans or off/on/auto strings, numbers are bounded integers with a Russian label', () => {
    const schema = configSchema();
    for (const k of STAFF_SWITCH_KEYS) {
      if ((STAFF_MODE_KEYS as readonly string[]).includes(k)) {
        expect(schema[k]).toMatchObject({
          type: 'string',
          defaultValue: 'auto',
        });
        expect(schema[k].description).toContain('Авто: ');
        expect(validateConfigValue(schema[k], 'auto')).toBeNull();
        expect(validateConfigValue(schema[k], 'off')).toBeNull();
        expect(validateConfigValue(schema[k], 'sometimes')).not.toBeNull();
      } else {
        expect(schema[k]).toMatchObject({
          type: 'boolean',
          defaultValue: APP_SETTINGS[k],
        });
      }
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

  it('GET admin/staff/settings returns the resolved switches (owner pages on, workflow off) and numbers', async () => {
    const { svc } = service();
    const out = await new StaffSettingsController(svc).getStaffSettings();
    expect(out.switches['staff.owner_home_enabled']).toBe(true);
    expect(out.switches['staff.rating_enabled']).toBe(true);
    expect(out.switches['staff.desk_enabled']).toBe(false);
    expect(out.numbers['staff.rating.window_days']).toBe(30);
  });
});
