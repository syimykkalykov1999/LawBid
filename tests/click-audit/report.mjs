// Builds results/REPORT.md (page → element → expected → actual → status →
// screenshot) from the JSONL rows the specs write. Problems first.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dirname, 'results');
const rows = [];
for (const f of ['admin.jsonl', 'web.jsonl']) {
  const p = join(dir, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) if (line.trim()) rows.push(JSON.parse(line));
}
const order = { ERROR: 0, BROKEN: 1, 'DEAD BUTTON': 2, SKIPPED: 3, WORKS: 4 };
rows.sort((a, b) => order[a.status] - order[b.status] || a.area.localeCompare(b.area) || a.page.localeCompare(b.page));
const count = {};
for (const r of rows) count[`${r.area} ${r.status}`] = (count[`${r.area} ${r.status}`] ?? 0) + 1;
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 300);
const out = [
  '# Click audit report',
  '',
  ...Object.entries(count).map(([k, v]) => `- ${k}: ${v}`),
  '',
  '| area | page | element | expected | actual | status | screenshot |',
  '|---|---|---|---|---|---|---|',
  ...rows.map((r) =>
    `| ${r.area} | ${cell(r.page)} | ${cell(r.element)} | ${cell(r.expected)} | ${cell(r.actual)} | ${r.status} | ${r.screenshot ? cell(r.screenshot.replace(dir + '/', 'results/')) : ''} |`,
  ),
];
writeFileSync(join(dir, 'REPORT.md'), out.join('\n') + '\n');
console.log(`results/REPORT.md: ${rows.length} rows`, count);
