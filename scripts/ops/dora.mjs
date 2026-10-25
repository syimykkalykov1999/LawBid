#!/usr/bin/env node
// S11-13 (minimal): the four DORA keys from data GitHub already records: every job
// that runs with `environment: production` creates a GitHub Deployment with
// statuses (success / failure / inactive). No table, no extra code in the deploy.
//   node scripts/ops/dora.mjs [--days=30] [--env=production] [--repo=owner/name]
// Prints plain text (and to $GITHUB_STEP_SUMMARY when set).
//   deploy frequency   successful production deployments per week
//   lead time          median hours from the commit's date to its successful deployment
//   change failure     share of deployments whose final status is failure + rollbacks
//   time to restore    median hours from a failed deployment to the next successful one
// The deploys table + admin card of the original plan are NOT built: this reads the
// record GitHub already keeps (and the weekly heartbeat prints it).
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const days = Number(arg('days', 30));
const env = arg('env', 'production');
const repo = arg('repo', process.env.GITHUB_REPOSITORY ?? '');
if (!repo) {
  console.error('--repo=owner/name (or GITHUB_REPOSITORY) is required');
  process.exit(2);
}
const gh = (path) => JSON.parse(execFileSync('gh', ['api', '--paginate', '-H', 'Accept: application/vnd.github+json', path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replace(/\]\s*\[/g, ','));
const since = Date.now() - days * 86400000;

const deployments = gh(`repos/${repo}/deployments?environment=${env}&per_page=100`).filter((d) => Date.parse(d.created_at) >= since);
const rows = [];
for (const d of deployments) {
  const st = gh(`repos/${repo}/deployments/${d.id}/statuses?per_page=20`);
  const final = st.map((s) => s.state).find((s) => ['success', 'failure', 'error'].includes(s));
  rows.push({ sha: d.sha, at: Date.parse(d.created_at), state: final ?? 'pending' });
}
rows.sort((a, b) => a.at - b.at);
const ok = rows.filter((r) => r.state === 'success');
const bad = rows.filter((r) => r.state === 'failure' || r.state === 'error');
const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
const lead = [];
for (const r of ok) {
  try {
    const c = JSON.parse(execFileSync('gh', ['api', `repos/${repo}/commits/${r.sha}`], { encoding: 'utf8' }));
    lead.push((r.at - Date.parse(c.commit.committer.date)) / 3600000);
  } catch {
    // commit not reachable any more
  }
}
const restore = [];
for (const b of bad) {
  const next = ok.find((o) => o.at > b.at);
  if (next) restore.push((next.at - b.at) / 3600000);
}
const f = (x, unit) => (x === null ? 'n/a' : `${x.toFixed(1)} ${unit}`);
const out = [
  `DORA, ${env}, last ${days} days (${repo})`,
  `deployments: ${rows.length} (${ok.length} ok, ${bad.length} failed)`,
  `deploy frequency: ${f((ok.length / days) * 7, 'per week')}`,
  `lead time for changes (median): ${f(median(lead), 'h')}`,
  `change failure rate: ${rows.length ? ((bad.length / rows.length) * 100).toFixed(0) : 'n/a'} %`,
  `time to restore (median): ${f(median(restore), 'h')}`,
].join('\n');
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### DORA\n\`\`\`\n${out}\n\`\`\`\n`);
