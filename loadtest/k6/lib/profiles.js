// Turns loadtest/profiles.json into k6 scenario options. One generator
// (shard) runs 1/SHARDS of every rate and connection count.
import { SHARDS, PROFILE } from './env.js';

const all = JSON.parse(open('../../profiles.json'));
export const LIMITS = all.limits;
export const GATES = all.gates;
export const P = all.profiles[PROFILE];
if (!P) throw new Error(`unknown PROFILE ${PROFILE}`);

const share = (n) => Math.max(1, Math.ceil(n / SHARDS));

// Average HTTP requests per iteration of the mix (lib/mix.js keeps the
// same numbers): the arrival rate is in ITERATIONS per second, so the
// profile's req/s is divided by this.
export const AVG_REQS_PER_ITER = Number(__ENV.AVG_REQS_PER_ITER || 1.31);

export function httpScenario() {
  const stages = P.stages.map(([duration, rps]) => ({
    duration,
    target: Math.round(share(rps) / AVG_REQS_PER_ITER),
  }));
  const peak = Math.max(...stages.map((s) => s.target));
  return {
    executor: 'ramping-arrival-rate',
    startRate: 1,
    timeUnit: '1s',
    preAllocatedVUs: Math.min(500, Math.max(20, peak)),
    // Hard cap on VUs per generator (memory); when it is reached k6 reports
    // dropped_iterations instead of silently going on.
    maxVUs: Math.min(2500, Math.max(50, peak * 3)),
    stages,
    exec: 'mix',
  };
}

export function totalSeconds() {
  const unit = { s: 1, m: 60, h: 3600 };
  return P.stages.reduce((a, [d]) => a + Number(d.slice(0, -1)) * unit[d.slice(-1)], 0);
}

const secs = (t) => `${Math.max(5, Math.round(t))}s`;

export function realtimeScenarios() {
  const out = {};
  const T = totalSeconds();
  if (P.ws_hold > 0) {
    // ramp to the held-connection count in 20 % of the run (max 2 min), hold for ws_duration
    out.sockets = {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: secs(Math.min(120, T * 0.2)), target: share(P.ws_hold) },
        { duration: P.ws_duration, target: share(P.ws_hold) },
      ],
      gracefulRampDown: '20s',
      exec: 'holdSocket',
    };
  }
  if (P.ws_storm_per_s > 0) {
    // Reconnect storm in the middle of the run: connections that live 10-20 s
    // and are replaced at once. Arrival rate = connect attempts per second.
    const rate = share(P.ws_storm_per_s);
    out.storm = {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: Math.min(1500, Math.max(50, rate * 25)),
      stages: [
        { duration: secs(T * 0.1), target: rate },
        { duration: secs(Math.max(60, T * 0.2)), target: rate },
        { duration: '20s', target: 0 },
      ],
      startTime: secs(T * 0.4),
      exec: 'stormSocket',
    };
  }
  return out;
}

export function callScenario() {
  if (!P.calls_per_s) return {};
  const T = totalSeconds();
  const rate = Math.max(1, Math.round(P.calls_per_s / SHARDS));
  return {
    calls: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: Math.min(1500, Math.max(50, rate * 20)),
      stages: [
        { duration: secs(T * 0.2), target: rate },
        { duration: secs(T * 0.5), target: rate },
        { duration: '10s', target: 0 },
      ],
      startTime: secs(T * 0.15),
      exec: 'callFlow',
    },
  };
}

// Budget value of a gate: the profile's own number, else the default in limits.budgets.
export const budgetOf = (name) => (P.budgets && P.budgets[name] !== undefined ? P.budgets[name] : LIMITS.budgets[name]);

// p95 / error-rate budgets per scenario (profiles.json "gates"). Plain
// thresholds, NO abortOnFail: the run completes, k6 exits 99 and the report
// shows which budget was missed. `have` = names of the scenarios in this run.
export function gateThresholds(have) {
  const t = {};
  for (const g of GATES) {
    if (!g.requires.some((r) => have.includes(r))) continue;
    if (g.needs_assets && !P.assets) continue;
    (t[g.metric] = t[g.metric] || []).push(`${g.agg}${g.op}${budgetOf(g.budget)}`);
  }
  return t;
}
