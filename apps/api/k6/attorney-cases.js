import http from 'k6/http';
import { check } from 'k6';
import { ATTORNEY_TOKENS, CASE_IDS, BASE_URL, READ_THRESHOLDS, auth, pick, stages } from './lib/config.js';

export const options = { scenarios: { cases: { ...stages('read'), exec: 'cases' } }, thresholds: READ_THRESHOLDS };

export function cases() {
  const t = pick(ATTORNEY_TOKENS);
  const list = http.get(`${BASE_URL}/cases?limit=20&sort=newest`, auth(t));
  check(list, { 'cases 200': (r) => r.status === 200 });
  const detail = http.get(`${BASE_URL}/cases/${pick(CASE_IDS)}`, auth(t));
  check(detail, {
    'case 200': (r) => r.status === 200,
    // docs/06 §9.3: never a client contact in an attorney response.
    'no client email': (r) => !/@/.test(JSON.stringify(r.json('data') || {})),
  });
}
