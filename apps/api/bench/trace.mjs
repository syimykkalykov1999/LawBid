// Prints the SQL statements one request makes (needs
//   ALTER DATABASE <db> SET log_statement='all' and the postgres docker container).
// Usage: TOKENS_FILE=tok.json TOKEN_INDEX=250 node bench/trace.mjs /feed
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const base = process.env.BASE_URL ?? 'http://localhost:3055/api/v1';
const tokens = JSON.parse(readFileSync(process.env.TOKENS_FILE, 'utf8'));
const ctr = process.env.PG_CONTAINER ?? 'lawbid-postgres-1';
const verbose = process.env.VERBOSE === '1';
let idx = Number(process.env.TOKEN_INDEX ?? 250);
for (const path of process.argv.slice(2)) {
  await new Promise((r) => setTimeout(r, 1500));
  const since = new Date().toISOString();
  const t0 = performance.now();
  const res = await fetch(base + path, { headers: { authorization: `Bearer ${tokens[idx++ % tokens.length]}` } });
  await res.arrayBuffer();
  const ms = performance.now() - t0;
  await new Promise((r) => setTimeout(r, 900));
  const r = spawnSync('docker', ['logs', '--since', since, ctr], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const lines = (r.stdout + r.stderr).split('\n').filter((l) => /LOG:\s+(execute|statement)/.test(l));
  const sql = lines.map((l) => l.replace(/^.*(execute [^:]*:|statement:)\s*/, '').replace(/\s+/g, ' '));
  const real = sql.filter((q) => q !== 'SELECT 1' && q !== '');
  console.log(`${path} -> ${res.status} in ${ms.toFixed(1)} ms, ${real.length} statements (${sql.length - real.length} pings)`);
  if (verbose) for (const q of real) console.log('  ' + q.slice(0, Number(process.env.WIDTH ?? 200)));
}
