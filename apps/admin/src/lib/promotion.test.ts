import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canOpen } from './rbac';
import { CHANNELS, ORDER_STEPS, SWITCHES, builtAtText, progressText, statusLines, switchInfo } from './promotion';

const API_CATALOG = path.join(__dirname, '../../../api/src/modules/admin-promotion/promotion.catalog.ts');
const API_FILE = readFileSync(API_CATALOG, 'utf8');

/** Reads `export const NAME = [ 'a', 'b' ] as const` out of the API catalog. */
function apiList(name: string): string[] {
  const m = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`).exec(API_FILE);
  if (!m) throw new Error(`${name} not found in the API catalog`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe('Продвижение: texts match the API catalog', () => {
  it('every switch the API can send has a plain-Russian text, in the API order', () => {
    expect(SWITCHES.map((s) => s.key).sort()).toEqual(apiList('SEO_SWITCH_KEYS').sort());
    const byStep = [...SWITCHES].sort((a, b) => a.step - b.step).map((s) => s.key);
    const api = apiList('SEO_SWITCH_KEYS');
    expect(byStep.filter((k) => k !== 'seo.generator_mode')).toEqual(api.filter((k) => k !== 'seo.generator_mode'));
  });

  it('every checklist item the API stores has a card, in the same order', () => {
    expect(CHANNELS.map((c) => c.id)).toEqual(apiList('CHECKLIST_IDS'));
  });

  it('each card says what the system does and what the owner clicks; names are English', () => {
    for (const c of CHANNELS) {
      expect(c.system.length, c.id).toBeGreaterThan(10);
      expect(c.owner.length, c.id).toBeGreaterThan(0);
      expect(c.name, c.id).toMatch(/[A-Za-z]/);
      if (c.href) expect(c.href, c.id).toMatch(/^https:\/\//);
    }
    const names = CHANNELS.map((c) => c.name).join(' | ');
    for (const n of ['Google Search Console', 'Bing Webmaster', 'IndexNow', 'Google Business Profile', 'Apple Business Connect', 'App Store Connect', 'Play Console', 'Justia', 'Avvo', 'FindLaw', 'Yelp', 'BBB', 'Reddit', 'Quora', 'YouTube', 'TikTok', 'Instagram', 'Facebook']) {
      expect(names).toContain(n);
    }
  });

  it('switches that matter carry a warning, and the order has five steps', () => {
    expect(switchInfo('seo.quality_gate_enabled')?.warn).toContain('пробный запуск');
    expect(switchInfo('seo.sitemap_index_enabled')?.warn).toContain('Search Console');
    expect(ORDER_STEPS).toHaveLength(5);
    expect(switchInfo('seo.generator_mode')?.choices?.map((c) => c.value)).toEqual(['off', 'nightly', 'nightly+events']);
  });

  it('the page is for the owner and for admins the owner granted; nobody else', () => {
    expect(canOpen({ role: 'super_admin' }, '/promotion')).toBe(true);
    expect(canOpen({ role: 'moderator', permissions: { settings: 'manage' } }, '/promotion')).toBe(false);
    expect(canOpen({ role: 'moderator', permissions: { promotion: 'view' } }, '/promotion')).toBe(true);
  });
});

describe('Продвижение: small helpers', () => {
  it('says the date and the progress in words', () => {
    expect(builtAtText('2026-10-27')).toBe('27 октября 2026 г.');
    expect(builtAtText(null)).toBe('неизвестно');
    expect(progressText(3, 11)).toBe('3 из 11');
  });

  it('status lines show the ramp only when it is on', () => {
    const base = { builtAt: '2026-10-27', pages: 12000, indexed: 9000, noindex: 3000, rampPerDay: null, rampDeferred: null };
    expect(statusLines(base).map((l) => l.label)).toEqual([
      'Последняя сборка',
      'Страниц опубликовано',
      'Открыто для поиска',
      'Закрыто от поиска (noindex)',
    ]);
    const ramp = statusLines({ ...base, rampPerDay: 200, rampDeferred: 40 });
    expect(ramp.at(-1)).toEqual({ label: 'Ждут своей очереди', value: '40' });
    expect(statusLines({ ...base, rampPerDay: 0, rampDeferred: 5 })).toHaveLength(4);
  });
});
