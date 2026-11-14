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
//
// D1-34 (13.11): with SERVING_OUT=<file> it also writes the addresses the
// plan deletes or replaces of live-serving infrastructure (NEVER_AUTO_DESTROY,
// the same list as apps/api/src/modules/admin-launch/infra/infra-auto.logic.ts),
// one per line. The workflow refuses to apply such a plan when nobody tapped
// (an automatic «Авто» confirm); the owner's 2FA still can.
import { readFileSync, writeFileSync } from 'node:fs';

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

export const NEVER_AUTO_DESTROY = [
  'aws_lb',
  'aws_lb_listener',
  'aws_lb_listener_rule',
  'aws_lb_target_group',
  'aws_ecs_service',
  'aws_ecs_cluster',
  'aws_cloudfront_distribution',
  'aws_route53_record',
  'aws_route53_zone',
  'aws_nat_gateway',
  'aws_vpc',
  'aws_subnet',
  'aws_internet_gateway',
  'aws_route_table',
  'aws_route',
  'aws_service_discovery_service',
  'aws_service_discovery_private_dns_namespace',
];

/** Terraform type of a plan address (`module.a[0].aws_lb.this` -> `aws_lb`). */
export function resourceType(address) {
  const parts = String(address).replace(/\[[^\]]*\]/g, '').split('.');
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

/** Addresses whose delete or replacement would take serving parts away. */
export function servingDestroys(summary) {
  return summary.resources
    .filter((r) => r.action.includes('delete') && NEVER_AUTO_DESTROY.includes(resourceType(r.address)))
    .map((r) => r.address);
}

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

// Owner 2026-11-12: a request that lowers db_shards to K may remove the
// extra servers K and above (postgres_shard[N] / growth_shard[N], N >= K;
// a plain delete, never a replacement). The API allows such a request only
// while those servers hold no data; AWS keeps a final snapshot.
const SHARD_MODULE = /(^|\.)module\.(postgres_shard|growth_shard)\[(\d+)\]\./;

export function forbidden(summary, changes = {}) {
  const keep = changes?.db_shards;
  return summary.resources
    .filter((r) => r.action.includes('delete'))
    .filter((r) => {
      const m = SHARD_MODULE.exec(r.address);
      const removed = typeof keep === 'number' && m && Number(m[3]) >= keep && r.action === 'delete';
      return (
        r.address.split('.').some((p) => FORBIDDEN_DESTROY.includes(p.replace(/\[.*$/, ''))) &&
        !removed &&
        !DESTROY_ALLOWED.some((re) => re.test(r.address))
      );
    })
    .map((r) => r.address);
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const path = process.argv[2];
  if (!path) {
    process.stderr.write('usage: plan-summary.mjs plan.json [changes.json]\n');
    process.exit(1);
  }
  const s = summarize(JSON.parse(readFileSync(path, 'utf8')));
  process.stdout.write(`${JSON.stringify(s)}\n`);
  if (process.env.SERVING_OUT) {
    const serving = servingDestroys(s);
    writeFileSync(process.env.SERVING_OUT, serving.length ? `${serving.join('\n')}\n` : '');
  }
  const bad = forbidden(s, process.argv[3] ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : {});
  if (bad.length) {
    process.stderr.write(`plan-summary: the plan destroys protected data: ${bad.join(', ')}\n`);
    process.exit(3);
  }
}
