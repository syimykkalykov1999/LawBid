// Quick per-endpoint probe: status, JSON bytes, gzip bytes, p50/p95 over N
// sequential requests (warm), with the Postgres statement count read from
// pg_stat_statements-free counter `x-db-queries` if present. Run after
// bench/mint-tokens.mjs.
// Usage: BASE_URL=http://localhost:3055/api/v1 TOKENS_FILE=tok_client.json \
//   [PATHS=/feed,/reels] node bench/probe.mjs [rounds]
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const base = process.env.BASE_URL ?? 'http://localhost:3055/api/v1';
const tokens = JSON.parse(readFileSync(process.env.TOKENS_FILE ?? 'tokens.json', 'utf8'));
const rounds = Number(process.argv[2] ?? 30);
const paths = (
  process.env.PATHS ??
  '/config/bootstrap,/me/session,/feed,/reels,/conversations,/notifications,/badges,/users/me/profile,/attorneys/me/profile,/search/attorneys?q=law1,/search/people?q=law,/search/posts?q=deposit,/search/suggest?q=law,/practice-areas'
).split(',');

const pct = (a, p) => a[Math.min(a.length - 1, Math.floor((a.length * p) / 100))];
const rows = [];
for (const path of paths) {
  const times = [];
  let status = 0;
  let bytes = 0;
  let gz = 0;
  for (let i = 0; i < rounds; i++) {
    const t0 = performance.now();
    const res = await fetch(base + path, {
      headers: { authorization: `Bearer ${tokens[i % tokens.length]}`, 'accept-encoding': 'identity' },
    });
    const body = Buffer.from(await res.arrayBuffer());
    times.push(performance.now() - t0);
    status = res.status;
    bytes = body.length;
    gz = gzipSync(body).length;
  }
  times.sort((x, y) => x - y);
  rows.push({ path, status, bytes, gzip: gz, p50: +pct(times, 50).toFixed(1), p95: +pct(times, 95).toFixed(1) });
}
console.table(rows);
