// Б9 (25.11): the threat-detection set is ON by default in prod (STRICT_RULES
// №6: needed features are on by default). The unused-access analyzer and the
// cost allocation tags need IAM rights that only infra/bootstrap adds (owner
// applies it by hand), so they stay off until then (bootstrap -> true -> apply).
// Reads infra/envs/prod/variables.tf and its wiring; a default flipped back to
// false, or a switch no longer passed to the stack, makes this red.
//   node --test scripts/infra/prod-security-defaults.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const vars = readFileSync(join(root, 'infra/envs/prod/variables.tf'), 'utf8');
const prodMain = readFileSync(join(root, 'infra/envs/prod/main.tf'), 'utf8');

function block(name) {
  const start = vars.indexOf(`variable "${name}" {`);
  assert.ok(start >= 0, `variable ${name} exists in envs/prod`);
  const end = vars.indexOf('\n}', start);
  return vars.slice(start, end);
}

function defaultOf(name) {
  const m = block(name).match(/^\s*default\s*=\s*(.+)$/m);
  assert.ok(m, `variable ${name} has a default`);
  return m[1].trim();
}

const SWITCHES = [
  'security_hub_enabled',
  'securityhub_fsbp_enabled',
  'inspector_enabled',
  'guardduty_runtime_monitoring',
];

// Switches whose IAM rights exist only in infra/bootstrap (applied by the owner
// by hand). They stay off until then, or the admin «Infra apply» workflow stops
// with AccessDenied (KNOWN_ERRORS 75/105). Owner order: bootstrap -> true -> apply.
const NEEDS_BOOTSTRAP = ['unused_access_analyzer_enabled'];

for (const name of SWITCHES) {
  test(`prod: ${name} is on by default and reaches the stack`, () => {
    assert.equal(defaultOf(name), 'true');
    assert.match(prodMain, new RegExp(`^\\s*${name}\\s*=\\s*var\\.${name}\\s*$`, 'm'));
  });
}

for (const name of NEEDS_BOOTSTRAP) {
  test(`prod: ${name} waits for the bootstrap rights (off) and still reaches the stack`, () => {
    assert.equal(defaultOf(name), 'false');
    assert.match(prodMain, new RegExp(`^\\s*${name}\\s*=\\s*var\\.${name}\\s*$`, 'm'));
  });
}

test('prod: cost allocation tags are wired, empty until the bootstrap rights exist', () => {
  assert.equal(defaultOf('cost_allocation_tags'), '[]');
  assert.match(prodMain, /^\s*cost_allocation_tags\s*=\s*var\.cost_allocation_tags\s*$/m);
});

test('bootstrap grants what the two switches need once the owner applies it', () => {
  const boot = readFileSync(join(root, 'infra/bootstrap/infra-apply.tf'), 'utf8');
  for (const a of ['access-analyzer:CreateAnalyzer', 'ce:UpdateCostAllocationTagsStatus']) {
    assert.ok(boot.includes(`"${a}"`), `${a} in infra-apply.tf`);
  }
});
