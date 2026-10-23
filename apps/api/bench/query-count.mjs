// DB round trips per request, per endpoint, with distinct (cold) users.
// Reads xact_commit of the perf database before/after N requests (every
// Prisma statement outside an interactive transaction is one commit; an
// interactive transaction counts once, so this is a lower bound).
// Usage: TOKENS_FILE=tok_client.json PG_CONTAINER=lawbid-postgres-1 PG_DB=lawbid_perf6 \
//   PATHS=/feed,/conversations node bench/query-count.mjs [n]
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const base = process.env.BASE_URL ?? 'http://localhost:3055/api/v1';
const tokens = JSON.parse(readFileSync(process.env.TOKENS_FILE, 'utf8'));
const n = Number(process.argv[2] ?? 20);
const db = process.env.PG_DB ?? 'lawbid_perf6';
const ctr = process.env.PG_CONTAINER ?? 'lawbid-postgres-1';
const commits = () =>
  Number(
    execFileSync('docker', ['exec', ctr, 'psql', '-U', 'root', '-d', 'postgres', '-Atc',
      `select xact_commit from pg_stat_database where datname='${db}'`]).toString().trim(),
  );
const rows = [];
for (const path of (process.env.PATHS ?? '/me/session,/feed,/conversations,/notifications,/badges').split(',')) {
  await new Promise((r) => setTimeout(r, 700));
  const a = commits();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const res = await fetch(base + path, { headers: { authorization: `Bearer ${tokens[(i + (Number(process.env.OFFSET) || 0)) % tokens.length]}` } });
    await res.arrayBuffer();
  }
  const ms = (performance.now() - t0) / n;
  await new Promise((r) => setTimeout(r, 700));
  const b = commits();
  rows.push({ path, avg_ms: +ms.toFixed(1), db_commits_per_req: +((b - a - 2) / n).toFixed(1) });
}
console.table(rows);
