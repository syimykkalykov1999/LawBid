/**
 * `npm run arch:baseline` — regenerate module-boundaries.baseline.json from
 * the current import graph instead of editing numbers by hand.
 *
 *   npm run arch:baseline                 prune fixed deep imports, lower
 *                                         fan-out numbers; exit 1 and print
 *                                         a diff if the code has a NEW deep
 *                                         import or a fan-out above its ceiling
 *   npm run arch:baseline -- --approve    accept what the code does now
 *                                         (a reviewer reads the git diff)
 *   npm run arch:baseline -- --check      write nothing; exit 1 if the file
 *                                         is not exactly the generated form
 *   --src <dir>                           use another `src` folder (tests)
 *
 * After a merge conflict in the baseline: take either side, then run with
 * --approve (both PRs' code is already merged and reviewed).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  describePlan,
  formatBaseline,
  planBaseline,
  scanBoundaries,
  type BoundariesSnapshot,
} from '../src/architecture/module-boundaries.scan';

const args = process.argv.slice(2);
// `--src <dir>` points at another `src` folder (the tests use a fixture).
const srcArg = args.indexOf('--src');
const SRC =
  srcArg >= 0 ? resolve(args[srcArg + 1]) : resolve(__dirname, '..', 'src');
const FILE = join(SRC, 'architecture', 'module-boundaries.baseline.json');
const approve = args.includes('--approve');
const check = args.includes('--check');

const base: BoundariesSnapshot = existsSync(FILE)
  ? (JSON.parse(readFileSync(FILE, 'utf8')) as BoundariesSnapshot)
  : { deep: [], fanOut: {} };
const plan = planBaseline(scanBoundaries(SRC), base, approve);
const text = formatBaseline(plan.baseline);
const same = existsSync(FILE) && readFileSync(FILE, 'utf8') === text;

if (!plan.clean && !approve) {
  console.error(
    'module boundaries: the code goes beyond the approved baseline:\n' +
      describePlan(plan) +
      '\n\nFix the import (use the other module’s public root file), or — if the ' +
      'new dependency is intended — run `npm run arch:baseline -- --approve` ' +
      'and commit the diff. Nothing was written.',
  );
  process.exit(1);
}
if (check) {
  if (!same) {
    console.error(
      'module-boundaries.baseline.json is not the generated form; run `npm run arch:baseline`.',
    );
    process.exit(1);
  }
  console.log('module-boundaries.baseline.json is up to date.');
} else if (same) {
  console.log('module-boundaries.baseline.json is up to date.');
} else {
  writeFileSync(FILE, text);
  console.log(
    `module-boundaries.baseline.json rewritten${approve ? ' (approved)' : ''}.` +
      (plan.fixedDeep.length || plan.newDeep.length || plan.grown.length
        ? '\n' + describePlan(plan)
        : ''),
  );
}
