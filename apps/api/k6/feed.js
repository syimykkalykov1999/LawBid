import http from 'k6/http';
import { check } from 'k6';
import { ATTORNEY_TOKENS, BASE_URL, READ_THRESHOLDS, auth, pick, stages } from './lib/config.js';

export const options = { scenarios: { feed: { ...stages('read'), exec: 'feed' } }, thresholds: READ_THRESHOLDS };

export function feed() {
  const t = pick(ATTORNEY_TOKENS);
  const first = http.get(`${BASE_URL}/feed?limit=20`, auth(t));
  check(first, { 'feed 200': (r) => r.status === 200 });
  const cursor = first.json('meta.nextCursor');
  if (cursor) {
    const next = http.get(`${BASE_URL}/feed?limit=20&cursor=${encodeURIComponent(cursor)}`, auth(t));
    check(next, { 'feed page 2 200': (r) => r.status === 200 });
  }
}
