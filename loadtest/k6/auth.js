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
import { Trend, Rate } from 'k6/metrics';
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

// Valid US numbers (libphonenumber must accept them; 555 and N11 exchanges
// are not valid): 212-<exchange 200..999 without N11>-<4 digits> = 7.9M numbers.
const EXCHANGES = [];
for (let e = 200; e < 1000; e++) if (e % 100 !== 11) EXCHANGES.push(e);
const phone = (n) => `+1212${EXCHANGES[Math.floor(n / 10000) % EXCHANGES.length]}${String(n % 10000).padStart(4, '0')}`;

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
    login_ok: ['rate>0.99'],
    login_ms: ['p(95)<3000'],
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
  if (ok) {
    const t1 = Date.now();
    const r2 = http.post(`${API_URL}/auth/otp/verify`, JSON.stringify({ channel: 'phone', identifier: id, code: '000000' }), Object.assign({ tags: { name: 'otp_verify' } }, H));
    verifyMs.add(Date.now() - t1);
    ok = r2.status === 200 || r2.status === 201;
    check(r2, { 'verify ok': () => ok });
  } else {
    check(r1, { 'request ok': () => false });
  }
  loginOk.add(ok);
  loginMs.add(Date.now() - t0);
}
