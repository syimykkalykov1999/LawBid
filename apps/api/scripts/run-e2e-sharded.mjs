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
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const shardsArg = args.find((a) => a.startsWith('--shards='));
const shards = Number(shardsArg?.split('=')[1] ?? process.env.E2E_SHARDS ?? 3);
const rest = args.filter((a) => !a.startsWith('--shards='));
const jest = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const outDir = mkdtempSync(join(tmpdir(), 'e2e-shards-'));
const summaries = [];
function summarize(i) {
  const file = join(outDir, `shard-${i}.json`);
  if (!existsSync(file)) {
    return `shard ${i}/${shards}: no jest result (the process died before writing it; see the exit code above)`;
  }
  try {
    const j = JSON.parse(readFileSync(file, 'utf8'));
    const lines = [
      `shard ${i}/${shards}: ${j.numFailedTests} failed test(s) in ${j.numFailedTestSuites} suite(s) of ${j.numTotalTestSuites}`,
    ];
    for (const suite of j.testResults) {
      if (suite.status !== 'failed') continue;
      const name = suite.name.replace(/^.*\/test\//, 'test/');
      const bad = suite.assertionResults.filter((a) => a.status === 'failed');
      if (bad.length === 0) {
        lines.push(`  FAIL ${name}: ${String(suite.message).split('\n')[0]}`);
      }
      for (const a of bad) {
        lines.push(`  FAIL ${name} › ${a.fullName}`);
        lines.push(
          `      ${String(a.failureMessages[0] ?? '')
            .replace(/\u001b\[[0-9;]*m/g, '')
            .split('\n')
            .slice(0, 4)
            .join('\n      ')}`,
        );
      }
    }
    return lines.join('\n');
  } catch (e) {
    return `shard ${i}/${shards}: cannot read the jest result (${e.message})`;
  }
}

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
      // Each shard also writes its result, so the failures can be listed
      // once more at the very end of a long log.
      '--json',
      `--outputFile=${join(outDir, `shard-${i}.json`)}`,
      ...rest,
    ],
    { stdio: 'inherit', env: process.env },
  );
  if (r.status !== 0) {
    failed += 1;
    summaries.push(summarize(i));
    console.error(
      `e2e shard ${i}/${shards} failed (exit ${r.status}, signal ${r.signal})`,
    );
  }
}
if (failed > 0) {
  console.error('\n=== failed e2e tests (summary) ===');
  for (const s of summaries) console.error(s);
  console.error(`\n${failed} of ${shards} e2e shards failed`);
  process.exit(1);
}
console.log(`\nall ${shards} e2e shards passed`);
