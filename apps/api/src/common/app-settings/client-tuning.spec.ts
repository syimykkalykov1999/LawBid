import {
  configSchema,
  validateConfigValue,
} from '../../modules/admin-config/config-schema';
import { PUBLIC_CONFIG_PREFIXES } from '../../modules/feature-flags/services/bootstrap.service';
import { APP_SETTINGS } from './app-settings.defaults';
import { CLIENT_TUNING_DEFS, effectivePrefetch } from './client-tuning';

describe('client tuning knobs (scale audit 2026-10-23)', () => {
  const schema = configSchema();
  const isPublic = (key: string) =>
    PUBLIC_CONFIG_PREFIXES.some((p) => key.startsWith(p));

  it('every client.* default is in APP_SETTINGS and sent to the app', () => {
    for (const [key, def] of Object.entries(CLIENT_TUNING_DEFS)) {
      expect(APP_SETTINGS).toHaveProperty([key], def.default);
      expect(isPublic(key)).toBe(true);
      expect(schema[key].description).toBe(def.description);
    }
  });

  it('defaults sit inside their own bounds', () => {
    for (const [key, def] of Object.entries(CLIENT_TUNING_DEFS)) {
      if (typeof def.default !== 'number') continue;
      expect(validateConfigValue(schema[key], def.default)).toBeNull();
    }
  });

  it('refuses values that would silence or hammer the app', () => {
    // A retry stampede (0 ms, 100 retries) and a day-long silence are both out.
    expect(
      validateConfigValue(schema['client.retry_base_ms'], 0),
    ).not.toBeNull();
    expect(validateConfigValue(schema['client.retry_max'], 100)).not.toBeNull();
    expect(
      validateConfigValue(schema['client.realtime_reconnect_max_ms'], 1),
    ).not.toBeNull();
    expect(
      validateConfigValue(schema['client.events_flush_s'], 86_400),
    ).not.toBeNull();
    expect(validateConfigValue(schema['client.retry_max'], 3)).toBeNull();
  });

  it('the store link is https only and public (the iOS id is unknown before release)', () => {
    for (const p of ['ios', 'android']) {
      const s = schema[`store_url_${p}`];
      expect(isPublic(`store_url_${p}`)).toBe(true);
      expect(
        validateConfigValue(s, 'https://apps.apple.com/app/id1'),
      ).toBeNull();
      expect(validateConfigValue(s, 'itms-apps://x')).not.toBeNull();
      expect(validateConfigValue(s, 'javascript:alert(1)')).not.toBeNull();
    }
  });

  it('chat photo size is tunable, inside sane bounds', () => {
    expect(isPublic('media.chat_photo_max_px')).toBe(true);
    expect(
      validateConfigValue(schema['media.chat_photo_max_px'], 100),
    ).not.toBeNull();
    expect(
      validateConfigValue(schema['media.chat_photo_quality'], 82),
    ).toBeNull();
  });

  it('guest browsing: off in the apps, on for the website, both public', () => {
    // Owner 2026-10-23: no guest browsing in the iOS / Android apps unless
    // the admin switches it on; the website keeps today's behaviour.
    expect(CLIENT_TUNING_DEFS['client.guest_browse_app_enabled'].default).toBe(
      false,
    );
    expect(CLIENT_TUNING_DEFS['client.guest_browse_web_enabled'].default).toBe(
      true,
    );
    expect(APP_SETTINGS).toHaveProperty(
      ['client.guest_browse_app_enabled'],
      false,
    );
    expect(isPublic('client.guest_browse_app_enabled')).toBe(true);
    expect(isPublic('client.guest_browse_web_enabled')).toBe(true);
    // Booleans: no numeric bounds, true / false are accepted, text is not.
    for (const k of [
      'client.guest_browse_app_enabled',
      'client.guest_browse_web_enabled',
    ]) {
      expect(validateConfigValue(schema[k], true)).toBeNull();
      expect(validateConfigValue(schema[k], false)).toBeNull();
      expect(validateConfigValue(schema[k], 'yes')).not.toBeNull();
    }
  });
});

describe('S20-9 reel warm-up switch', () => {
  const base = { ahead: 3, cellular: 1, bunnyOver: false } as const;
  it('off: nothing is warmed up', () => {
    expect(effectivePrefetch({ ...base, mode: 'off' })).toEqual({
      ahead: 0,
      cellular: 0,
    });
  });
  it('on: the same number on every network', () => {
    expect(effectivePrefetch({ ...base, mode: 'on' })).toEqual({
      ahead: 3,
      cellular: 3,
    });
  });
  it('auto: fewer on mobile data, never more than Wi-Fi', () => {
    expect(effectivePrefetch({ ...base, mode: 'auto' })).toEqual({
      ahead: 3,
      cellular: 1,
    });
    expect(effectivePrefetch({ ...base, mode: 'auto', cellular: 6 })).toEqual({
      ahead: 3,
      cellular: 3,
    });
  });
  it('auto: 0 while Bunny traffic is over its warning level; on ignores it', () => {
    expect(
      effectivePrefetch({ ...base, mode: 'auto', bunnyOver: true }),
    ).toEqual({ ahead: 0, cellular: 0 });
    expect(effectivePrefetch({ ...base, mode: 'on', bunnyOver: true })).toEqual(
      { ahead: 3, cellular: 3 },
    );
  });
  it('the mode only accepts off / on / auto', () => {
    const s = configSchema()['client.video_prefetch_mode'];
    expect(validateConfigValue(s, 'auto')).toBeNull();
    expect(validateConfigValue(s, 'sometimes')).not.toBeNull();
  });
});
