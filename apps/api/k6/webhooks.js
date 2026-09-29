import http from 'k6/http';
import { check } from 'k6';
import crypto from 'k6/crypto';
import { BASE_URL, WRITE_THRESHOLDS, stages } from './lib/config.js';

const SECRET = __ENV.STRIPE_WEBHOOK_SECRET || '';
export const options = { scenarios: { webhooks: { ...stages('write'), exec: 'webhook' } }, thresholds: WRITE_THRESHOLDS };

export function webhook() {
  const ts = Math.floor(Date.now() / 1000);
  const id = `evt_load_${__VU}_${__ITER}`;
  const payload = JSON.stringify({ id, type: 'customer.subscription.updated', data: { object: { id: 'sub_load', object: 'subscription' } } });
  const sig = SECRET ? `t=${ts},v1=${crypto.hmac('sha256', SECRET, `${ts}.${payload}`, 'hex')}` : 'fake';
  const res = http.post(`${BASE_URL}/webhooks/stripe`, payload, { headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig } });
  // 200 = stored + queued (idempotent by id); the worker re-reads Stripe.
  check(res, { 'webhook 200': (r) => r.status === 200 });
}
