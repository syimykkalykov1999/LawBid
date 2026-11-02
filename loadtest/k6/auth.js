// Login storm: new people sign in by phone code at LOGIN_RATE per second.
// Every iteration = POST /auth/otp/request + POST /auth/otp/verify with a NEW
// phone number, i.e. a sign-up (a user row, a session, device rows, audit).
//
// ONLY against the local stack started with api-auth.env (make-env.sh with
// AUTH_TEST=1: SMS_PROVIDER=mock, fixed code 000000, per-IP limits raised).
// It never sends a real SMS: lib/http.js refuses /auth/otp unless
// K6_SMS_ALLOWED=true, the target check below refuses non-local hosts, and
// the API itself refuses a fixed code outside NODE_ENV=development/test.
//
//   k6 run -e K6_SMS_ALLOWED=true -e ALLOW_LOCAL=1 -e API_URL=http://127.0.0.1:3055/api/v1 \
//     -e LOGIN_RATE=50 -e RAMP=30s -e HOLD=2m loadtest/k6/auth.js
import http from 'k6/http';
import execution from 'k6/execution';
import { check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { API_URL, assertSafeTarget } from './lib/env.js';

const RATE = Number(__ENV.LOGIN_RATE || 20);
const RAMP = __ENV.RAMP || '30s';
const HOLD = __ENV.HOLD || '2m';
// phone numbers of one run never repeat; a second run on the same database
// must pass a different PHONE_OFFSET (or start from a fresh database)
const OFFSET = Number(__ENV.PHONE_OFFSET || 0);

const loginMs = new Trend('login_ms', true);
const verifyMs = new Trend('login_verify_ms', true);
const loginOk = new Rate('login_ok');
// which step answered with which status: shows WHICH limit tripped
const loginFail = new Counter('login_fail');

// Valid US numbers (libphonenumber must accept them; 555 and N11 exchanges are
// not valid). Consecutive logins use DIFFERENT 6-digit prefixes (area code +
// exchange) so that the SMS abuse guard's per-prefix velocity does not trip on
// the test itself: 10 area codes x 789 exchanges = 7 890 prefixes x 10 000 numbers.
const AREAS = ['212', '213', '305', '312', '404', '415', '617', '646', '702', '713'];
const EXCHANGES = [];
for (let e = 200; e < 1000; e++) if (e % 100 !== 11) EXCHANGES.push(e);
const PREFIXES = AREAS.length * EXCHANGES.length;
const phone = (n) => {
  const p = n % PREFIXES;
  return `+1${AREAS[p % AREAS.length]}${EXCHANGES[Math.floor(p / AREAS.length)]}${String(Math.floor(n / PREFIXES) % 10000).padStart(4, '0')}`;
};

export const options = {
  scenarios: {
    logins: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: Math.max(20, RATE * 2),
      maxVUs: Math.max(100, RATE * 10),
      stages: [{ duration: RAMP, target: RATE }, { duration: HOLD, target: RATE }, { duration: '10s', target: 0 }],
    },
  },
  userAgent: 'lawbid-loadtest/1',
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    // same stop rule as the other runs (60 s of errors > 5 % or p95 > 2 s), plus the final gate
    login_ok: [{ threshold: 'rate>0.95', abortOnFail: true, delayAbortEval: '60s' }, 'rate>0.99'],
    login_ms: [{ threshold: 'p(95)<4000', abortOnFail: true, delayAbortEval: '60s' }, 'p(95)<3000'],
  },
};

export function setup() {
  assertSafeTarget();
  if (__ENV.ALLOW_LOCAL !== '1') throw new Error('auth.js runs only against the local stack (ALLOW_LOCAL=1)');
  if (__ENV.K6_SMS_ALLOWED !== 'true') throw new Error('set K6_SMS_ALLOWED=true (local stack with SMS_PROVIDER=mock only)');
  return {};
}

const H = { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } };

export default function () {
  const id = phone(OFFSET + execution.scenario.iterationInTest);
  const t0 = Date.now();
  const r1 = http.post(`${API_URL}/auth/otp/request`, JSON.stringify({ channel: 'phone', identifier: id }), Object.assign({ tags: { name: 'otp_request' } }, H));
  let ok = r1.status === 200;
  if (!ok) loginFail.add(1, { step: 'request', status: String(r1.status) });
  if (ok) {
    const t1 = Date.now();
    const r2 = http.post(`${API_URL}/auth/otp/verify`, JSON.stringify({ channel: 'phone', identifier: id, code: '000000' }), Object.assign({ tags: { name: 'otp_verify' } }, H));
    verifyMs.add(Date.now() - t1);
    ok = r2.status === 200 || r2.status === 201;
    if (!ok) loginFail.add(1, { step: 'verify', status: String(r2.status) });
    check(r2, { 'verify ok': () => ok });
  } else {
    check(r1, { 'request ok': () => false });
  }
  loginOk.add(ok);
  loginMs.add(Date.now() - t0);
}
