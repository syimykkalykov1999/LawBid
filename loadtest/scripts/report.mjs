// Builds the Markdown report of a run from what the generators and the
// collectors left in one folder:
//   <dir>/**/summary.json   k6 summaries (one per generator)
//   <dir>/**/result.json    {profile, shard, k6_exit, aborted}
//   <dir>/**/abort.json     why the guard stopped the load
//   <dir>/cw.json           CloudWatch / Performance Insights (collect-cw.py)
//   <dir>/**/turn.json, livekit.json   calls tests
//   <dir>/cost.json         estimate (estimate-cost.mjs --json)
//   node report.mjs --profile P --dir D [--note "text"]
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const dir = arg('dir');
const profile = arg('profile', '?');
if (!dir) { console.error('usage: report.mjs --profile P --dir D'); process.exit(2); }

const walk = (d, out = []) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const files = walk(dir);
const read = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const byName = (n) => files.filter((f) => f.endsWith('/' + n)).map((f) => ({ f, j: read(f) })).filter((x) => x.j);

const sums = byName('summary.json').map((x) => x.j.metrics || {});
const results = byName('result.json').map((x) => x.j);
const aborts = byName('abort.json').map((x) => x.j);
const turns = byName('turn.json').map((x) => x.j);
const lks = byName('livekit.json').map((x) => x.j);
const cw = existsSync(join(dir, 'cw.json')) ? read(join(dir, 'cw.json')) : null;
const cost = existsSync(join(dir, 'cost.json')) ? read(join(dir, 'cost.json')) : null;

const v = (m, k) => (m && m[k] !== undefined ? m[k] : m?.values?.[k]);
const sum = (name, field) => sums.reduce((a, m) => a + (v(m[name], field) || 0), 0);
const max = (name, field) => Math.max(0, ...sums.map((m) => v(m[name], field) || 0));
const num = (x, d = 0) => (x === undefined || x === null || Number.isNaN(x) ? '-' : Number(x).toFixed(d));
const pct = (x) => (x === undefined || x === null ? '-' : `${(x * 100).toFixed(2)} %`);

const out = [];
const P = (s = '') => out.push(s);

const aborted = aborts.length > 0 || results.some((r) => r.aborted);
const missed = results.some((r) => r.k6_exit === 99);
const verdict = aborted ? 'ABORTED (the abort rule fired; the load was stopped)' : missed ? 'FINISHED, SOME TARGETS MISSED' : sums.length ? 'FINISHED, ALL TARGETS MET' : 'NO LOAD RESULTS';
P(`# Load test report: profile \`${profile}\``);
P();
P(`**Verdict: ${verdict}**`);
for (const a of aborts) P(`- Abort reason: \`${a.reason}\` ${JSON.stringify(a.detail)} at ${a.at}`);
if (arg('note')) P(`- ${arg('note')}`);
P();

