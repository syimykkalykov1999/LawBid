// Closed-model variant of main.js: N "people" (virtual users) each doing the
// same mix (lib/mix.js) with a think time between actions, plus held chat
// sockets. Used for the local laptop runs (docs/perf/LOCAL_LOAD_TEST_2026-10-28.md)
// where the question is "how many people at once" rather than "how many req/s".
//
//   k6 run -e VUS=1000 -e HOLD=4m -e RAMP=1m -e WS=100 -e PROFILE=local -e ALLOW_LOCAL=1 \
//     -e API_URL=... -e WS_URL=... -e TOKENS_FILE=... -e FIXTURES_FILE=... loadtest/k6/vus.js
//
//   VUS    people at the top          THINK_MIN/THINK_MAX  seconds between actions (1 / 3)
//   RAMP   time to reach VUS          WS     held Socket.IO connections (0 = none)
//   HOLD   time at VUS                WS_HOLD_SECONDS      life of one held connection
import { sleep } from 'k6';
import { assertSafeTarget } from './lib/env.js';
import { LIMITS } from './lib/profiles.js';
import { runOne } from './lib/mix.js';
import { counts, clientToken, rnd } from './lib/data.js';
import { holdSocket } from './lib/realtime.js';
import { get } from './lib/http.js';

export { holdSocket };

const VUS = Number(__ENV.VUS || 100);
const RAMP = __ENV.RAMP || '1m';
const HOLD = __ENV.HOLD || '4m';
const WS = Number(__ENV.WS || 0);
const TMIN = Number(__ENV.THINK_MIN || 1);
const TMAX = Number(__ENV.THINK_MAX || 3);

const scenarios = {
  users: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [{ duration: RAMP, target: VUS }, { duration: HOLD, target: VUS }, { duration: '20s', target: 0 }],
    gracefulRampDown: '10s',
    exec: 'person',
  },
};
if (WS > 0) {
  scenarios.sockets = {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [{ duration: RAMP, target: WS }, { duration: HOLD, target: WS }],
    gracefulRampDown: '10s',
    exec: 'holdSocket',
  };
}

const abort = (threshold) => (__ENV.NO_K6_ABORT === '1' ? [threshold] : [{ threshold, abortOnFail: true, delayAbortEval: `${LIMITS.abort_window_seconds}s` }]);
const ENDPOINTS = ['session', 'bootstrap', 'i18n', 'feed', 'feed_p2', 'reels', 'attorney_profile', 'post', 'search_attorneys', 'search_people', 'search_suggest', 'chat_list', 'chat_messages', 'chat_send', 'chat_send_ws', 'notifications', 'badges', 'cases_feed', 'my_cases', 'case_bids', 'admin_users', 'admin_search', 'admin_disputes', 'admin_export'];
const t = {
  http_req_failed: abort(`rate<${LIMITS.abort_error_rate}`),
  http_req_duration: abort(`p(95)<${LIMITS.abort_p95_ms}`),
};
for (const n of ENDPOINTS) {
  t[`http_req_duration{name:${n}}`] = ['max>=0'];
  t[`http_req_failed{name:${n}}`] = ['rate>=0'];
  t[`http_reqs{name:${n}}`] = ['count>=0'];
}

export const options = {
  scenarios,
  userAgent: 'lawbid-loadtest/1',
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: t,
};

export function setup() {
  assertSafeTarget();
  const c = counts();
  if (c.clients === 0 || c.conversations === 0) throw new Error(`no accounts / conversations loaded (${JSON.stringify(c)})`);
  const r = get('/me/session', clientToken(rnd), 'probe');
  if (r.status !== 200) throw new Error(`probe /me/session answered ${r.status}: ${String(r.body).slice(0, 200)}`);
  console.log(`vus=${VUS} ws=${WS} accounts=${JSON.stringify(c)}`);
  return {};
}

export function person() {
  runOne();
  sleep(TMIN + Math.random() * (TMAX - TMIN));
}
