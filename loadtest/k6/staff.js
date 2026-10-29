// Many staff at once (round 2 of docs/perf/LOCAL_LOAD_TEST_2026-10-28.md):
// every VU is ONE staff member (local-docker/staff.sql + scripts/mint-staff.mjs)
// working its real loop for its role:
//   verifier  : «Следующий» (lease next, verification) -> the request ->
//               a document link -> done -> next
//   moderator : lease next (reports) -> the reported item -> done -> next
//   support   : lease next (support tickets) -> the ticket -> done -> next
//   finance   : the money pages
//   owner     : (every 50th account) «Сегодня», system health, scale, the
//               «…и дальше» re-check screen (workspace/review), user search
// and every worker now and then searches users and opens its progress. Each lease is logged
// ("LEASE kind item vu t_taken t_done") so the run can be checked for
// contention afterwards (local-docker/lease_check.py: no item in two hands
// at once).
//   k6 run -e STAFF_FILE=staff.json -e VUS=200 -e HOLD=3m ... staff.js
import { sleep } from 'k6';
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import { Counter } from 'k6/metrics';
import { assertSafeTarget } from './lib/env.js';
import { get, post, json } from './lib/http.js';

const STAFF = new SharedArray('staff', () => JSON.parse(open(__ENV.STAFF_FILE)).staff);
const VUS = Number(__ENV.VUS || 50);
const leased = new Counter('lease_granted');
const empty = new Counter('lease_empty');

export const ENDPOINTS = [
  'st_lease_next', 'st_lease_done', 'st_lease_me', 'st_verif_item', 'st_verif_doc',
  'st_ticket_item', 'st_today', 'st_today_system', 'st_system_health', 'st_scale', 'st_search',
  'st_review_next', 'st_review_current', 'st_billing', 'st_payments', 'st_my_progress', 'st_mod_queue', 'st_verif_queue',
];
const t = {};
for (const n of ENDPOINTS) {
  t[`http_req_duration{name:${n}}`] = ['max>=0'];
  t[`http_req_failed{name:${n}}`] = ['rate>=0'];
  t[`http_reqs{name:${n}}`] = ['count>=0'];
}
export const options = {
  scenarios: {
    staff: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.RAMP || '1m', target: VUS },
        { duration: __ENV.HOLD || '3m', target: VUS },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '10s',
      exec: 'work',
    },
  },
  userAgent: 'lawbid-loadtest/1',
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: t,
};

export function setup() {
  assertSafeTarget();
  if (STAFF.length < VUS) throw new Error(`only ${STAFF.length} staff accounts for ${VUS} VUs`);
}

const KIND = { verifier: 'verification', moderator: 'report', support: 'support_ticket' };
const NF = [403, 404, 409, 410];
const think = () => sleep(1 + Math.random() * 3);

function dashboards(tk) {
  const k = Math.random();
  if (k < 0.3) {
    get('/admin/staff/today', tk, 'st_today', undefined, NF);
    get('/admin/staff/today/system', tk, 'st_today_system', undefined, NF);
  } else if (k < 0.5) get('/admin/system-health', tk, 'st_system_health', undefined, NF);
  else if (k < 0.6) get('/admin/system-health/scale', tk, 'st_scale', undefined, NF);
  else if (k < 0.8) search(tk);
  else {
    const r = post('/admin/workspace/review/next', {}, tk, 'st_review_next', undefined, NF);
    if (json(r, 'data.status') === 'leased') get('/admin/workspace/review/current', tk, 'st_review_current', undefined, NF);
  }
}

function search(tk) {
  get(`/admin/users?q=${['smith', 'law', 'case', 'maria'][Math.floor(Math.random() * 4)]}`, tk, 'st_search', undefined, NF);
}

function item(kind, id, tk) {
  if (kind === 'verification') {
    const r = get(`/admin/verification/requests/${id}`, tk, 'st_verif_item', undefined, NF);
    const docs = json(r, 'data.documents') || [];
    if (docs.length && docs[0].id) post(`/admin/verification/documents/${docs[0].id}/url`, {}, tk, 'st_verif_doc', undefined, NF);
  } else if (kind === 'report') {
    // the report screen: the moderation queue with the item (the lease
    // carries no target id, the page opens it from the list)
    get(`/admin/moderation/queue?limit=20`, tk, 'st_mod_queue', undefined, NF);
  } else {
    get(`/admin/support/tickets/${id}`, tk, 'st_ticket_item', undefined, NF);
  }
}

export function work() {
  const s = STAFF[(exec.vu.idInTest - 1) % STAFF.length];
  const tk = s.t;
  if (s.role === 'super_admin') {
    dashboards(tk);
    return think();
  }
  if (Math.random() < 0.1) {
    if (Math.random() < 0.5) search(tk);
    else get('/admin/staff/me/progress', tk, 'st_my_progress', undefined, NF);
    return think();
  }
  if (s.role === 'finance') {
    if (Math.random() < 0.5) get('/admin/billing/overview', tk, 'st_billing', undefined, NF);
    else get('/admin/billing/payments?limit=20', tk, 'st_payments', undefined, NF);
    return think();
  }
  const kind = KIND[s.role];
  const r = post('/admin/desk/lease/next', { kind }, tk, 'st_lease_next', undefined, NF);
  const st = json(r, 'data.status');
  const lease = json(r, 'data.lease');
  if (st !== 'leased' || !lease) {
    empty.add(1);
    if (Math.random() < 0.3) get('/admin/desk/lease/me', tk, 'st_lease_me', undefined, NF);
    return sleep(2 + Math.random() * 3);
  }
  leased.add(1);
  const t0 = Date.now();
  item(kind, lease.itemId, tk);
  sleep(2 + Math.random() * 6); // reading the item, deciding
  post(`/admin/desk/lease/${kind}/${lease.itemId}/done`, { outcome: 'lt_done' }, tk, 'st_lease_done', undefined, NF);
  console.log(`LEASE ${kind} ${lease.itemId} ${exec.vu.idInTest} ${t0} ${Date.now()}`);
  return sleep(0.5);
}
