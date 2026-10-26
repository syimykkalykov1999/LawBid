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
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const all = args.includes('--all');
const rest = args.filter((a) => a !== '--all');
const cfg = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '..', 'test', 'two-db-suites.json'),
    'utf8',
  ),
);

console.log(
  `two-DB e2e: ${cfg.run.length} suite(s) must pass; ` +
    `${cfg.knownLimitations.length} known limitation(s) not run:`,
);
for (const k of cfg.knownLimitations)
  console.log(`  - ${k.spec} (${k.kind}) ${k.fixedBy}`);

const paths = all ? [] : cfg.run.map((s) => `test/${s}.e2e-spec.ts`);
// One jest process per batch of suites keeps memory bounded (84 suites in
// one process outgrow the CI runner's heap); a batch is the unit of failure.
const BATCH = Number(process.env.E2E_TWO_DB_BATCH || 20);
const batches = [];
if (paths.length === 0) batches.push([]);
for (let i = 0; i < paths.length; i += BATCH) {
  batches.push(paths.slice(i, i + BATCH));
}
let status = 0;
let n = 0;
for (const batch of batches) {
  // The native Prisma engine can SIGSEGV while jest force-exits a finished
  // run; the JSON report says what the tests did, the exit status only
  // decides when no report was written.
  const report = join(tmpdir(), `two-db-e2e-${process.pid}-${n++}.json`);
  const r = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    [
      'jest',
      '--config',
      './test/jest-e2e.json',
      '--forceExit',
      '--json',
      `--outputFile=${report}`,
      ...batch,
      ...rest,
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, E2E_TWO_DB: process.env.E2E_TWO_DB || 'all' },
      cwd: join(import.meta.dirname, '..'),
    },
  );
  let ok = (r.status ?? 1) === 0;
  try {
    ok = JSON.parse(readFileSync(report, 'utf8')).success === true;
  } catch {
    // no report: keep the exit status
  }
  if (!ok) {
    console.error(`two-DB e2e batch failed (exit ${r.status ?? r.signal})`);
    status = 1;
  } else if ((r.status ?? 1) !== 0) {
    console.warn(
      `two-DB e2e batch passed; jest exited with ${r.status ?? r.signal} on teardown`,
    );
  }
}
process.exit(status);
