// 26.11: a part whose rights come only from infra/bootstrap waits in the plan
// instead of stopping every admin infra-apply with AccessDenied.
// Run: node --test scripts/infra/rights-gate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GATES, decide, roleArnOf } from './rights-gate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROLE = 'arn:aws:iam::123456789012:role/lawbid-prod-github-deploy';

test('role ARN from the assumed-role caller', () => {
  assert.equal(
    roleArnOf('arn:aws:sts::123456789012:assumed-role/lawbid-prod-github-deploy/GitHubActions'),
    ROLE,
  );
  assert.equal(roleArnOf('arn:aws:iam::123456789012:user/x'), null);
  assert.equal(roleArnOf(undefined), null);
});

test('allowed: nothing is held, the plan has no extra arguments', () => {
  const r = decide({ dns_firewall_enabled: true }, ROLE, () => true);
  assert.deepEqual(r, { held: [], args: [] });
});

test('missing rights: the switch stays off for this plan only', () => {
  const r = decide({ dns_firewall_enabled: true }, ROLE, () => false);
  assert.deepEqual(r, { held: ['dns_firewall_enabled'], args: ['-var=dns_firewall_enabled=false'] });
});

test('a failing check (no simulate permission, CLI error, unknown role) holds the part', () => {
  assert.deepEqual(
    decide({ dns_firewall_enabled: true }, ROLE, () => {
      throw new Error('AccessDenied');
    }).held,
    ['dns_firewall_enabled'],
  );
  assert.deepEqual(decide({ dns_firewall_enabled: true }, null, () => true).held, ['dns_firewall_enabled']);
});

test('a switch that is off is never checked', () => {
  let called = false;
  const r = decide({ dns_firewall_enabled: false }, ROLE, () => {
    called = true;
    return false;
  });
  assert.deepEqual(r, { held: [], args: [] });
  assert.equal(called, false);
});

test('every gated switch is a prod variable and its rights are in the bootstrap policy', () => {
  const vars = readFileSync(join(root, 'infra/envs/prod/variables.tf'), 'utf8');
  const boot = readFileSync(join(root, 'infra/bootstrap/infra-apply.tf'), 'utf8');
  for (const [name, actions] of Object.entries(GATES)) {
    assert.match(vars, new RegExp(`variable "${name}"`));
    for (const a of actions) {
      const [svc, act] = a.split(':');
      // The policy grants by wildcard (route53resolver:*Firewall*): match it.
      const grants = [...boot.matchAll(new RegExp(`"${svc}:([^"]+)"`, 'g'))].map((m) => m[1]);
      const ok = grants.some((g) => new RegExp(`^${g.replace(/\*/g, '.*')}$`).test(act));
      assert.ok(ok, `${a} is granted in infra/bootstrap/infra-apply.tf`);
    }
  }
  assert.match(boot, /"iam:SimulatePrincipalPolicy"/);
});

test('the infra-apply plan passes the gate arguments', () => {
  const wf = readFileSync(join(root, '.github/workflows/infra-apply.yml'), 'utf8');
  assert.match(wf, /node scripts\/infra\/rights-gate\.mjs infra\/envs\/prod\/growth\.auto\.tfvars\.json/);
  assert.match(wf, /terraform plan -input=false -no-color \$\{GATE_ARGS\} -out=plan\.bin/);
});
