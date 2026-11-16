#!/usr/bin/env node
// Owner 15.11 (aws.autoscale_code): the source hash of the four autoscale
// Lambdas, the SAME formula as infra/modules/stack (local.autoscale_code_hash):
//   sha256(join("\n", ["<dir>/<file>:<sha256(file)>" for every file under
//   infra/modules/<dir>/lambda, sorted, no __pycache__]))
// deploy.yml writes it to /<name>/deploy/autoscale_code_main; Terraform writes
// the shipped one to /<name>/deploy/autoscale_code_applied.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIRS = ['redis-autoscale', 'db-autoscale', 'endpoints-autoscale', 'spot-fallback'];

function files(root) {
  const out = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(root, p).split(sep).join('/'));
    }
  };
  walk(root);
  // Terraform's sort() and fileset are byte order; JS code-unit order is the
  // same for these ASCII names.
  return out.filter((f) => !f.includes('__pycache__')).sort();
}

export function autoscaleCodeHash(modulesDir) {
  const lines = [];
  for (const d of DIRS) {
    const root = join(modulesDir, d, 'lambda');
    for (const f of files(root)) {
      const h = createHash('sha256').update(readFileSync(join(root, f))).digest('hex');
      lines.push(`${d}/${f}:${h}`);
    }
  }
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = fileURLToPath(new URL('../../infra/modules', import.meta.url));
  process.stdout.write(`${autoscaleCodeHash(process.argv[2] ?? here)}\n`);
}
