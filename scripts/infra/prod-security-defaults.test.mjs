// Б9 (25.11): the threat-detection set and the cost allocation tags are ON
// by default in prod (STRICT_RULES №6: needed features are on by default).
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
  'unused_access_analyzer_enabled',
  'guardduty_runtime_monitoring',
];

for (const name of SWITCHES) {
  test(`prod: ${name} is on by default and reaches the stack`, () => {
    assert.equal(defaultOf(name), 'true');
    assert.match(prodMain, new RegExp(`^\\s*${name}\\s*=\\s*var\\.${name}\\s*$`, 'm'));
  });
}

test('prod: cost allocation tags are activated by code', () => {
  const d = defaultOf('cost_allocation_tags');
  for (const key of ['Project', 'Env', 'Component', 'ManagedBy']) {
    assert.ok(d.includes(`"${key}"`), `${key} in the default list`);
  }
  assert.match(prodMain, /^\s*cost_allocation_tags\s*=\s*var\.cost_allocation_tags\s*$/m);
});
