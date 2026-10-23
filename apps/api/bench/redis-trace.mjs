// Redis commands one request makes (MONITOR on the local redis container,
// filtered to the API's logical db). Usage:
//   TOKENS_FILE=tok.json REDIS_DB=7 TOKEN_INDEX=40 node bench/redis-trace.mjs /feed /me/session
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const base = process.env.BASE_URL ?? 'http://localhost:3055/api/v1';
const tokens = JSON.parse(readFileSync(process.env.TOKENS_FILE, 'utf8'));
const db = process.env.REDIS_DB ?? '7';
const verbose = process.env.VERBOSE === '1';
let idx = Number(process.env.TOKEN_INDEX ?? 40);
const mon = spawn('docker', ['exec', process.env.REDIS_CONTAINER ?? 'lawbid-redis-1', 'redis-cli', 'monitor']);
let buf = '';
mon.stdout.on('data', (d) => (buf += d));
await new Promise((r) => setTimeout(r, 800));
for (const path of process.argv.slice(2)) {
  buf = '';
  const res = await fetch(base + path, { headers: { authorization: `Bearer ${tokens[idx++ % tokens.length]}` } });
  await res.arrayBuffer();
  await new Promise((r) => setTimeout(r, 600));
  const lines = buf.split('\n').filter((l) => l.includes(`[${db} `));
  const cmds = lines.map((l) => l.replace(/^.*?\] /, '').replace(/"/g, '').slice(0, 110));
  const byCmd = {};
  for (const c of cmds) byCmd[c.split(' ')[0].toLowerCase()] = (byCmd[c.split(' ')[0].toLowerCase()] ?? 0) + 1;
  console.log(`${path} -> ${res.status}: ${cmds.length} redis commands`, JSON.stringify(byCmd));
  if (verbose) for (const c of cmds) console.log('   ' + c);
}
mon.kill();
