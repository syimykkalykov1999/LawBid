import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APP_SETTINGS } from '../common/app-settings/app-settings.defaults';

/**
 * A new `*.mode` / `*_mode` / `*_enabled` / `*.enabled` setting must get a
 * row in docs/dev/SWITCH_INVENTORY.md (key, label, default, reader,
 * ceiling) and, if it starts money or load, a case in
 * common/app-settings/switch-contract.spec.ts.
 */
const DOC = resolve(__dirname, '../../../../docs/dev/SWITCH_INVENTORY.md');
const SWITCH = /(\.mode|_mode|_enabled|\.enabled)$/;

describe('switch inventory', () => {
  const doc = readFileSync(DOC, 'utf8');
  const keys = Object.keys(APP_SETTINGS).filter((k) => SWITCH.test(k));

  it('finds the switches (guards the regex itself)', () => {
    expect(keys.length).toBeGreaterThan(15);
  });

  it.each(keys)('%s has a row in SWITCH_INVENTORY.md', (key) => {
    expect(doc).toContain(`| \`${key}\` |`);
  });

  it('has no row for a setting that no longer exists', () => {
    const rows = [...doc.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);
    expect(rows.filter((r) => !(r in APP_SETTINGS))).toEqual([]);
  });
});
