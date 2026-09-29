import http from 'k6/http';
import { check } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { ATTORNEY_TOKENS, CASE_IDS, BASE_URL, WRITE_THRESHOLDS, auth, pick, stages } from './lib/config.js';

export const options = { scenarios: { bid: { ...stages('write'), exec: 'bid' } }, thresholds: WRITE_THRESHOLDS };

export function bid() {
  const t = pick(ATTORNEY_TOKENS);
  const body = JSON.stringify({
    feeType: 'fixed',
    amountCents: 50000 + Math.floor(Math.random() * 100000),
    message: 'Load test bid — please ignore.',
    startAvailability: 'immediately',
  });
  const params = auth(t);
  params.headers['Idempotency-Key'] = uuidv4();
  const res = http.post(`${BASE_URL}/cases/${pick(CASE_IDS)}/bids`, body, params);
  // 201 first bid, 409 BID_ALREADY_EXISTS on repeats — both are correct behaviour.
  check(res, { 'bid 201/409': (r) => r.status === 201 || r.status === 409 });
}
