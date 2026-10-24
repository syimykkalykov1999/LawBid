// Cost estimate of one load-test run, with the arithmetic. AWS list prices,
// us-east-1, as known on 2026-10 (the Pricing API needs credentials; these
// are constants on purpose). It is an ESTIMATE, +-30 %: the workflow compares
// the UPPER bound (x1.5) with the amount the owner typed in `confirm_cost`.
//
//   node estimate-cost.mjs <profile> [--json]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const all = JSON.parse(readFileSync(join(root, 'profiles.json'), 'utf8'));
const name = process.argv[2];
const p = all.profiles[name];
if (!p || !p.stack_hours) {
  console.error(`profile ${name} cannot run on AWS (known: ${Object.keys(all.profiles).filter((k) => all.profiles[k].stack_hours).join(', ')})`);
  process.exit(2);
}

// --- list prices, USD (us-east-1) ---------------------------------------------
const PRICE = {
  alb_hour: 0.0225, lcu_hour: 0.008,
  nat_hour: 0.045, nat_gb: 0.045,
  ipv4_hour: 0.005, // every public IPv4 address
  endpoint_hour: 0.01, // interface endpoint, per AZ
  fargate_vcpu_hour: 0.04048, fargate_gb_hour: 0.004445,
  rds: { 'db.t4g.medium': 0.065, 'db.r7g.large': 0.276, 'db.r7g.2xlarge': 1.104 },
  rds_storage_gb_month: 0.115,
  redis: { 'cache.t4g.small': 0.032, 'cache.r7g.large': 0.219, 'cache.r7g.xlarge': 0.437 },
  ec2: { 't4g.nano': 0.0042, 'c7g.medium': 0.0361, 'c7g.xlarge': 0.145 }, spot_factor: 0.4,
  cloudfront_gb: 0.085, cloudfront_10k_req: 0.0075,
  waf_million_req: 0.6, waf_acl_month: 5.0, waf_rules_month: 6.0,
  same_region_gb: 0.01,
  kms_key_month: 1.0, secret_month: 0.4, logs_gb: 0.5,
};
const unit = { s: 1, m: 60, h: 3600 };
const secs = (d) => Number(d.slice(0, -1)) * unit[d.slice(-1)];
const loadSeconds = p.stages.reduce((a, [d]) => a + secs(d), 0);
// requests = area under the ramp (linear between stage targets)
let prev = 0;
let requests = 0;
for (const [d, target] of p.stages) {
  requests += ((prev + target) / 2) * secs(d);
  prev = target;
}
const hLoad = loadSeconds / 3600;
const h = p.stack_hours;
const hGen = Math.min(h, hLoad + 0.5);
const HOURS_MONTH = 730;

