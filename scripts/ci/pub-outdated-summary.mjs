#!/usr/bin/env node
// Prints a Markdown table of outdated / discontinued direct dependencies from
// `dart pub outdated --json` (mobile-ci.yml, job dependency-audit). Information
// only; the vulnerability gate is pub-audit-gate.mjs.
import { readFileSync } from 'node:fs';

const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const rows = (report.packages ?? []).filter(
  (p) => p.isDiscontinued || (p.latest && p.current && p.latest.version !== p.current.version),
);
let out = '### dart pub outdated\n\n';
if (!rows.length) {
  out += 'All direct dependencies are current.\n';
} else {
  out += '| package | current | latest | discontinued |\n|---|---|---|---|\n';
  for (const p of rows) {
    out += `| ${p.package} | ${p.current?.version ?? ''} | ${p.latest?.version ?? ''} | ${p.isDiscontinued ? 'yes' : ''} |\n`;
  }
}
process.stdout.write(out);
