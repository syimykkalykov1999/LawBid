import { APP_SETTINGS } from './app-settings.defaults';
import {
  HOTLINE_SETTING_DEFS,
  hotlineBandsFrom,
  minutesBand,
  placeBand,
  OWNER_HOTLINE_SETTINGS,
  bandOf,
  hotlineCounterBandsFrom,
  hotlineModeFrom,
  hotlineSettingsFrom,
} from './hotline-settings';
import {
  configSchema,
  validateConfigValue,
} from '../../modules/admin-config/config-schema';

describe('hotline settings (owner row 87, 16.11)', () => {
  it('the literal defaults match the definitions list and reach APP_SETTINGS', () => {
    const fromList = Object.fromEntries(
      HOTLINE_SETTING_DEFS.map((d) => [d.key, d.default]),
    );
    const {
      'hotline.mode': mode,
      'hotline.short_notice_enabled': shortNotice,
      'hotline.counter_bands': bands,
      'hotline.waiting_more_bands': waitingMore,
      'hotline.position_bands': place,
      'hotline.wait_band_minutes': waitMin,
      'hotline.review_enabled': review,
      'hotline.client_steps_enabled': steps,
      ...numbers
    } = OWNER_HOTLINE_SETTINGS;
    expect(numbers).toEqual(fromList);
    expect(mode).toBe('on_for_all');
    expect(shortNotice).toBe(false);
    expect(bands).toEqual([1, 10, 50, 100]);
    expect(waitingMore).toEqual([1, 2, 5, 10, 50]);
    expect(place).toEqual([1, 5, 20]);
    expect(waitMin).toEqual([5, 15, 30]);
    expect(review).toBe(true);
    expect(steps).toBe(true);
    for (const [k, v] of Object.entries(OWNER_HOTLINE_SETTINGS)) {
      expect((APP_SETTINGS as Record<string, unknown>)[k]).toEqual(v);
    }
  });

  it('plan defaults: 10 s to answer, 25 s heartbeat (battery), 3 languages, 80 chars; owner-pending ones are off (0)', () => {
    const s = hotlineSettingsFrom({});
    expect(s['hotline.offer_timeout_sec']).toBe(10);
    expect(s['hotline.heartbeat_sec']).toBe(25);
    expect(s['hotline.max_languages']).toBe(3);
    expect(s['hotline.topic_max_chars']).toBe(80);
    // Owner 16.11 ~19:30: «Сообщите мне» — a 60 s claim, dropped after 3
    // unanswered notices, lives a day, 1.5 notices per free attorney, 200/s,
    // never at night (21–8 client time); counters every 5 s.
    expect(s['hotline.notify_claim_sec']).toBe(60);
    expect(s['hotline.notify_max_attempts']).toBe(3);
    expect(s['hotline.notify_max_wait_sec']).toBe(86_400);
    expect(s['hotline.notify_overbook_pct']).toBe(150);
    expect(s['hotline.notify_rate_per_sec']).toBe(200);
    expect(s['hotline.counters_interval_sec']).toBe(5);
    expect(s['hotline.notify_quiet_start_hour']).toBe(21);
    expect(s['hotline.notify_quiet_end_hour']).toBe(8);
    expect(s['hotline.max_queue_per_bucket']).toBe(500);
    // Owner answers 16.11: off the line after 3 misses in a row, no call
    // length limit, the disclosure text is version 1.
    expect(s['hotline.max_no_answer']).toBe(3);
    expect(s['hotline.call_max_minutes']).toBe(0);
    expect(s['hotline.disclosure_version']).toBe(1);
    // The TTL outlives two missed heartbeats.
    expect(s['hotline.presence_ttl_sec']).toBeGreaterThan(
      2 * s['hotline.heartbeat_sec'],
    );
  });

  it('a stored value wins; a bad or below-floor one falls back', () => {
    const s = hotlineSettingsFrom({
      'hotline.offer_timeout_sec': 20,
      'hotline.heartbeat_sec': 'x',
      'hotline.presence_ttl_sec': 1,
    });
    expect(s['hotline.offer_timeout_sec']).toBe(20);
    expect(s['hotline.heartbeat_sec']).toBe(25);
    expect(s['hotline.presence_ttl_sec']).toBe(60);
  });

  it('every key is editable in the admin with a Russian label, no ceiling (owner «no limits»)', () => {
    const schema = configSchema();
    for (const d of HOTLINE_SETTING_DEFS) {
      expect(schema[d.key]).toBeDefined();
      expect(schema[d.key].description).toContain('Горячая линия');
      expect(schema[d.key].description).toContain(d.key);
      expect(validateConfigValue(schema[d.key], d.default)).toBeNull();
      if (d.max === undefined) {
        expect(validateConfigValue(schema[d.key], 10 ** 9)).toBeNull();
      }
    }
  });

  it('«Вкл для всех / По подписке / Выкл для всех» like attachments; anything else refused and read as on_for_all', () => {
    const schema = configSchema();
    for (const m of ['by_subscription', 'off_for_all', 'on_for_all']) {
      expect(validateConfigValue(schema['hotline.mode'], m)).toBeNull();
      expect(hotlineModeFrom({ 'hotline.mode': m })).toBe(m);
    }
    expect(validateConfigValue(schema['hotline.mode'], 'free')).not.toBeNull();
    expect(hotlineModeFrom({})).toBe('on_for_all');
    expect(schema['hotline.mode'].defaultValue).toBe('on_for_all');
    expect(schema['hotline.short_notice_enabled'].defaultValue).toBe(false);
  });

  it('counter bands: clients see «нет / есть / 10+ / 50+ / 100+», never the exact count', () => {
    const b = hotlineCounterBandsFrom({});
    expect(b).toEqual([1, 10, 50, 100]);
    expect(
      [0, 1, 9, 10, 49, 50, 99, 100, 150_000].map((n) => bandOf(n, b)),
    ).toEqual(['0', '1', '1', '10+', '10+', '50+', '50+', '100+', '100+']);
    // Owner's own bands; a bad list (unsorted, zero, text) = the default.
    expect(
      hotlineCounterBandsFrom({ 'hotline.counter_bands': [1, 5, 20] }),
    ).toEqual([1, 5, 20]);
    for (const bad of [[10, 1], [0, 5], 'x', []]) {
      expect(hotlineCounterBandsFrom({ 'hotline.counter_bands': bad })).toEqual(
        [1, 10, 50, 100],
      );
    }
  });

  it('audit 17.11 #8: the place, wait and «Ещё звонят» steps are admin lists, not code; the old texts stay by default', () => {
    const schema = configSchema();
    for (const key of [
      'hotline.waiting_more_bands',
      'hotline.position_bands',
      'hotline.wait_band_minutes',
    ] as const) {
      expect(schema[key].description).toContain('Горячая линия');
      expect(validateConfigValue(schema[key], [2, 4])).toBeNull();
      expect(hotlineBandsFrom({ [key]: [2, 4] }, key)).toEqual([2, 4]);
      expect(hotlineBandsFrom({ [key]: [4, 2] }, key)).toEqual(
        OWNER_HOTLINE_SETTINGS[key],
      );
    }
    const place = hotlineBandsFrom({}, 'hotline.position_bands');
    expect([0, 1, 4, 5, 19, 20, 500].map((r) => placeBand(r, place))).toEqual([
      '1',
      '2-5',
      '2-5',
      '6-20',
      '6-20',
      '20+',
      '20+',
    ]);
    const wait = hotlineBandsFrom({}, 'hotline.wait_band_minutes');
    expect(
      [0, 4.9, 5, 14, 15, 29, 30, 999].map((m) => minutesBand(m, wait)),
    ).toEqual([
      'lt5',
      'lt5',
      '5to15',
      '5to15',
      '15to30',
      '15to30',
      'gt30',
      'gt30',
    ]);
    // the owner's own steps
    expect(placeBand(2, [3, 10])).toBe('1-3');
    expect(minutesBand(12, [10])).toBe('gt10');
  });
});
