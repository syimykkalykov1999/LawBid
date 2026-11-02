import http from 'k6/http';
import { check } from 'k6';
import { Rate, Counter } from 'k6/metrics';
import { API_URL, HOST_HEADER, CDN_URL } from './env.js';
import { LIMITS } from './profiles.js';

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }));

// "slow_req" is 1 when a request took longer than the abort limit. The share
// of slow requests over a window > 5 % is exactly "p95 > limit", and a Rate
// can be read as plain counters by scripts/guard.py (windowed, unlike a
// cumulative p95).
export const slowReq = new Rate('slow_req');
export const api429 = new Counter('api_429');
// Plain counters for scripts/guard.py: k6's REST API shows a Rate only as a
// ratio, a Counter as a count, and the guard needs counts to look at the last
// minute only (difference of two readings).
export const trackedReqs = new Counter('tracked_reqs');
export const failedReqs = new Counter('failed_reqs');
export const slowReqs = new Counter('slow_reqs');

const baseHeaders = (token, extra) => {
  const h = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  if (HOST_HEADER) h.Host = HOST_HEADER;
  return extra ? Object.assign(h, extra) : h;
};

function track(res, name, expected) {
  const slow = res.timings.duration > LIMITS.abort_p95_ms;
  const ok = (res.status >= 200 && res.status < 400) || (expected && expected.indexOf(res.status) !== -1);
  slowReq.add(slow);
  trackedReqs.add(1);
  if (!ok) failedReqs.add(1);
  if (slow) slowReqs.add(1);
  if (res.status === 429) api429.add(1);
  return check(res, { [`${name} ok`]: () => ok }, { name });
}

export function get(path, token, name, extra, expected) {
  const params = { headers: baseHeaders(token, extra), tags: { name, kind: 'api' } };
  if (expected) params.responseCallback = http.expectedStatuses({ min: 200, max: 399 }, ...expected);
  const res = http.get(API_URL + path, params);
  track(res, name, expected);
  return res;
}

// `expected`: extra status codes that are NOT failures for this call (e.g.
// 409 "call already in progress" is a normal answer for a busy chat).
export function post(path, body, token, name, extra, expected) {
  // A code request sends a real SMS / e-mail. This suite never logs in (it uses
  // minted tokens); the line stays so no later scenario can start spending by
  // accident (audit X-14, 2026-10-26).
  if (path.indexOf('/auth/otp') === 0 && __ENV.K6_SMS_ALLOWED !== 'true') {
    throw new Error(`REFUSING: ${path} sends a real SMS or e-mail; set K6_SMS_ALLOWED=true only against a stack with SMS_PROVIDER=mock`);
  }
  const params = { headers: baseHeaders(token, extra), tags: { name, kind: 'api' } };
  if (expected) params.responseCallback = http.expectedStatuses({ min: 200, max: 399 }, ...expected);
  const res = http.post(API_URL + path, body === undefined ? null : JSON.stringify(body), params);
  track(res, name, expected);
  return res;
}

// PUT / DELETE for the full mix (lib/mix-full.js)
function send(method, path, body, token, name, expected) {
  const params = { headers: baseHeaders(token), tags: { name, kind: 'api' } };
  if (expected) params.responseCallback = http.expectedStatuses({ min: 200, max: 399 }, ...expected);
  const res = http.request(method, API_URL + path, body === undefined ? null : JSON.stringify(body), params);
  track(res, name, expected);
  return res;
}
export const put = (path, body, token, name, expected) => send('PUT', path, body, token, name, expected);
export const del = (path, token, name, expected) => send('DELETE', path, undefined, token, name, expected);

export function asset(path) {
  if (!CDN_URL) return null;
  const res = http.get(CDN_URL + path, { tags: { name: 'static', kind: 'cdn' } });
  track(res, 'static');
  return res;
}

export const json = (res, path) => {
  try {
    return res.json(path);
  } catch (_) {
    return undefined;
  }
};
