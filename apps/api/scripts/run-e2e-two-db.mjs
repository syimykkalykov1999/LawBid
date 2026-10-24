#!/usr/bin/env node
// Shard-ready step 5 (docs/architecture/SHARDING_READY.md §6 "Tests"): runs
// the two-database e2e subset. `shard_map` sends logical shards to a second
// database (a second Postgres database on the same server), the
// foreign keys between families are dropped (as plan step 9 will do), and
// the suites listed in test/two-db-suites.json under "run" must be green.
// E2E_TWO_DB=all (default here, deterministic: every shard on the second
// database) or E2E_TWO_DB=odd (the plan's mixed map; depends on whether the
// random user ids are odd, so a green run proves less and a red one is not
// always a bug).
// "knownLimitations" lists the suites that cannot work yet, with the reason
// and the plan step that fixes them; they are reported, not run.
//
// Usage: node scripts/run-e2e-two-db.mjs [--all] [jest args...]
//   --all  run every suite, limitations included (to re-measure the list)
// Needs the same Postgres + Redis (+ MinIO) as `npm run test:e2e`.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const all = args.includes('--all');
const rest = args.filter((a) => a !== '--all');
const cfg = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'test', 'two-db-suites.json'), 'utf8'),
);

console.log(
  `two-DB e2e: ${cfg.run.length} suite(s) must pass; ` +
    `${cfg.knownLimitations.length} known limitation(s) not run:`,
);
for (const k of cfg.knownLimitations) console.log(`  - ${k.spec} (${k.kind}) ${k.fixedBy}`);

const paths = all ? [] : cfg.run.map((s) => `test/${s}.e2e-spec.ts`);
const r = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['jest', '--config', './test/jest-e2e.json', '--forceExit', ...paths, ...rest],
  {
    stdio: 'inherit',
    env: { ...process.env, E2E_TWO_DB: process.env.E2E_TWO_DB || 'all' },
    cwd: join(import.meta.dirname, '..'),
  },
);
process.exit(r.status ?? 1);
