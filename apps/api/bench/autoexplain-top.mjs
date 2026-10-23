// Groups auto_explain entries of a postgres log by query shape: count, total
// and max ms. Usage: node bench/autoexplain-top.mjs pg.log [n] [show-plan-of-rank]
import { readFileSync } from 'node:fs';

const text = readFileSync(process.argv[2], 'utf8');
const n = Number(process.argv[3] ?? 20);
const showRank = process.argv[4] ? Number(process.argv[4]) : null;
const blocks = text.split(/\n(?=\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+ UTC )/);
const groups = new Map();
for (const b of blocks) {
  const m = /duration: ([\d.]+) ms\s+plan:\s*\n?Query Text: ([\s\S]*?)\n\s*(?:Limit|Sort|Aggregate|Index|Seq|Nested|Hash|Bitmap|Gather|Merge|Result|Unique|WindowAgg|Append|Subquery|CTE|HashAggregate|GroupAggregate|Parallel|Materialize|Incremental)/.exec(b);
  if (!m) continue;
  const ms = Number(m[1]);
  const sql = m[2].replace(/\s+/g, ' ').trim();
  const key = sql.replace(/\$\d+/g, '$').replace(/\([$,\s]+\)/g, '(…)').slice(0, 400);
  const g = groups.get(key) ?? { n: 0, total: 0, max: 0, plan: '', maxPlan: -1 };
  g.n++;
  g.total += ms;
  g.max = Math.max(g.max, ms);
  if (ms > g.maxPlan) {
    g.maxPlan = ms;
    g.plan = b;
  }
  groups.set(key, g);
}
const ranked = [...groups].sort((a, b) => b[1].total - a[1].total);
ranked.slice(0, n).forEach(([k, g], i) =>
  console.log(`#${i + 1} n=${g.n} total=${g.total.toFixed(0)}ms max=${g.max.toFixed(0)}ms avg=${(g.total / g.n).toFixed(1)}ms\n   ${k.slice(0, 260)}`),
);
if (showRank) console.log('\n' + ranked[showRank - 1][1].plan.slice(0, 6000));
