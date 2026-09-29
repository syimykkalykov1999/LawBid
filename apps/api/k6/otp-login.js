import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, WRITE_THRESHOLDS, requirePaidFlowsAllowed, stages } from './lib/config.js';

// Staging runs with OTP_DEV_FIXED_CODE=true and SMS_PROVIDER=mock for this
// scenario (never against real Twilio: docs/COST_PROTECTION.md).
requirePaidFlowsAllowed('otp-login');
export const options = { scenarios: { login: { ...stages('write'), exec: 'login' } }, thresholds: WRITE_THRESHOLDS };

export function login() {
  const phone = `+1201555${String(1000 + (__VU * 97 + __ITER) % 9000)}`;
  const headers = { 'Content-Type': 'application/json', 'X-Device-Id': `k6-${__VU}` };
  const req = http.post(`${BASE_URL}/auth/otp/request`, JSON.stringify({ channel: 'phone', identifier: phone }), { headers });
  check(req, { 'otp request 2xx/429': (r) => r.status < 300 || r.status === 429 });
  if (req.status >= 300) return;
  const ver = http.post(`${BASE_URL}/auth/otp/verify`, JSON.stringify({ channel: 'phone', identifier: phone, code: '000000' }), { headers });
  check(ver, { 'otp verify 200': (r) => r.status === 200 });
}
