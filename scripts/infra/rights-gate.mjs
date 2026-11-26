#!/usr/bin/env node
// 26.11 (owner: «включи DNS-фильтр сейчас»): some prod parts need AWS rights
// that only infra/bootstrap gives the deploy role, and the owner applies the
// bootstrap by hand (KNOWN_ERRORS 75/105: without the rights EVERY admin
// infra-apply stopped with AccessDenied, «Авто» included). Such a part can be
// «Вкл» in growth.auto.tfvars.json from the start: before the plan this script
// asks IAM (iam:SimulatePrincipalPolicy, the documented way to test a role's
// rights without calling the service) whether the current role may create it.
// When not, the plan gets `-var=<switch>=false` for that run only and the
// summary says why; the first run after the bootstrap apply creates the part.
//
//   node scripts/infra/rights-gate.mjs <growth.auto.tfvars.json>
//
// Prints `args=<extra terraform plan arguments>` and `held=<names>` for
// $GITHUB_OUTPUT. Any failure of the check itself (no permission to simulate,
// AWS CLI error) counts as "not allowed": the part waits, nothing else breaks.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Switch → the actions the role needs to create the part (all must be allowed). */
export const GATES = {
  dns_firewall_enabled: [
    'route53resolver:CreateFirewallRuleGroup',
    'route53resolver:AssociateFirewallRuleGroup',
    'route53resolver:CreateResolverQueryLogConfig',
  ],
};

/**
 * C5 (26.11): switches that are ON by default in infra/envs/prod/variables.tf
 * (not written to growth.auto.tfvars.json) and still need bootstrap rights.
 * Held unless the file sets them to false. `check(roleArn)` gives the actions,
 * the resource and the IAM condition context to simulate with: the role writes
 * are allowed only WITH the ci-boundary (iam:PermissionsBoundary).
 */
export const DEFAULT_ON_GATES = {
  iam_permissions_boundary_enabled: (roleArn) => {
    const m = /^arn:(aws[\w-]*):iam::(\d{12}):role\/(lawbid-[a-z0-9]+)-/.exec(String(roleArn ?? ''));
    if (!m) return null;
    return {
      actions: ['iam:PutRolePermissionsBoundary', 'iam:CreateRole', 'iam:PutRolePolicy'],
      resource: `arn:${m[1]}:iam::${m[2]}:role/${m[3]}-rights-gate-check`,
      context: { 'iam:PermissionsBoundary': `arn:${m[1]}:iam::${m[2]}:policy/${m[3]}-ci-boundary` },
    };
  },
};

/** arn:aws:sts::1:assumed-role/NAME/session → arn:aws:iam::1:role/NAME. */
export function roleArnOf(callerArn) {
  const m = /^arn:(aws[\w-]*):sts::(\d{12}):assumed-role\/([\w+=,.@-]+)\/[^/]+$/.exec(
    String(callerArn ?? ''),
  );
  return m ? `arn:${m[1]}:iam::${m[2]}:role/${m[3]}` : null;
}

/**
 * Decides which switches to hold. [simulate](roleArn, actions) returns true
 * only when every action is allowed; it may throw (= not allowed).
 */
export function decide(file, roleArn, simulate) {
  const held = [];
  for (const [name, actions] of Object.entries(GATES)) {
    if (file?.[name] !== true) continue;
    let ok = false;
    try {
      ok = roleArn ? simulate(roleArn, actions) === true : false;
    } catch {
      ok = false;
    }
    if (!ok) held.push(name);
  }
  for (const [name, check] of Object.entries(DEFAULT_ON_GATES)) {
    if (file?.[name] === false) continue;
    let ok = false;
    try {
      const c = roleArn ? check(roleArn) : null;
      ok = c ? simulate(roleArn, c.actions, c) === true : false;
    } catch {
      ok = false;
    }
    if (!ok) held.push(name);
  }
  return { held, args: held.map((n) => `-var=${n}=false`) };
}

function awsSimulate(roleArn, actions, extra) {
  const more = [];
  if (extra?.resource) more.push('--resource-arns', extra.resource);
  for (const [k, v] of Object.entries(extra?.context ?? {})) {
    more.push('--context-entries', `ContextKeyName=${k},ContextKeyValues=${v},ContextKeyType=string`);
  }
  const out = execFileSync(
    'aws',
    [
      'iam', 'simulate-principal-policy',
      '--policy-source-arn', roleArn,
      '--action-names', ...actions,
      ...more,
      '--query', 'EvaluationResults[].EvalDecision',
      '--output', 'json',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 },
  );
  const decisions = JSON.parse(out);
  return (
    Array.isArray(decisions) &&
    decisions.length === actions.length &&
    decisions.every((d) => d === 'allowed')
  );
}

function callerArn() {
  return execFileSync(
    'aws',
    ['sts', 'get-caller-identity', '--query', 'Arn', '--output', 'text'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 },
  ).trim();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  let role = null;
  try {
    role = roleArnOf(callerArn());
  } catch {
    role = null;
  }
  const { held, args } = decide(file, role, awsSimulate);
  for (const n of held) {
    process.stderr.write(
      `rights-gate: ${n} stays off in this plan: the deploy role lacks the rights (owner: terraform apply in infra/bootstrap)\n`,
    );
  }
  process.stdout.write(`args=${args.join(' ')}\nheld=${held.join(',')}\n`);
}
