#!/usr/bin/env node
// Owner 2026-10-26: infra switches from the admin. Turns `terraform show
// -json plan.bin` into the short summary the admin shows («План: +2 ~1 −0»)
// — resource ADDRESSES and actions only, never attribute values.
//
//   node scripts/infra/plan-summary.mjs plan.json > summary.json
//
// Exit 3 when the plan destroys or replaces data that cannot come back
// (FORBIDDEN_DESTROY, the same list as apps/api/src/common/ops/
// infra-switches.ts; the API checks it again). The summary is still printed.
import { readFileSync } from 'node:fs';

export const FORBIDDEN_DESTROY = [
  'aws_db_instance',
  'aws_rds_cluster',
  'aws_rds_cluster_instance',
  'aws_kms_key',
  'aws_s3_bucket',
  'aws_backup_vault',
  'aws_secretsmanager_secret',
  'aws_secretsmanager_secret_version',
  'aws_dynamodb_table',
  'aws_elasticache_replication_group',
  'aws_elasticache_cluster',
  'aws_ecr_repository',
];
const DESTROY_ALLOWED = [/aws_db_instance\.replica(\[|$)/];

export function summarize(plan) {
  const resources = [];
  let add = 0;
  let change = 0;
  let destroy = 0;
  for (const rc of plan.resource_changes ?? []) {
    const actions = rc.change?.actions ?? [];
    if (actions.length === 0 || (actions.length === 1 && (actions[0] === 'no-op' || actions[0] === 'read'))) {
      continue;
    }
    if (actions.includes('create')) add += 1;
    if (actions.includes('delete')) destroy += 1;
    if (actions.includes('update')) change += 1;
    resources.push({ address: String(rc.address).slice(0, 300), action: actions.join('-') });
  }
  return { add, change, destroy, resources };
}

export function forbidden(summary) {
  return summary.resources
    .filter((r) => r.action.includes('delete'))
    .filter(
      (r) =>
        r.address.split('.').some((p) => FORBIDDEN_DESTROY.includes(p.replace(/\[.*$/, ''))) &&
        !DESTROY_ALLOWED.some((re) => re.test(r.address)),
    )
    .map((r) => r.address);
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const path = process.argv[2];
  if (!path) {
    process.stderr.write('usage: plan-summary.mjs plan.json\n');
    process.exit(1);
  }
  const s = summarize(JSON.parse(readFileSync(path, 'utf8')));
  process.stdout.write(`${JSON.stringify(s)}\n`);
  const bad = forbidden(s);
  if (bad.length) {
    process.stderr.write(`plan-summary: the plan destroys protected data: ${bad.join(', ')}\n`);
    process.exit(3);
  }
}
