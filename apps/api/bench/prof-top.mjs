// Top self-time functions of a --cpu-prof file, grouped by file.
// Usage: node bench/prof-top.mjs file.cpuprofile [n]
import { readFileSync } from 'node:fs';

const prof = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const n = Number(process.argv[3] ?? 25);
const byId = new Map(prof.nodes.map((x) => [x.id, x]));
const self = new Map();
const dt = prof.timeDeltas;
prof.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (dt[i] ?? 0)));
const total = [...self.values()].reduce((a, b) => a + b, 0);
const fn = new Map();
const file = new Map();
for (const [id, t] of self) {
  const c = byId.get(id).callFrame;
  const url = c.url.replace(/^.*\/(node_modules\/|dist\/)/, '$1') || '(native)';
  const key = `${c.functionName || '(anon)'}  ${url}:${c.lineNumber}`;
  fn.set(key, (fn.get(key) ?? 0) + t);
  const pkg = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(url)?.[1] ?? (url.startsWith('dist/') ? 'app' : url);
  file.set(pkg, (file.get(pkg) ?? 0) + t);
}
const pct = (t) => ((100 * t) / total).toFixed(1) + '%';
console.log('total ms', (total / 1000).toFixed(0));
console.log('--- by package');
for (const [k, t] of [...file].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(pct(t).padStart(6), k);
console.log('--- by function');
for (const [k, t] of [...fn].sort((a, b) => b[1] - a[1]).slice(0, n)) console.log(pct(t).padStart(6), k);
