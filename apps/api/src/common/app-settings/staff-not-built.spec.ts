import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { configSchema } from '../../modules/admin-config/config-schema';
import {
  STAFF_NOT_BUILT,
  STAFF_NOT_BUILT_NOTE,
  STAFF_NUMBER_DEFS,
  STAFF_SWITCH_LABELS,
} from './staff-settings';

const SRC = join(__dirname, '..', '..');

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
      out.push(p);
    }
  }
  return out;
}

// Admin switch audit 12.11: a staff switch or number nothing reads must say
// so in the admin, and the mark must go once the feature reads it.
describe('staff settings that are not built yet', () => {
  const known = new Set([
    ...Object.keys(STAFF_SWITCH_LABELS),
    ...Object.keys(STAFF_NUMBER_DEFS),
  ]);

  it('every marked key is a real staff setting', () => {
    for (const k of STAFF_NOT_BUILT) expect(known.has(k)).toBe(true);
  });

  it('the admin description says «Пока не действует» for exactly these keys', () => {
    const schema = configSchema();
    for (const k of known) {
      const d = schema[k]?.description ?? '';
      expect([k, d.includes(STAFF_NOT_BUILT_NOTE)]).toEqual([
        k,
        STAFF_NOT_BUILT.has(k),
      ]);
    }
  });

  it('no code reads a marked key (drop the mark when the feature is built)', () => {
    const skip = new Set([
      join(SRC, 'common', 'app-settings', 'staff-settings.ts'),
      // Only passes the switch values to the desk; the admin reads none of
      // the marked ones.
      join(SRC, 'modules', 'staff-core', 'staff-desk-read.controller.ts'),
    ]);
    const readers: string[] = [];
    for (const f of sources(SRC)) {
      if (skip.has(f)) continue;
      const text = readFileSync(f, 'utf8');
      for (const k of STAFF_NOT_BUILT) {
        if (text.includes(`'${k}'`)) readers.push(`${k} in ${f}`);
      }
    }
    expect(readers).toEqual([]);
  });
});
