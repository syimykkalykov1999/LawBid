// Local before/after bench of hot authenticated reads (autocannon).
// Usage: BASE_URL=http://localhost:3000/api/v1 TOKENS_FILE=tokens.json \
//   node bench/hot-endpoints.mjs [seconds] [connections]
// TOKENS_FILE: JSON array of access tokens (one per load account); each
// connection rotates through them so Redis per-user caches are exercised
// like real traffic, not one hot user.
import autocannon from 'autocannon';
import { readFileSync } from 'node:fs';

const base = process.env.BASE_URL ?? 'http://localhost:3000/api/v1';
const tokens = JSON.parse(readFileSync(process.env.TOKENS_FILE ?? 'tokens.json', 'utf8'));
const duration = Number(process.argv[2] ?? 10);
const connections = Number(process.argv[3] ?? 50);
const paths = (process.env.PATHS ??
  '/feed,/notifications,/conversations,/search/posts?q=lorem,/search/attorneys?q=u1,/practice-areas,/countries').split(',');

const rows = [];
for (const path of paths) {
  let i = 0;
  const r = await autocannon({
    url: base + path, duration, connections,
    requests: [{ method: 'GET', setupRequest: (req) => {
      req.headers = { ...req.headers, authorization: `Bearer ${tokens[i++ % tokens.length]}`, 'accept-encoding': 'gzip' };
      return req;
    } }],
  });
  rows.push({ path, rps: Math.round(r.requests.average), p50: r.latency.p50, p97_5: r.latency.p97_5, p99: r.latency.p99,
    non2xx: r.non2xx, errors: r.errors, bytesPerReq: Math.round(r.throughput.average / Math.max(1, r.requests.average)) });
}
console.table(rows);
