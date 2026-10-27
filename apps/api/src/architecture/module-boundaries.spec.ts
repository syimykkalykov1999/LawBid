import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  describePlan,
  formatBaseline,
  planBaseline,
  scanBoundaries,
  type BoundariesSnapshot,
} from './module-boundaries.scan';

/**
 * Owner 2026-10-14 (architecture audit, step 1): modules do not reach into
 * each other's insides. Rule: from module A, an import of module B may only
 * name a file at the root of B's folder (its public face: `b.module.ts`,
 * `b.service.ts`, `b.types.ts` …), never B's sub-folders.
 *
 * The code grew before the rule, so today's violations are recorded in
 * `module-boundaries.baseline.json` (an APPROVED set) and may only SHRINK: a
 * new one fails this test, and so does a recorded one that was fixed.
 *
 * Second rule: a module's fan-out (how many other modules it imports) may
 * not grow past the recorded number — the "cases depends on 25 modules"
 * problem cannot get worse unnoticed.
 *
 * Nobody edits the file by hand (parallel PRs collided on it): run
 * `npm run arch:baseline --workspace apps/api` (see scripts/arch-baseline.ts;
 * `-- --approve` accepts a new, intended dependency). The test compares the
 * file with the generated canonical form, sorted, byte for byte.
 */
const SRC = resolve(__dirname, '..');
const BASELINE = join(__dirname, 'module-boundaries.baseline.json');
const HOW = 'Run `npm run arch:baseline --workspace apps/api`.';

describe('module boundaries (architecture rules)', () => {
  const now = scanBoundaries(SRC);
  const raw = readFileSync(BASELINE, 'utf8');
  const base = JSON.parse(raw) as BoundariesSnapshot;
  const plan = planBaseline(now, base);

  it('no new import into another module’s sub-folders', () => {
    expect(plan.newDeep).toEqual([]);
  });

  it('a fixed violation is removed from the baseline (it only shrinks)', () => {
    const current = new Set(now.deep);
    expect(base.deep.filter((d) => !current.has(d))).toEqual([]);
  });

  it('no module depends on more modules than recorded', () => {
    expect(plan.grown).toEqual([]);
  });

  it('the baseline file is exactly the generated, sorted form', () => {
    // Only meaningful once the rules above hold; otherwise they explain why.
    if (!plan.clean) return;
    if (raw !== formatBaseline(plan.baseline)) {
      throw new Error(
        `module-boundaries.baseline.json is stale or hand-edited. ${HOW}\n${describePlan(plan)}`,
      );
    }
  });
});
