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
// S11-7 / S11-15 (CI): the same runner serves the GitHub matrix.
//   --only=N            run just shard N of --shards (one matrix job each; the
//                       shards of one job still share a database, so a matrix
//                       job has its own Postgres service)
//   one retry           a suite that failed is run once more on its own; a pass
//                       on retry is a FLAKE: the shard passes, the suite is listed
//                       in flaky.json (and as a warning + in the job summary), a
//                       second failure is a real failure. A process that died with
//                       no result (V8 SIGSEGV) is retried the same way, as a whole.
//   test/quarantine.json  suites skipped on PR / push runs (they are known flaky);
//                       `--quarantine=only` (nightly) runs just those and fails
//                       when one has been quarantined for more than 3 days.
//   E2E_OUT_DIR         where shard-N.json / flaky.json go (CI uploads it)
//
// Usage: node scripts/run-e2e-sharded.mjs [--shards=3] [--only=N] [--quarantine=only] [jest args...]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const shards = Number(flag('shards') ?? process.env.E2E_SHARDS ?? 3);
const only = flag('only') ? Number(flag('only')) : undefined;
const quarantineMode = flag('quarantine');
const rest = args.filter((a) => !/^--(shards|only|quarantine)=/.test(a));
const jest = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const outDir = process.env.E2E_OUT_DIR
  ? (mkdirSync(process.env.E2E_OUT_DIR, { recursive: true }), process.env.E2E_OUT_DIR)
  : mkdtempSync(join(tmpdir(), 'e2e-shards-'));
const flaky = [];
const quarantineFile = join(import.meta.dirname, '..', 'test', 'quarantine.json');
const quarantine = existsSync(quarantineFile)
  ? (JSON.parse(readFileSync(quarantineFile, 'utf8')).suites ?? [])
  : [];
const escapeRe = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const summaries = [];
function summarize(i, file = join(outDir, `shard-${i}.json`)) {
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

const baseArgs = ['jest', '--config', './test/jest-e2e.json', '--forceExit'];

function runJest(extra, outFile) {
  return spawnSync(jest, [...baseArgs, ...extra, '--json', `--outputFile=${outFile}`, ...rest], {
    stdio: 'inherit',
    env: process.env,
  });
}
function failedSuites(file) {
  if (!existsSync(file)) return null; // the process died before writing a result
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
      .testResults.filter((t) => t.status === 'failed')
      .map((t) => ({
        path: t.name,
        message: String(t.assertionResults.find((a) => a.status === 'failed')?.failureMessages?.[0] ?? t.message)
          .replace(/\u001b\[[0-9;]*m/g, '')
          .split('\n')[0],
      }));
  } catch {
    return null;
  }
}

// --- nightly: only the quarantined suites -------------------------------------
if (quarantineMode === 'only') {
  const old = quarantine.filter((q) => Date.now() - Date.parse(q.since) > 3 * 86400000);
  if (quarantine.length === 0) {
    console.log('quarantine is empty: nothing to run');
    process.exit(0);
  }
  const r = runJest(['--runTestsByPath', ...quarantine.map((q) => q.path)], join(outDir, 'quarantine.json'));
  if (old.length) {
    console.error(
      `::error::quarantined for more than 3 days: ${old.map((q) => q.path).join(', ')}. Fix the test or delete it; do not leave it here.`,
    );
  }
  for (const q of quarantine) console.log(`quarantined since ${q.since}: ${q.path} (${q.reason ?? 'no reason'})`);
  process.exit(r.status !== 0 || old.length ? 1 : 0);
}

const quarantineIgnore = quarantine.length
  ? ['--testPathIgnorePatterns', '/node_modules/', ...quarantine.flatMap((q) => ['--testPathIgnorePatterns', escapeRe(q.path)])]
  : [];
let failed = 0;
const toRun = only ? [only] : Array.from({ length: shards }, (_, k) => k + 1);
for (const i of toRun) {
  console.log(`\n=== e2e shard ${i}/${shards} ===`);
  const file = join(outDir, `shard-${i}.json`);
  const r = runJest([`--shard=${i}/${shards}`, ...quarantineIgnore], file);
  if (r.status === 0) continue;
  // One retry of just the failed suites (a process that died: the whole shard).
  const bad = failedSuites(file);
  console.warn(
    bad === null
      ? `\nshard ${i}/${shards} died without a result (exit ${r.status}, signal ${r.signal}): retrying it once`
      : `\nshard ${i}/${shards}: ${bad.length} suite(s) failed, retrying them once: ${bad.map((b) => b.path).join(', ')}`,
  );
  const retryFile = join(outDir, `shard-${i}-retry.json`);
  const retry =
    bad === null
      ? runJest([`--shard=${i}/${shards}`, ...quarantineIgnore], retryFile)
      : runJest(['--runTestsByPath', ...bad.map((b) => b.path)], retryFile);
  if (retry.status === 0) {
    for (const b of bad ?? [{ path: `shard ${i}/${shards} (process died)`, message: `exit ${r.status} signal ${r.signal}` }]) {
      flaky.push({ shard: i, suite: b.path.replace(/^.*\/test\//, 'test/'), firstFailure: b.message });
    }
    continue;
  }
  failed += 1;
  summaries.push(summarize(i, retryFile));
  console.error(`e2e shard ${i}/${shards} failed twice (exit ${retry.status}, signal ${retry.signal})`);
}
if (flaky.length) {
  writeFileSync(join(outDir, 'flaky.json'), JSON.stringify({ at: new Date().toISOString(), flaky }, null, 2));
  const lines = flaky.map((f) => `- ${f.suite} (shard ${f.shard}): ${f.firstFailure}`);
  console.warn(`::warning::flaky suites (failed once, passed on retry):\n${lines.join('\n')}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Passed on retry (flaky)\n${lines.join('\n')}\n\nAdd a suite to apps/api/test/quarantine.json if it keeps coming back.\n`,
    );
  }
}
if (failed > 0) {
  console.error('\n=== failed e2e tests (summary) ===');
  for (const s of summaries) console.error(s);
  console.error(`\n${failed} of ${toRun.length} e2e shards failed`);
  process.exit(1);
}
console.log(`\nall ${toRun.length} e2e shard(s) passed${flaky.length ? ` (${flaky.length} flaky suite(s) passed on retry)` : ''}`);
