import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyBlock } from '../../../scripts/sync-flag-defaults';
import { FLAG_CATALOG } from './flag-catalog';

describe('FLAG_CATALOG — the one list of feature flags', () => {
  it('has unique keys and a description for each', () => {
    const keys = FLAG_CATALOG.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of FLAG_CATALOG) {
      expect(f.key).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(f.description.length).toBeGreaterThan(5);
    }
  });

  it("the app's first-paint defaults are the catalog (run `npm run flags:sync` when this fails)", () => {
    const file = join(
      __dirname,
      '../../../../mobile/lib/core/feature_flags/default_feature_flags.dart',
    );
    const current = readFileSync(file, 'utf8');
    expect(applyBlock(current)).toBe(current);
  });

  it('every flag the admin page describes exists in the catalog', () => {
    const page = readFileSync(
      join(__dirname, '../../../../admin/src/app/(app)/flags/page.tsx'),
      'utf8',
    );
    const described = [...page.matchAll(/^ {2}([a-z][a-z0-9_]*): \{$/gm)].map(
      (m) => m[1],
    );
    const keys = new Set(FLAG_CATALOG.map((f) => f.key));
    const unknown = described.filter((k) => !keys.has(k));
    expect(unknown).toEqual([]);
  });

  // Owner 2026-10-22 (audit #4 §8; dropped X-6, 2026-10-26): the «Справочник»
  // switches are gone for good.
  it('no guide section flag is left', () => {
    expect(FLAG_CATALOG.some((f) => f.key.startsWith('guide_section_'))).toBe(
      false,
    );
  });
});
