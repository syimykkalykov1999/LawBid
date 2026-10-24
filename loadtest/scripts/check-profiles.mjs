// profiles.json (k6 + cost + caps) and infra/envs/loadtest/profiles/*.tfvars
// (what Terraform builds) describe the same run: fail when they disagree, so
// the cost estimate and the caps are never about a different stack than the
// one that is created.   node check-profiles.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..');
const all = JSON.parse(readFileSync(join(root, 'profiles.json'), 'utf8'));
const lim = all.limits;
let bad = 0;
const fail = (m) => { console.error(`MISMATCH: ${m}`); bad++; };
for (const [name, p] of Object.entries(all.profiles)) {
  if (!p.stack_hours) continue; // local: no AWS stack
  const f = join(repo, 'infra/envs/loadtest/profiles', `${name}.tfvars`);
  if (!existsSync(f)) { fail(`${name}: ${f} missing`); continue; }
  const tf = {};
  for (const l of readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*([a-z_0-9]+)\s*=\s*("?)([^"#\n]*?)\2\s*(#.*)?$/.exec(l);
    if (m) tf[m[1]] = m[3].trim();
  }
  const eq = (k, v) => { if (String(tf[k]) !== String(v)) fail(`${name}: ${k} is ${tf[k]} in tfvars, ${v} in profiles.json`); };
  eq('api_max_tasks', p.api_max_tasks);
  eq('worker_max_tasks', p.worker_max_tasks);
  eq('generator_count', p.generators);
  eq('database_instance_class', p.db);
  eq('redis_node_type', p.redis);
  eq('turn_second_enabled', p.turn_nodes === 2);
  eq('livekit_enabled', !!p.livekit);
  if (p.api_max_tasks > lim.max_api_tasks) fail(`${name}: api_max_tasks ${p.api_max_tasks} > cap ${lim.max_api_tasks}`);
  if (p.generators > lim.max_generators) fail(`${name}: generators ${p.generators} > cap ${lim.max_generators}`);
  const unit = { s: 1, m: 60, h: 3600 };
  const load = p.stages.reduce((a, [d]) => a + Number(d.slice(0, -1)) * unit[d.slice(-1)], 0) / 60;
  if (p.stack_hours * 60 > lim.max_wall_minutes) fail(`${name}: stack_hours ${p.stack_hours} exceeds the ${lim.max_wall_minutes} min wall cap`);
  if (load > lim.max_wall_minutes - 40) fail(`${name}: load ${load} min leaves no room for create + destroy inside ${lim.max_wall_minutes} min`);
}
if (bad) process.exit(1);
console.log('profiles.json and the tfvars agree');
