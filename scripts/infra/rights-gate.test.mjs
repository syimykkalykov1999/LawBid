// 26.11: a part whose rights come only from infra/bootstrap waits in the plan
// instead of stopping every admin infra-apply with AccessDenied.
// Run: node --test scripts/infra/rights-gate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFAULT_ON_GATES, GATES, decide, roleArnOf } from './rights-gate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROLE = 'arn:aws:iam::123456789012:role/lawbid-prod-github-deploy';
// The C5 default-on gate is tested on its own below; here it is switched off.
const BOUNDARY_OFF = { iam_permissions_boundary_enabled: false };

test('role ARN from the assumed-role caller', () => {
  assert.equal(
    roleArnOf('arn:aws:sts::123456789012:assumed-role/lawbid-prod-github-deploy/GitHubActions'),
    ROLE,
  );
  assert.equal(roleArnOf('arn:aws:iam::123456789012:user/x'), null);
  assert.equal(roleArnOf(undefined), null);
});

test('allowed: nothing is held, the plan has no extra arguments', () => {
  const r = decide({ dns_firewall_enabled: true, ...BOUNDARY_OFF }, ROLE, () => true);
  assert.deepEqual(r, { held: [], args: [] });
});

test('missing rights: the switch stays off for this plan only', () => {
  const r = decide({ dns_firewall_enabled: true, ...BOUNDARY_OFF }, ROLE, () => false);
  assert.deepEqual(r, { held: ['dns_firewall_enabled'], args: ['-var=dns_firewall_enabled=false'] });
});

test('a failing check (no simulate permission, CLI error, unknown role) holds the part', () => {
  assert.deepEqual(
    decide({ dns_firewall_enabled: true, ...BOUNDARY_OFF }, ROLE, () => {
      throw new Error('AccessDenied');
    }).held,
    ['dns_firewall_enabled'],
  );
  assert.deepEqual(decide({ dns_firewall_enabled: true, ...BOUNDARY_OFF }, null, () => true).held, ['dns_firewall_enabled']);
});

test('a switch that is off is never checked', () => {
  let called = false;
  const r = decide({ dns_firewall_enabled: false, ...BOUNDARY_OFF }, ROLE, () => {
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

// C5 (26.11): the permissions boundary is ON by default in variables.tf (not in
// growth.auto.tfvars.json) and needs the bootstrap ci-guard policies.
const INFRA_ROLE = 'arn:aws:iam::123456789012:role/lawbid-prod-github-infra-apply';

test('boundary gate: held until the role may set exactly the ci-boundary', () => {
  const seen = [];
  const r = decide({}, INFRA_ROLE, (role, actions, extra) => {
    seen.push({ role, actions, extra });
    return false;
  });
  assert.deepEqual(r, {
    held: ['iam_permissions_boundary_enabled'],
    args: ['-var=iam_permissions_boundary_enabled=false'],
  });
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].actions, ['iam:PutRolePermissionsBoundary', 'iam:CreateRole', 'iam:PutRolePolicy']);
  assert.equal(seen[0].extra.resource, 'arn:aws:iam::123456789012:role/lawbid-prod-rights-gate-check');
  assert.deepEqual(seen[0].extra.context, {
    'iam:PermissionsBoundary': 'arn:aws:iam::123456789012:policy/lawbid-prod-ci-boundary',
  });
});

test('boundary gate: allowed after the bootstrap apply, off only when the file says false', () => {
  assert.deepEqual(decide({}, INFRA_ROLE, () => true), { held: [], args: [] });
  let called = false;
  const r = decide({ iam_permissions_boundary_enabled: false }, INFRA_ROLE, () => {
    called = true;
    return false;
  });
  assert.deepEqual(r, { held: [], args: [] });
  assert.equal(called, false);
  // unknown role, a role outside lawbid-<env>-*, a failing CLI: held.
  assert.deepEqual(decide({}, null, () => true).held, ['iam_permissions_boundary_enabled']);
  assert.equal(DEFAULT_ON_GATES.iam_permissions_boundary_enabled('arn:aws:iam::1:role/other'), null);
  assert.deepEqual(
    decide({}, INFRA_ROLE, () => {
      throw new Error('AccessDenied');
    }).held,
    ['iam_permissions_boundary_enabled'],
  );
});

test('boundary gate: prod default on, wired to the stack, rights in infra/bootstrap/ci-guard.tf', () => {
  const vars = readFileSync(join(root, 'infra/envs/prod/variables.tf'), 'utf8');
  const prodMain = readFileSync(join(root, 'infra/envs/prod/main.tf'), 'utf8');
  const guard = readFileSync(join(root, 'infra/bootstrap/ci-guard.tf'), 'utf8');
  assert.match(vars, /variable "iam_permissions_boundary_enabled" \{\n\s*type\s*=\s*bool\n\s*default\s*=\s*true/);
  assert.match(prodMain, /iam_permissions_boundary_enabled\s*=\s*var\.iam_permissions_boundary_enabled/);
  assert.match(guard, /"iam:CreateRole", "iam:PutRolePolicy", "iam:AttachRolePolicy", "iam:PutRolePermissionsBoundary"/);
  assert.match(guard, /local\.ci_boundary_name = "\$\{local\.name\}-ci-boundary"|ci_boundary_name\s*=\s*"\$\{local\.name\}-ci-boundary"/);
});
