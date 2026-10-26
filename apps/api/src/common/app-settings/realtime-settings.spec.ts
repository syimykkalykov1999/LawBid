import { APP_SETTINGS } from './app-settings.defaults';
import {
  OWNER_REALTIME_SETTINGS,
  REALTIME_SETTING_DEFS,
  clientTimingsFrom,
} from './realtime-settings';
import { configSchema } from '../../modules/admin-config/config-schema';

describe('realtime settings (owner 2026-10-23)', () => {
  it('the literal defaults match the definitions list', () => {
    const fromList = Object.fromEntries(
      REALTIME_SETTING_DEFS.map((d) => [d.key, d.default]),
    );
    expect(OWNER_REALTIME_SETTINGS).toEqual(fromList);
    for (const [k, v] of Object.entries(OWNER_REALTIME_SETTINGS)) {
      expect((APP_SETTINGS as Record<string, unknown>)[k]).toBe(v);
    }
  });

  it("defaults are the doc's and every default is inside its range", () => {
    const t = clientTimingsFrom({});
    expect(t).toMatchObject({
      reconnectMinMs: 1000,
      reconnectMaxMs: 30_000,
      reconnectJitter: 0.5,
      serverDisconnectMinWaitMs: 1000,
      serverDisconnectMaxWaitMs: 15_000,
      offlineFailures: 2,
      offlineSeconds: 8,
      probeTimeoutMs: 3000,
      tokenRefreshLeadSeconds: 120,
      pollingFallbackIntervalSeconds: 30,
      pingIntervalMs: 25_000,
      pingTimeoutMs: 20_000,
    });
    for (const d of REALTIME_SETTING_DEFS) {
      expect(d.default).toBeGreaterThanOrEqual(d.min);
      expect(d.default).toBeLessThanOrEqual(d.max);
    }
  });

  it('a stored value wins; a bad or out-of-range one falls back', () => {
    const t = clientTimingsFrom({
      'realtime.reconnect_max_ms': 45_000,
      'realtime.reconnect_min_ms': 'fast',
      'realtime.offline_failures': 99,
      'realtime.reconnect_jitter': 0.8,
    });
    expect(t.reconnectMaxMs).toBe(45_000);
    expect(t.reconnectMinMs).toBe(1000);
    expect(t.offlineFailures).toBe(2);
    expect(t.reconnectJitter).toBe(0.8);
  });

  it('the old client.realtime_reconnect_* keys are a read-only alias for one release (dedup D-11)', () => {
    // Stored by the owner before the keys were merged: honoured while the
    // new key is not stored, never when the new one is.
    expect(
      clientTimingsFrom({ 'client.realtime_reconnect_max_ms': 20_000 })
        .reconnectMaxMs,
    ).toBe(20_000);
    expect(
      clientTimingsFrom({
        'client.realtime_reconnect_max_ms': 20_000,
        'realtime.reconnect_max_ms': 45_000,
      }).reconnectMaxMs,
    ).toBe(45_000);
    // Out of the new bounds: ignored.
    expect(
      clientTimingsFrom({ 'client.realtime_reconnect_min_ms': 5 })
        .reconnectMinMs,
    ).toBe(1000);
    // And no longer a setting of its own.
    expect(APP_SETTINGS).not.toHaveProperty('client.realtime_reconnect_max_ms');
    expect(configSchema()).not.toHaveProperty(
      'client.realtime_reconnect_min_ms',
    );
  });

  it('server-only keys never reach the app', () => {
    const t = clientTimingsFrom({});
    expect(
      Object.keys(t).some((k) => /grace|going|shed|expiringLead/i.test(k)),
    ).toBe(false);
  });

  it('every key is editable in the admin with a Russian label and its key', () => {
    const schema = configSchema();
    for (const d of REALTIME_SETTING_DEFS) {
      const s = schema[d.key];
      expect(s).toBeDefined();
      expect(s.description).toContain(d.key);
      expect(s.description).toMatch(/[а-яё]/i);
      expect(s.min).toBe(d.min);
      expect(s.max).toBe(d.max);
    }
  });
});
