// C5 (THIRD_PASS_B 26.11): infra/bootstrap/ci-guard.tf lets the pipeline
// create or extend a role ONLY when the role carries the ci-boundary. A role in
// infra/modules without `permissions_boundary` would stop the admin «Infra
// apply» with AccessDenied once the bootstrap is applied, so every role must
// set it (break-glass excepted: an owner-applied administrator by design).
// Run: node --test scripts/infra/permissions-boundary.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const modules = join(root, 'infra/modules');
const EXEMPT = new Set(['break-glass']);

function roleBlocks(file) {
  const s = readFileSync(file, 'utf8');
  const out = [];
  const re = /^resource "aws_iam_role" "([^"]+)" \{\n([\s\S]*?)^\}/gm;
  for (let m; (m = re.exec(s)); ) out.push({ name: m[1], body: m[2] });
  return out;
}

test('every role in infra/modules carries the permissions boundary', () => {
  const missing = [];
  let count = 0;
  for (const mod of readdirSync(modules)) {
    const dir = join(modules, mod);
    if (!statSync(dir).isDirectory() || EXEMPT.has(mod)) continue;
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.tf'))) {
      for (const r of roleBlocks(join(dir, f))) {
        count++;
        const want = mod === 'stack' ? 'local.permissions_boundary_arn' : 'var.permissions_boundary_arn';
        if (!new RegExp(`^\\s*permissions_boundary\\s*=\\s*${want.replace('.', '\\.')}\\s*$`, 'm').test(r.body)) {
          missing.push(`${mod}/${f}: aws_iam_role.${r.name}`);
        }
      }
    }
  }
  assert.ok(count >= 30, `found ${count} roles`);
  assert.deepEqual(missing, [], 'add permissions_boundary to these roles');
});

test('the stack passes the boundary to every module that has roles', () => {
  const stackDir = join(modules, 'stack');
  const calls = readdirSync(stackDir)
    .filter((n) => n.endsWith('.tf'))
    .map((n) => readFileSync(join(stackDir, n), 'utf8'))
    .join('\n');
  const missing = [];
  for (const m of calls.matchAll(/^module "([^"]+)" \{\n([\s\S]*?)^\}/gm)) {
    const src = /^\s*source\s*=\s*"\.\.\/([^"]+)"/m.exec(m[2])?.[1];
    if (!src || EXEMPT.has(src)) continue;
    const hasVar = (() => {
      try {
        return readFileSync(join(modules, src, 'boundary.tf'), 'utf8').includes('variable "permissions_boundary_arn"');
      } catch {
        return false;
      }
    })();
    if (hasVar && !/^\s*permissions_boundary_arn\s*=\s*local\.permissions_boundary_arn\s*$/m.test(m[2])) {
      missing.push(`module.${m[1]} (${src})`);
    }
  }
  assert.deepEqual(missing, []);
});

test('the boundary ARN is the one infra/bootstrap creates', () => {
  const stack = readFileSync(join(modules, 'stack/main.tf'), 'utf8');
  const guard = readFileSync(join(root, 'infra/bootstrap/ci-guard.tf'), 'utf8');
  assert.match(stack, /:policy\/\$\{local\.name\}-ci-boundary"/);
  assert.match(guard, /ci_boundary_name\s*=\s*"\$\{local\.name\}-ci-boundary"/);
});
