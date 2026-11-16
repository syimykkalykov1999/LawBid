#!/usr/bin/env node
// KNOWN_ERRORS 182 (16.11): switching our PgBouncer off must first move the
// apps to the direct database, and only then remove the pooler (drain before
// removing a dependency). This reads `terraform show -json plan.bin` and says
// what infra-apply.yml has to do around the apply:
//
//   node scripts/infra/pooler-switch.mjs plan.json > pooler.json
//   {"off":true,"on":false,"env":{"api":{"DB_POOL_SIZE":"5"},"worker":{...}}}
//
//   off  the plan deletes the pooler ECS service: BEFORE the apply the api /
//        api-admin / worker services are rolled to their running task
//        definition with exactly the planned DB_POOL* variables (no
//        DB_POOLER_HOST), while PgBouncer still serves (scripts/infra/pooler-roll.sh drain);
//   on   the plan creates it: AFTER the apply (Terraform waits for healthy
//        pooler tasks) the services are rolled onto the new task definitions
//        (pooler-roll.sh align, which also runs after every apply);
//   env  the DB_POOL* variables of the api / worker container in the PLANNED
//        task definitions; null when unknown before the apply (then the drain
//        refuses and nothing changes).
// Values here are connection settings (host name, port, pool size), never
// secrets: secrets are `valueFrom` references in the task definition.
import { readFileSync } from 'node:fs';

const POOLER_SERVICE = /(^|\.)module\.pgbouncer\[0\]\.aws_ecs_service\.this$/;
const APP_TD = /(^|\.)module\.ecs\.aws_ecs_task_definition\.(api|worker)$/;
export const POOL_VAR = /^DB_POOL/;

/** DB_POOL* variables of container `name` in a container_definitions JSON string. */
export function poolEnv(containerDefinitions, name) {
  if (typeof containerDefinitions !== 'string') return null;
  const c = JSON.parse(containerDefinitions).find((d) => d.name === name);
  if (!c) return null;
  const out = {};
  for (const e of c.environment ?? []) if (POOL_VAR.test(e.name)) out[e.name] = String(e.value);
  return out;
}

export function poolerSwitch(plan) {
  const res = { off: false, on: false, env: { api: null, worker: null } };
  for (const rc of plan.resource_changes ?? []) {
    const actions = rc.change?.actions ?? [];
    if (POOLER_SERVICE.test(rc.address)) {
      if (actions.includes('delete') && !actions.includes('create')) res.off = true;
      if (actions.includes('create') && !actions.includes('delete')) res.on = true;
    }
    const m = APP_TD.exec(rc.address);
    if (m && rc.change?.after && rc.change.after_unknown?.container_definitions !== true) {
      res.env[m[2]] = poolEnv(rc.change.after.container_definitions, m[2]);
    }
  }
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  process.stdout.write(`${JSON.stringify(poolerSwitch(plan))}\n`);
}
