// LawBid load test (k6). One script, six profiles (loadtest/profiles.json):
//   k6 run -e PROFILE=smoke -e API_URL=... -e WS_URL=... loadtest/k6/main.js
// Normally started by scripts/run-generator.sh (guard + results folder).
import { assertSafeTarget, PROFILE, SHARD, SHARDS } from './lib/env.js';
import { P, LIMITS, AVG_REQS_PER_ITER, httpScenario, realtimeScenarios, callScenario } from './lib/profiles.js';
import { runOne, avgReqs } from './lib/mix.js';
import { counts } from './lib/data.js';
import { holdSocket, stormSocket, callFlow } from './lib/realtime.js';
import { get } from './lib/http.js';
import { clientToken, rnd } from './lib/data.js';

export { holdSocket, stormSocket, callFlow };

const scenarios = Object.assign(
  {},
  P.peak_rps > 0 ? { http: httpScenario() } : {},
  realtimeScenarios(),
  callScenario(),
);

// The abort rule of the owner (error rate > 5 % or p95 > 2 s for 60 s) is
// enforced twice: here (cumulative, after the first 60 s - a backstop that
// works even when nothing else runs) and by scripts/guard.py, which reads
// k6's counters every 5 s and looks at the LAST 60 s only.
// NO_K6_ABORT=1 (testing only): leave the stopping to scripts/guard.py
const abort = (threshold) => (__ENV.NO_K6_ABORT === '1' ? [threshold] : [{ threshold, abortOnFail: true, delayAbortEval: `${LIMITS.abort_window_seconds}s` }]);

function abortThresholds() {
  return {
    http_req_failed: abort(`rate<${LIMITS.abort_error_rate}`),
    http_req_duration: abort(`p(95)<${LIMITS.abort_p95_ms}`),
    slow_req: abort('rate<0.05'),
  };
}

// Per-endpoint numbers for the report: these thresholds are always true; they
// exist so that k6 exports a sub-metric (count, error share, latency) per
// endpoint name in summary.json.
const ENDPOINTS = ['session', 'bootstrap', 'i18n', 'feed', 'feed_p2', 'reels', 'attorney_profile', 'post', 'search_attorneys', 'search_people', 'search_suggest', 'chat_list', 'chat_messages', 'chat_send', 'chat_send_ws', 'notifications', 'badges', 'cases_feed', 'my_cases', 'case_bids', 'admin_users', 'admin_search', 'admin_disputes', 'admin_export', 'static', 'call_start', 'call_accept', 'call_end'];
function perEndpoint() {
  const t = {};
  for (const n of ENDPOINTS) {
    t[`http_req_duration{name:${n}}`] = ['max>=0'];
    t[`http_req_failed{name:${n}}`] = ['rate>=0'];
    t[`http_reqs{name:${n}}`] = ['count>=0'];
  }
  return t;
}

export const options = {
  scenarios,
  insecureSkipTLSVerify: true, // the ALB is reached by its AWS name, the certificate is for the app's name
  noConnectionReuse: false,
  userAgent: 'lawbid-loadtest/1',
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: Object.assign(
    {},
    abortThresholds(),
    perEndpoint(),
    scenarios.http
      ? { 'http_req_duration{kind:api}': [`p(95)<${LIMITS.abort_p95_ms}`], 'http_req_duration{kind:cdn}': ['p(95)<500'], 'http_req_failed{kind:cdn}': ['rate<0.01'], dropped_iterations: ['count<100000'] }
      : {},
    scenarios.sockets || scenarios.storm ? { ws_connected: ['rate>0.95'], ws_connect_ms: ['p(95)<3000'], room_join_ok: ['rate>0.98'] } : {},
    scenarios.sockets ? { chat_delivered: ['rate>0.98'], chat_delivery_ms: ['p(95)<2000'] } : {},
    scenarios.calls ? { call_flow_ok: ['rate>0.95'] } : {},
  ),
};

export function setup() {
  assertSafeTarget();
  const c = counts();
  if (c.clients === 0 || c.conversations === 0) {
    throw new Error(`no test accounts / conversations loaded (${JSON.stringify(c)}); run scripts/mint-tokens.sh and scripts/discover.mjs first`);
  }
  // one authenticated probe: a wrong URL / token fails here, not after 20 minutes
  const r = get('/me/session', clientToken(rnd), 'probe');
  if (r.status !== 200) throw new Error(`probe /me/session answered ${r.status}: ${String(r.body).slice(0, 200)}`);
  if (Math.abs(avgReqs - AVG_REQS_PER_ITER) > 0.1) console.warn(`mix averages ${avgReqs.toFixed(2)} requests per iteration, profiles.js assumes ${AVG_REQS_PER_ITER}: the request rate will be off`);
  console.log(`profile=${PROFILE} shard=${SHARD}/${SHARDS} avgReqsPerIteration(mix)=${avgReqs.toFixed(2)} accounts=${JSON.stringify(c)}`);
  return {};
}

export function mix() {
  runOne();
}
