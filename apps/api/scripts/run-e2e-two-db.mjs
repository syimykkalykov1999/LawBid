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
// Usage: node scripts/run-e2e-two-db.mjs [--all] [--part=I/N] [jest args...]
//   --all  run every suite, limitations included (to re-measure the list)
//   --part=I/N  run only the I-th of N equal groups of the SAME batches (CI
//          matrix, deploy speed 25.11: 9 batches one after the other took 25 of
//          the 28 min of API CI). Every batch keeps exactly its files and order;
//          each part has its own databases, so together the N parts run every
//          suite of "run" once, as before.
// Needs the same Postgres + Redis (+ local S3) as `npm run test:e2e`.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const all = args.includes('--all');
const partArg = args.find((a) => a.startsWith('--part='));
const rest = args.filter((a) => a !== '--all' && !a.startsWith('--part='));
let part = null;
if (partArg) {
  const m = /^--part=(\d+)\/(\d+)$/.exec(partArg);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > Number(m[2])) {
    console.error(`bad ${partArg}: use --part=I/N with 1 <= I <= N`);
    process.exit(2);
  }
  part = { i: Number(m[1]), n: Number(m[2]) };
}
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
// --part: a contiguous slice of the batch list (the parts cover it exactly once).
const mine = part
  ? batches.slice(
      Math.floor((batches.length * (part.i - 1)) / part.n),
      Math.floor((batches.length * part.i) / part.n),
    )
  : batches;
if (part) {
  console.log(
    `part ${part.i}/${part.n}: ${mine.length} of ${batches.length} batch(es), ` +
      `${mine.reduce((k, b) => k + b.length, 0)} suite(s)`,
  );
}
// E2E_TWO_DB_LIST=1: print the files of this part and stop (proves the split).
if (process.env.E2E_TWO_DB_LIST === '1') {
  for (const b of mine) for (const f of b) console.log(f);
  process.exit(0);
}
let status = 0;
let n = 0;
for (const batch of mine) {
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
      env: {
        ...process.env,
        E2E_TWO_DB: process.env.E2E_TWO_DB || 'all',
        // NestJS 12 is ESM-only: Jest loads it through require(esm) (migration guide).
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --experimental-vm-modules`.trim(),
      },
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