if (sums.length) {
  const reqs = sum('http_reqs', 'count');
  const fails = sums.reduce((a, m) => a + (v(m.http_req_failed, 'passes') || 0), 0);
  const total = fails + sums.reduce((a, m) => a + (v(m.http_req_failed, 'fails') || 0), 0);
  P('## Load generated');
  P();
  P(`| Generators | Requests | Average req/s (sum of generators) | Error rate | p95 (worst generator) | p99 (worst generator) | Dropped iterations (generator too slow) |`);
  P(`|---:|---:|---:|---:|---:|---:|---:|`);
  P(`| ${sums.length} | ${num(reqs)} | ${num(sum('http_reqs', 'rate'), 1)} | ${pct(total ? fails / total : 0)} | ${num(max('http_req_duration', 'p(95)'))} ms | ${num(max('http_req_duration', 'p(99)'))} ms | ${num(sum('dropped_iterations', 'count'))} |`);
  P();
  P('Peak req/s is in the ALB table below (CloudWatch, per minute / 60). p95 is the worst of the generators, not a merge of all samples (k6 cannot merge percentiles).');
  P();

  // endpoints
  const names = new Set();
  for (const m of sums) for (const k of Object.keys(m)) { const g = /^http_reqs\{name:(.+)\}$/.exec(k); if (g) names.add(g[1]); }
  const rows = [];
  for (const n of names) {
    const c = sum(`http_reqs{name:${n}}`, 'count');
    if (!c) continue;
    const f = sums.reduce((a, m) => a + (v(m[`http_req_failed{name:${n}}`], 'passes') || 0), 0);
    rows.push({ n, c, f, avg: sums.reduce((a, m) => a + (v(m[`http_req_duration{name:${n}}`], 'avg') || 0), 0) / sums.length, p95: max(`http_req_duration{name:${n}}`, 'p(95)'), p99: max(`http_req_duration{name:${n}}`, 'p(99)'), mx: max(`http_req_duration{name:${n}}`, 'max') });
  }
  rows.sort((a, b) => b.p95 - a.p95);
  P('## Per endpoint (slowest p95 first)');
  P();
  P('| Endpoint | Requests | Failed | avg ms | p95 ms | p99 ms | max ms |');
  P('|---|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) P(`| ${r.n} | ${num(r.c)} | ${pct(r.c ? r.f / r.c : 0)} | ${num(r.avg)} | ${num(r.p95)} | ${num(r.p99)} | ${num(r.mx)} |`);
  P();

  // realtime + calls
  const ws = (n, f) => max(n, f);
  P('## Realtime (Socket.IO) and call signalling');
  P();
  P('| Measure | Value |');
  P('|---|---:|');
  P(`| Socket connections that succeeded | ${pct(sums.length ? sums.reduce((a, m) => a + (v(m.ws_connected, 'value') ?? 0), 0) / sums.length : undefined)} |`);
  P(`| Socket connect time p95 | ${num(ws('ws_connect_ms', 'p(95)'))} ms |`);
  P(`| Sockets dropped by the server while held | ${num(sum('ws_unexpected_close', 'count'))} |`);
  P(`| Events received | ${num(sum('ws_events', 'count'))} |`);
  P(`| Room joins acknowledged | ${pct(sums.length ? sums.reduce((a, m) => a + (v(m.room_join_ok, 'value') ?? 0), 0) / sums.length : undefined)} |`);
  P(`| Chat message delivery (REST send -> other socket) p95 | ${num(ws('chat_delivery_ms', 'p(95)'))} ms |`);
  P(`| Chat messages delivered | ${pct(sums.length ? sums.reduce((a, m) => a + (v(m.chat_delivered, 'value') ?? 0), 0) / sums.length : undefined)} |`);
  P(`| Call flows completed (start, ring, accept, signal, end) | ${pct(sums.length ? sums.reduce((a, m) => a + (v(m.call_flow_ok, 'value') ?? 0), 0) / sums.length : undefined)} |`);
  P(`| Call ring time (start to incoming) p95 | ${num(ws('call_ring_ms', 'p(95)'))} ms |`);
  P(`| Call accept time p95 | ${num(ws('call_accept_ms', 'p(95)'))} ms |`);
  P(`| call:signal one-way p95 | ${num(ws('call_signal_ms', 'p(95)'))} ms |`);
  P(`| Calls answered "busy" (normal collisions) | ${num(sum('call_busy', 'count'))} |`);
  P();

  // thresholds
  const th = [];
  for (const [i, m] of sums.entries()) for (const [k, x] of Object.entries(m)) for (const [rule, failed] of Object.entries(x.thresholds || {})) {
    if (/^(max>=0|rate>=0|count>=0)$/.test(rule)) continue;
    th.push({ gen: i, k, rule, failed });
  }
  const bad = th.filter((t) => t.failed);
  P('## Targets (k6 thresholds)');
  P();
  if (!th.length) P('No threshold data.');
  else if (!bad.length) P(`All ${th.length} threshold checks passed.`);
  else {
    P(`${bad.length} of ${th.length} threshold checks FAILED:`);
    P();
    for (const t of bad) P(`- generator ${t.gen}: \`${t.k}\` ${t.rule}`);
  }
  P();
}

if (turns.length || lks.length) {
  P('## Calls: TURN relay and LiveKit');
  P();
  for (const t of turns) {
    P(`TURN (generator ${t.shard}): ${t.clients_requested} clients, allocation success ${pct(t.allocation_success_rate)}, lost packets ${t.lost_packets_pct ?? '-'} %, avg round trip ${t.avg_rtt_ms ?? '-'} ms, avg jitter ${t.avg_jitter_ms ?? '-'} ms, allocation errors in log ${t.allocation_errors_in_log}, tool exit ${t.uclient_exit}.`);
    P();
  }
  for (const l of lks) {
    P(`LiveKit (generator): ${l.rooms} rooms x ${l.publishers_per_room} publishers, rooms failed ${l.rooms_failed}, error lines ${l.errors_in_log}, loss values ${JSON.stringify(l.loss_values_pct)}.`);
    P();
    P('```');
    for (const line of (l.tail || []).slice(-15)) P(line);
    P('```');
    P();
  }
}

if (cw) {
  const line = (label, s) => (s ? `| ${label} | ${num(s.min, 2)} | ${num(s.avg, 2)} | ${num(s.max, 2)} | ${String(s.peak_at || '').slice(11, 16)} |` : null);
  P('## Servers (CloudWatch, 1-minute points of the load window)');
  P();
  P('| Metric | min | avg | max | peak at (UTC) |');
  P('|---|---:|---:|---:|---|');
  const rows = [];
  for (const [k, s] of Object.entries(cw.alb || {})) rows.push(line(`ALB ${k}`, s));
  for (const [svc, ms] of Object.entries(cw.ecs || {})) for (const [k, s] of Object.entries(ms)) rows.push(line(`ECS ${svc} ${k}`, s));
  for (const [k, s] of Object.entries(cw.rds || {})) rows.push(line(`RDS ${k}`, s));
  for (const [k, s] of Object.entries(cw.redis || {})) rows.push(line(`Redis ${k}`, s));
  for (const [box, ms] of Object.entries(cw.ec2 || {})) for (const [k, s] of Object.entries(ms)) if (k !== 'instance') rows.push(line(`EC2 ${box} ${k}`, s));
  for (const r of rows) if (r) P(r);
  P();
  if (cw.top_sql_by_db_load?.length) {
    P('### Heaviest SQL by database load (Performance Insights)');
    P();
    P('| Load (avg active sessions) | Statement |');
    P('|---:|---|');
    for (const q of cw.top_sql_by_db_load) P(`| ${q.load_avg} | \`${String(q.sql).replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 220)}\` |`);
    P();
  } else {
    P('Performance Insights: no data (disabled or too short a run).');
    P();
  }
}

if (cost) {
  P('## Cost');
  P();
  P(`Estimate before the run: **$${cost.estimate_usd}** (upper bound $${cost.upper_bound_usd}), see the estimate job. The real bill is in AWS Cost Explorer, tag \`Project = lawbid-loadtest\` (appears after ~24 h).`);
  P();
}

console.log(out.join('\n'));
