import { OWNER_CACHE_SETTINGS } from './app-settings.defaults';

// Owner 2026-11-03: the media stores have no ceiling of their own, so the
// phone's «Максимальный размер кэша» (default 10 GB) is what governs them.
describe('OWNER_CACHE_SETTINGS', () => {
  it('sends no per-store ceiling for the media stores (0 = none)', () => {
    for (const k of ['images', 'chat_media', 'files', 'video'] as const) {
      expect(OWNER_CACHE_SETTINGS[`cache.limit_mb.${k}`]).toBe(0);
    }
  });

  it('keeps the small non-media ceilings and no keep-media knob', () => {
    expect(OWNER_CACHE_SETTINGS['cache.limit_mb.http']).toBeGreaterThan(0);
    expect(OWNER_CACHE_SETTINGS['cache.limit_mb.messages']).toBeGreaterThan(0);
    expect(Object.keys(OWNER_CACHE_SETTINGS)).not.toContain(
      'cache.keep_media_days.default',
    );
  });
});