const rows = [];
const add = (what, usd, how) => rows.push({ what, usd, how });
add('Load balancer (ALB)', h * PRICE.alb_hour + hLoad * p.alb_lcu * PRICE.lcu_hour, `${h} h x $${PRICE.alb_hour} + ${hLoad.toFixed(2)} h x ${p.alb_lcu} LCU x $${PRICE.lcu_hour}`);
add('NAT gateway', h * PRICE.nat_hour + 5 * PRICE.nat_gb, `${h} h x $${PRICE.nat_hour} + 5 GB x $${PRICE.nat_gb}`);
add('Interface endpoints (4)', h * 4 * PRICE.endpoint_hour, `${h} h x 4 x $${PRICE.endpoint_hour}`);
const ipv4 = 2 /*ALB*/ + 1 /*NAT*/ + p.turn_nodes + (p.livekit ? 1 : 0) + p.generators;
add('Public IPv4 addresses', h * ipv4 * PRICE.ipv4_hour, `${h} h x ${ipv4} x $${PRICE.ipv4_hour}`);
const apiTask = 0.5 * PRICE.fargate_vcpu_hour + 1 * PRICE.fargate_gb_hour;
const workerTask = 0.5 * PRICE.fargate_vcpu_hour + 4 * PRICE.fargate_gb_hour;
add('API tasks (Fargate, on-demand price)', h * p.avg_api_tasks * apiTask, `${h} h x avg ${p.avg_api_tasks} tasks x $${apiTask.toFixed(4)} (0.5 vCPU, 1 GB; Spot would be ~70 % less)`);
add('Worker + admin tasks', h * (p.avg_worker_tasks * workerTask + apiTask), `${h} h x (${p.avg_worker_tasks} x $${workerTask.toFixed(4)} + 1 x $${apiTask.toFixed(4)})`);
add(`Database ${p.db}`, h * PRICE.rds[p.db] + (50 * PRICE.rds_storage_gb_month * h) / HOURS_MONTH, `${h} h x $${PRICE.rds[p.db]} + 50 GB gp3 for ${h} h`);
add(`Redis ${p.redis} x ${p.redis_nodes}`, h * PRICE.redis[p.redis] * p.redis_nodes, `${h} h x $${PRICE.redis[p.redis]} x ${p.redis_nodes} nodes`);
add(`TURN servers (t4g.nano x ${p.turn_nodes})`, h * PRICE.ec2['t4g.nano'] * p.turn_nodes, `${h} h x $${PRICE.ec2['t4g.nano']} x ${p.turn_nodes}`);
if (p.livekit) add('LiveKit server (c7g.medium)', h * PRICE.ec2['c7g.medium'], `${h} h x $${PRICE.ec2['c7g.medium']}`);
add(`Generators (c7g.xlarge Spot x ${p.generators})`, hGen * PRICE.ec2['c7g.xlarge'] * PRICE.spot_factor * p.generators, `${hGen.toFixed(2)} h x $${PRICE.ec2['c7g.xlarge']} x ${PRICE.spot_factor} (Spot) x ${p.generators}`);
const cdnReq = (p.cdn_gb * 1e6) / 24; // 24 KB average asset
add('CloudFront (static assets)', p.cdn_gb * PRICE.cloudfront_gb + (cdnReq / 1e4) * PRICE.cloudfront_10k_req, `${p.cdn_gb} GB x $${PRICE.cloudfront_gb} + ${(cdnReq / 1e6).toFixed(2)} M requests x $${PRICE.cloudfront_10k_req}/10k`);
add('WAF (requests + 2 web ACLs)', (requests / 1e6) * PRICE.waf_million_req + (2 * (PRICE.waf_acl_month + PRICE.waf_rules_month) * h) / HOURS_MONTH, `${(requests / 1e6).toFixed(2)} M requests x $${PRICE.waf_million_req}/M + 2 ACLs prorated for ${h} h`);
add('Data transfer generators <-> ALB (same region)', p.xfer_gb * PRICE.same_region_gb, `${p.xfer_gb} GB x $${PRICE.same_region_gb}`);
add('Keys, secrets, logs, S3, CloudWatch', (3 * PRICE.kms_key_month * h) / HOURS_MONTH + (25 * PRICE.secret_month * h) / HOURS_MONTH + 1 * PRICE.logs_gb + 0.1, '3 KMS keys + 25 secrets prorated + 1 GB of logs + small change');

const total = rows.reduce((a, r) => a + r.usd, 0);
const out = { profile: name, hours: h, load_minutes: Math.round(loadSeconds / 60), requests_million: +(requests / 1e6).toFixed(2), rows, estimate_usd: +total.toFixed(2), upper_bound_usd: +(total * 1.5).toFixed(2) };
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out));
} else {
  console.log(`### Estimated cost of profile \`${name}\` (AWS list prices, us-east-1; an ESTIMATE, +-30 %)\n`);
  console.log(`Stack lives about ${h} h (create ~25 min, load ${out.load_minutes} min, destroy ~15 min); about ${out.requests_million} M requests.\n`);
  console.log('| Item | USD | Arithmetic |\n|---|---:|---|');
  for (const r of rows) console.log(`| ${r.what} | ${r.usd.toFixed(2)} | ${r.how} |`);
  console.log(`| **Total** | **${total.toFixed(2)}** | upper bound (x1.5): **${(total * 1.5).toFixed(2)}** |`);
}
