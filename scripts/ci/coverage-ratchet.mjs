#!/usr/bin/env node
// S11-7: coverage may only go up. jest's coverageThreshold (apps/api/package.json,
// the floor, about 1.5 points under the measured value of 2026-10-25) FAILS the
// build when coverage drops below it. This script, run after the unit tests,
// reads coverage/coverage-summary.json and, when the real numbers are 3 or more
// points above the floor, says so in the job summary: raise the floor in the
// same PR (ratchet). It never fails by itself.
//   node scripts/ci/coverage-ratchet.mjs [workspace dir, default apps/api]
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'apps/api';
const summaryFile = join(dir, 'coverage', 'coverage-summary.json');
if (!existsSync(summaryFile)) {
  console.log('no coverage summary, nothing to ratchet');
  process.exit(0);
}
const total = JSON.parse(readFileSync(summaryFile, 'utf8')).total;
const floor = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).jest?.coverageThreshold?.global ?? {};
const lines = [];
for (const k of ['statements', 'branches', 'functions', 'lines']) {
  const real = total[k]?.pct;
  if (typeof real !== 'number' || typeof floor[k] !== 'number') continue;
  const room = real - floor[k];
  if (room >= 3) lines.push(`- ${k}: ${real}% now, floor ${floor[k]}%: raise the floor to ${Math.floor(real - 1.5)}`);
}
const text = lines.length ? `### Coverage ratchet\n${lines.join('\n')}\n` : '';
if (text) {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}
