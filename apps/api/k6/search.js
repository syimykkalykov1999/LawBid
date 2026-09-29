import http from 'k6/http';
import { check } from 'k6';
import { ATTORNEY_TOKENS, CLIENT_TOKENS, BASE_URL, READ_THRESHOLDS, auth, pick, stages } from './lib/config.js';

const TERMS = ['dui', 'divorce', 'ticket', 'landlord', 'visa', 'contract'];
export const options = { scenarios: { search: { ...stages('read'), exec: 'search' } }, thresholds: READ_THRESHOLDS };

export function search() {
  const q = pick(TERMS);
  const a = http.get(`${BASE_URL}/search/cases?q=${q}&limit=20`, auth(pick(ATTORNEY_TOKENS)));
  const b = http.get(`${BASE_URL}/search/attorneys?q=${q}&limit=20`, auth(pick(CLIENT_TOKENS)));
  const c = http.get(`${BASE_URL}/search/posts?q=${q}&limit=20`, auth(pick(CLIENT_TOKENS)));
  check(a, { 'search cases 200': (r) => r.status === 200 });
  check(b, { 'search attorneys 200': (r) => r.status === 200 });
  check(c, { 'search posts 200': (r) => r.status === 200 });
}
