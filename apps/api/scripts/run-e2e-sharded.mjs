#!/usr/bin/env node
// Runs the e2e suites in SHARDS, one fresh process each, one after another.
//
// Why: jest keeps every finished suite's module graph (the vm context) in
// memory for the rest of the run (measured 40–60 MB per suite after a
// forced GC, with no open handles or leaked listeners left), so one process
// running ~100 suites grows past 5.9 GB and the CI job aborts (exit 134).
// A fresh process per shard bounds the heap at the size of one shard
// (~35 suites), whatever the number of suites. The suites share one
// database and are not parallel-safe, so the shards run in turn.
//
// Usage: node scripts/run-e2e-sharded.mjs [--shards=3] [jest args...]
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const shardsArg = args.find((a) => a.startsWith('--shards='));
const shards = Number(shardsArg?.split('=')[1] ?? process.env.E2E_SHARDS ?? 3);
const rest = args.filter((a) => !a.startsWith('--shards='));
const jest = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const results = [];
let failed = 0;
for (let i = 1; i <= shards; i += 1) {
  console.log(`\n=== e2e shard ${i}/${shards} ===`);
  const r = spawnSync(
    jest,
    [
      'jest',
      '--config',
      './test/jest-e2e.json',
      `--shard=${i}/${shards}`,
      '--forceExit',
      ...rest,
    ],
    { stdio: 'inherit', env: process.env },
  );
  results.push({ shard: i, status: r.status });
  if (r.status !== 0) {
    failed += 1;
    console.error(`e2e shard ${i}/${shards} failed (exit ${r.status})`);
  }
}
// The one-line verdict per shard at the very end, so the CI tail shows
// which shard failed without scrolling through the logs.
console.log('\n=== e2e shard summary ===');
for (const { shard, status } of results) {
  console.log(
    `shard ${shard}/${shards}: ${status === 0 ? 'passed' : `FAILED (exit ${status})`}`,
  );
}
if (failed > 0) {
  console.error(`\n${failed} of ${shards} e2e shards failed`);
  process.exit(1);
}
console.log(`\nall ${shards} e2e shards passed`);
